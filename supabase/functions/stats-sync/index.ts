// stats-sync: what happened in each First and Second League match — goals, cards, substitutions, VAR reviews and each
// half's added time, minute by minute — from bulgarian-football.com's statistics, one page per round:
//   archive/2026-2027/stats/a-<round>.html (efbet Лига), b-<round>.html (Втора лига)
// Each match's block is paired with our match (the clubs' names, the day and time, the round) and saved in match_events.
// A round's page is read while its matches are recent (begun in the last 4 days: the page fills in during and after the
// match) or, for three weeks, while a finished match still has nothing.
// Called by pg_cron every 30 minutes with the key stored in the vault as football_sync_key.
// Body (JSON, all optional): { all: false (every round of the season again), leagues: ['efbet', 'mrbit'], dry, round: n }
import * as S from './stats.js';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: unknown) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const upsert = async (table: string, conflict: string, rows: any[]) => {
  for (let i = 0; i < rows.length; i += 100)
    await rest(`${table}?on_conflict=${conflict}`, { method: 'POST', body: JSON.stringify(rows.slice(i, i + 100)), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
};
async function page(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': S.UA, 'Accept-Language': 'bg-BG,bg;q=0.9' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new TextDecoder().decode(new Uint8Array(await r.arrayBuffer()));
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  const started = Date.now();
  const key = req.headers.get('x-sync-key') ?? '';
  if (!key || !(await rpc('football_sync_key_ok', { k: key }).catch(() => false)))
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const dry = !!body.dry, only = Array.isArray(body.leagues) ? new Set(body.leagues) : null;
  const out: Record<string, any> = { ok: true, dry, at: new Date().toISOString(), mode: 'stats-sync' };
  try {
    const have = new Set((await rest('match_events?select=match_id&limit=10000')).map((r: any) => r.match_id));
    for (const [lg, letter] of S.STATS_PAGES) {
      if (only && !only.has(lg)) continue;
      const o: Record<string, any> = out[lg] = { rounds: [], saved: 0, unmatched: [] as string[] };
      const ms = await rest(`football_matches?select=id,round,kickoff,status,home_name,away_name&league=eq.${lg}&season=eq.${encodeURIComponent(S.SEASON)}&limit=1000`);
      const now = Date.now(), age = (m: any) => now - Date.parse(m.kickoff);
      const due = (m: any) => m.round && m.kickoff && age(m) > 15 * 60e3 &&
        (body.all || age(m) < 4 * 864e5 || (m.status === 'finished' && !have.has(m.id) && age(m) < 21 * 864e5));
      const rounds = body.round ? [Number(body.round)] : [...new Set(ms.filter(due).map((m: any) => m.round as number))].sort((a, b) => a - b);
      for (const r of rounds.slice(0, body.all ? 40 : 8)) {
        if (Date.now() - started > 100000) { o.stopped = 'time'; break; }
        const url = S.statsUrl(letter, r);
        let entries: any[];
        try { entries = S.parseBfcStats(await page(url)); }
        catch (e) { o.rounds.push({ r, error: String((e as Error).message ?? e).slice(0, 120) }); continue; }   // a round not written yet
        const pa = S.assign(entries.map((e: any) => ({ ...e, fixture: e.home + ' - ' + e.away })), ms.filter((m: any) => m.round === r), r);
        const rows = pa.assigned.map((x: any) => ({ match_id: x.match.id, league: lg, round: r, source: url + '#' + x.item.no, events: x.item.events,
          stop: [x.item.stop[0] ?? null, x.item.stop[1] ?? null], codes: x.item.codes, updated_at: new Date().toISOString() }));
        if (dry) o.sample = o.sample || rows[0];
        else if (rows.length) await upsert('match_events', 'match_id', rows);
        o.rounds.push({ r, read: entries.length, saved: rows.length });
        o.saved += rows.length; o.unmatched.push(...pa.unmatched.map((f: string) => `${r}: ${f}`));
        await sleep(300);
      }
      o.unmatched = o.unmatched.slice(0, 20);
    }
  } catch (e) { out.ok = false; out.error = String((e as Error).message ?? e); }
  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (!dry) await rpc('football_log', { details: out }).catch(() => {});
  return Response.json(out);
});
