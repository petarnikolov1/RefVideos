// sheets-sync: the match sheets (the teams' starting elevens, substitutes and coaches, and the refereeing team) of
// efbet Лига, Втора лига and the Third League South-West, from ebfu.net (БФС Електронно първенство) into
// public.match_sheets, one row per match of public.football_matches.
//
// Called by pg_cron every 10 minutes (sheets-setup.sql), with the key stored in the vault as football_sync_key.
// Each run:
//   * the matches from 6 hours before to 6 hours after kick-off: the clubs fill the teams in about an hour or two
//     before; until a sheet has both elevens it is read every run, then every 20 minutes (the committee can still change
//     a referee), and once more after kick-off (the final sheet); then it is left alone;
//   * with what is left of the run (max sheets), this season's earlier matches without a sheet, newest first.
// One request lists a day's matches; two read a match's sheet (choosing the match, then the sheet). Our matches are
// paired with ebfu's by league, day, time and the words of the teams' names and towns (ebfu.js, sheets.test.mjs).
// Body (JSON, all optional): { max: 12 (sheets read in a run), backfill: true, ids: ["efbet:…"] (read these only),
//   dry: false (read and show, don't save) }.
import * as E from './ebfu.js';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const MIN = 60e3, HOUR = 60 * MIN;

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: unknown) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const inList = (ids: string[]) => `in.(${ids.map(id => `"${String(id).replace(/"/g, '')}"`).join(',')})`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const sofiaDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });   // YYYY-MM-DD

/* ───────────── ebfu.net ───────────── */
const form = (data: Record<string, string>) => ({ method: 'POST', redirect: 'manual' as RequestRedirect,
  headers: { 'User-Agent': UA, 'Accept-Language': 'bg-BG,bg;q=0.9', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data), signal: AbortSignal.timeout(20000) });
