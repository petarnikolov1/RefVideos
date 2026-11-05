// world-sync: results, fixtures and tables of the world competitions shown on the Results page — the five big
// leagues, the three UEFA club competitions and the national-team competitions (World Cup, Euro, Copa América,
// AFCON, Nations League and the qualifiers) — from ESPN's public scoreboard and standings data.
// Saved in public.football_matches / public.football_standings (league = ESPN's key, e.g. eng.1) and the list of
// competitions in public.football_competitions; the page shows only the ones being played now.
//   {}                 every competition: last, this and next month (every 30 minutes)
//   { season: true }   the competitions being played: every month of the current season (once a day)
//   { only: ["eng.1"] } just these competitions
import * as W from './world.js';

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
const upsert = (table: string, conflict: string, rows: unknown[]) => rest(`${table}?on_conflict=${conflict}`,
  { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });

async function espn(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BGRefereeWatch/1.0)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`HTTP ${r.status}`); }
  return await r.json();
}
// run jobs a few at a time
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

Deno.serve(async (req) => {
  const started = Date.now();
  const key = req.headers.get('x-sync-key') ?? '';
  if (!key || !(await rpc('football_sync_key_ok', { k: key }).catch(() => false)))
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const dry = !!body.dry, now = Date.now();
  const out: Record<string, any> = { ok: true, dry, mode: body.season ? 'season' : 'recent', at: new Date().toISOString(), comps: {} as Record<string, any>, errors: [] as string[] };
  const comps = W.COMPS.filter(c => !Array.isArray(body.only) || body.only.includes(c.key));
  const known: Record<string, any> = {};
  try { for (const k of await rest('football_competitions?select=key,active,season')) known[k.key] = k; } catch (e) { out.errors.push(String((e as Error).message)); }

  // 1. which months to read for each competition
  const jobs: { c: any; m: string }[] = [];
  const recent = [W.ym(now, -1), W.ym(now), W.ym(now, 1)];
  const starts: Record<string, number> = {};
  if (body.season) {
    // the season's first day comes with any answer: read this month first
    await pool(comps.filter(c => known[c.key]?.active), 6, async c => {
      try { const j = await espn(W.scoreboardUrl(c.key, W.ym(now))); starts[c.key] = Date.parse(j?.leagues?.[0]?.season?.startDate) || now - 300 * 864e5; }
      catch (e) { out.errors.push(`${c.key}: ${(e as Error).message}`); }
    });
    for (const c of comps) if (starts[c.key]) for (const m of W.monthsBetween(Math.max(starts[c.key], now - 420 * 864e5), now + 31 * 864e5)) jobs.push({ c, m });
  } else for (const c of comps) for (const m of recent) jobs.push({ c, m });

  // 2. read them
  const got: Record<string, { rows: Map<string, any>; editions: Record<string, string> }> = {};
  await pool(jobs, 6, async ({ c, m }) => {
    try {
      const { edition, rows } = W.parseScoreboard(c.key, await espn(W.scoreboardUrl(c.key, m)));
      const g = got[c.key] ??= { rows: new Map(), editions: {} };
      for (const r of rows) g.rows.set(r.id, r);
      if (rows.length) g.editions[m] = edition;
    } catch (e) { if (out.errors.length < 12) out.errors.push(`${c.key} ${m}: ${(e as Error).message}`); }
  });

  // 3. save matches, tables and the competition list
  await pool(comps, 4, async c => {
    const g = got[c.key];
    const rows = g ? [...g.rows.values()] : [];
    const act = W.activity(rows, now);
    // the current edition: from this month, else the nearest month that had matches
    const months = g ? Object.keys(g.editions).sort((a, b) => Math.abs(Number(a) - Number(W.ym(now))) - Math.abs(Number(b) - Number(W.ym(now)))) : [];
    const edition = (g && (g.editions[W.ym(now)] || (months[0] && g.editions[months[0]]))) || known[c.key]?.season || null;
    const info: Record<string, any> = { matches: rows.length, active: act.active, edition };
    try {
      if (!dry) for (let k = 0; k < rows.length; k += 200) await upsert('football_matches', 'id', rows.slice(k, k + 200));
      if (act.active) {
        const st = W.parseStandings(await espn(W.standingsUrl(c.key)));
        info.table = st.rows.length;
        if (!dry && st.rows.length >= 2) info.tableSaved = await rpc('football_replace_standings', { p_league: c.key, p_season: st.edition || edition, p_rows: st.rows });
      }
      const ed = rows.filter(r => r.season === edition), ea = W.activity(ed, now);
      if (!dry) await upsert('football_competitions', 'key', [{ key: c.key, name: c.name, grp: c.grp, ord: c.ord, season: edition,
        active: act.active, first_match: ea.first, last_match: ea.last, updated_at: new Date().toISOString() }]);
    } catch (e) { info.error = String((e as Error).message ?? e).slice(0, 200); }
    out.comps[c.key] = info;
  });
  out.active = Object.entries(out.comps).filter(([, v]: any) => v.active).map(([k]) => k);
  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (!dry) await rpc('football_log', { details: { world: out } }).catch(() => {});
  return Response.json(out);
});