async function ebfuList(day: string) {
  const r = await fetch(E.BASE, form({ curDate: day, selectDateBtn: '1' }));
  if (!r.ok) throw new Error(`ebfu.net list ${day} → HTTP ${r.status}`);
  return E.parseList(await r.text());
}
// choosing the match puts it in the PHP session; the sheet page then shows it
async function ebfuSheet(day: string, code: string) {
  const r0 = await fetch(E.BASE, form({ curDate: day, showMatchBtn: code }));
  await r0.text();
  const cookie = (r0.headers.getSetCookie?.() ?? [r0.headers.get('set-cookie') ?? '']).map(c => c.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) throw new Error('ebfu.net gave no session');
  const r = await fetch(E.BASE + 'showTeamList.php', { headers: { 'User-Agent': UA, 'Accept-Language': 'bg-BG,bg;q=0.9', Cookie: cookie }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`ebfu.net sheet ${code} → HTTP ${r.status}`);
  return E.parseSheet(await r.text());
}

type Match = { id: string; league: string; kickoff: string; home_name: string; away_name: string };
type Sheet = { match_id: string; found: boolean; complete: boolean; fetched_at: string | null; tries: number; home?: any; away?: any };

// is it time to read this match's sheet again?
function due(m: Match, s: Sheet | undefined, now: number) {
  const t = Date.parse(m.kickoff), f = s && s.fetched_at ? Date.parse(s.fetched_at) : 0, age = now - f;
  if (!s) return true;
  if (!s.found) return age > (s.tries >= 3 ? 60 : 9) * MIN;            // not paired yet: again soon, later once an hour
  if (now < t) return s.complete ? age > 19 * MIN : age > 9 * MIN;      // before kick-off
  return f < t + 10 * MIN && now > t + 15 * MIN;                        // once after kick-off: the final sheet
}

Deno.serve(async (req) => {
  const started = Date.now();
  const key = req.headers.get('x-sync-key') ?? '';
  if (!key || !(await rpc('football_sync_key_ok', { k: key }).catch(() => false)))
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const max = Math.max(1, Math.min(40, Number(body.max) || 12)), dry = !!body.dry, now = Date.now();
  const out: Record<string, any> = { ok: true, at: new Date(now).toISOString(), live: 0, backfill: 0, read: 0, saved: 0, complete: 0, unpaired: [] as string[], errors: [] as string[] };
  try {
    // the matches to read: asked for by id, or the ones around now that are due, then the season's earlier ones
    let todo: Match[] = [];
    const sel = 'select=id,league,kickoff,home_name,away_name';
    if (Array.isArray(body.ids) && body.ids.length) todo = await rest(`football_matches?${sel}&id=${inList(body.ids.map(String))}`);
    else {
      const near: Match[] = await rest(`football_matches?${sel}&league=in.(efbet,mrbit,sw3)&kickoff=gte.${new Date(now - 6 * HOUR).toISOString()}&kickoff=lte.${new Date(now + 6 * HOUR).toISOString()}&order=kickoff`);
      const have: Sheet[] = near.length ? await rest(`match_sheets?select=match_id,found,complete,fetched_at,tries&match_id=${inList(near.map(m => m.id))}`) : [];
      const by = new Map(have.map(s => [s.match_id, s]));
      todo = near.filter(m => due(m, by.get(m.id), now)).slice(0, max);
      out.live = todo.length;
      if (body.backfill !== false && todo.length < max) {
        const old: Match[] = await rpc('sheets_backfill', { p_limit: max - todo.length });
        todo.push(...old); out.backfill = old.length;
      }
    }
    if (!todo.length) return Response.json({ ...out, seconds: (Date.now() - started) / 1000 });
    const prev: Sheet[] = await rest(`match_sheets?select=match_id,found,complete,fetched_at,tries,home,away&match_id=${inList(todo.map(m => m.id))}`)
      .catch(e => { if (dry) return []; throw e; });     // a dry run works before the table exists
    const prevBy = new Map(prev.map(s => [s.match_id, s]));

    // a day at a time: its list, then the sheets
    const days = new Map<string, Match[]>();
    for (const m of todo) { const d = sofiaDay(m.kickoff); if (!days.has(d)) days.set(d, []); days.get(d)!.push(m); }
    const rows: any[] = [], shown: any[] = [];
    for (const [day, ms] of days) {
      let list: any[] = [];
      try { list = await ebfuList(day); } catch (e) { out.errors.push(String((e as Error).message ?? e)); continue; }
      const pairs = E.pair(ms, list);
      for (const m of ms) {
        const e = pairs.get(m.id), p = prevBy.get(m.id), at = new Date().toISOString();
        if (!e) {
          out.unpaired.push(`${day} ${m.home_name} – ${m.away_name}`);
          if (!p || !p.found) rows.push({ match_id: m.id, league: m.league, kickoff: m.kickoff, found: false, tries: (p?.tries ?? 0) + 1, fetched_at: at, updated_at: at });
          continue;
        }
        try {
          await sleep(300);                         // politely, one request after another
          const s = await ebfuSheet(day, e.id);
          out.read++;
          if (!E.readable(s)) { out.errors.push(`${e.id}: a page without a sheet on it`); continue; }
          // the session showed another match (it can happen if two runs meet): left for the next run
          if (s.home && E.tokens(s.home.name).join() !== E.tokens(e.home).join()) { out.errors.push(`${e.id}: the sheet showed ${s.home.name}`); continue; }
          const team = (i: number, head: any) => {
            const t = s.teams[i];
            return { name: (t && t.name) || head?.name || '', town: head?.town || '', coach: t?.coach ?? null, xi: t?.xi ?? [], subs: t?.subs ?? [] };
          };
          const done = E.complete(s);
          const row: any = { match_id: m.id, league: m.league, kickoff: m.kickoff, ebfu_id: e.id, found: true, complete: done,
            officials: s.officials, stadium: s.stadium || e.venue || null, competition: s.competition || null, tries: 0, fetched_at: at, updated_at: at,
            home: team(0, s.home), away: team(1, s.away) };
          // a complete sheet isn't replaced by a re-read without the teams (only its referees and the time are)
          if (p && p.complete && !done) { row.complete = true; row.home = p.home; row.away = p.away; }
          if (row.complete) out.complete++;
          rows.push(row);
          if (dry) shown.push({ match: `${m.home_name} – ${m.away_name}`, ebfu: `${e.home} – ${e.away}`, code: e.id, complete: done,
            officials: s.officials.map(o => `${o.r} ${o.n}`), home: `${row.home.xi.length}+${row.home.subs.length} (${row.home.coach})`, away: `${row.away.xi.length}+${row.away.subs.length} (${row.away.coach})` });
        } catch (err) { out.errors.push(`${e.id}: ${String((err as Error).message ?? err)}`); }
      }
    }
    if (dry) out.sheets = shown;
    else if (rows.length) {
      // rows with the same columns go together (an unpaired match only updates its tries, not a sheet read before)
      const groups = new Map<string, any[]>();
      for (const r of rows) { const k = Object.keys(r).sort().join(); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
      for (const g of groups.values())
        await rest('match_sheets?on_conflict=match_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(g) });
      out.saved = rows.length;
    }
  } catch (e) { out.ok = false; out.errors.push(String((e as Error).message ?? e)); }
  return Response.json({ ...out, seconds: (Date.now() - started) / 1000 });
});
