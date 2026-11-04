// football-sync: keeps public.football_matches / public.football_standings up to date for efbet Лига and
// Mr Bit Втора лига, and finds each finished match's short report and extended report on YouTube.
// Called by pg_cron: results every 30 minutes, videos every 5 minutes (with the key stored in the vault as football_sync_key).
// Each video is checked with YouTube's oEmbed: embed:false means its owner only allows playing it on YouTube.
// Body (JSON, all optional): { results: true, videos: 10, dry: false, ytTest: "search words" }
import * as L from './lib.js';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const PAGE_HEADERS = { 'User-Agent': L.UA, 'Accept-Language': 'bg-BG,bg;q=0.9,en;q=0.5', Accept: 'text/html,application/xhtml+xml' };

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: unknown) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

async function page(url: string) {
  const r = await fetch(url, { headers: PAGE_HEADERS, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return await r.text();
}
async function youtube(q: string) {
  const r = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&hl=bg&gl=BG', {
    headers: { 'User-Agent': L.UA, 'Accept-Language': 'bg-BG,bg;q=0.9', Cookie: 'SOCS=CAI; CONSENT=YES+cb' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('YouTube HTTP ' + r.status);
  const html = await r.text();
  if (!/ytInitialData/.test(html)) throw new Error('YouTube answered without search results (busy or consent page)');
  return L.parseYouTube(html);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Can the video be played on other sites? YouTube's oEmbed answers 401 when the owner has turned that off.
// true = playable here, false = only on YouTube, 'gone' = deleted/private. Unknown answers count as playable
// (the page still offers the YouTube button), so a YouTube hiccup never blocks the queue.
const embedCache = new Map<string, boolean | 'gone'>();
let embedUnknown = 0;
async function embeddable(id: string): Promise<boolean | 'gone'> {
  if (embedCache.has(id)) return embedCache.get(id)!;
  let res: boolean | 'gone' = true;
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id),
      { headers: { 'User-Agent': L.UA }, signal: AbortSignal.timeout(8000) });
    await r.body?.cancel();
    if (r.status === 401) res = false;
    else if (r.status === 400 || r.status === 403 || r.status === 404) res = 'gone';
    else if (r.status !== 200) embedUnknown++;
  } catch { embedUnknown++; }
  embedCache.set(id, res);
  return res;
}
// first playable video of a ranked list; if none is playable, the best one (to open on YouTube)
async function choose(list: any[]) {
  let fallback: any = null;
  for (const c of (list ?? []).slice(0, 4)) {
    const e = await embeddable(c.id);
    if (e === 'gone') continue;
    if (e) return { ...c, embed: true };
    fallback ??= { ...c, embed: false };
  }
  return fallback;
}
const MAX_TRIES: Record<string, number> = { efbet: 8, mrbit: 4 };
const BACKOFF_H = [0, 3, 12, 24, 72];

async function upsertMatches(rows: any[]) {
  for (let i = 0; i < rows.length; i += 100)
    await rest('football_matches?on_conflict=id', { method: 'POST', body: JSON.stringify(rows.slice(i, i + 100)),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
}
const summary = (ms: any[]) => {
  const by: Record<string, number> = {};
  for (const m of ms) by[m.status] = (by[m.status] ?? 0) + 1;
  const rounds = ms.map(m => m.round).filter(Number.isFinite);
  return { matches: ms.length, byStatus: by, rounds: rounds.length ? [Math.min(...rounds), Math.max(...rounds)] : [],
    lastFinishedRound: Math.max(0, ...ms.filter(m => m.status === 'finished').map(m => m.round)) };
};

Deno.serve(async (req) => {
  const started = Date.now();
  const key = req.headers.get('x-sync-key') ?? '';
  if (!key || !(await rpc('football_sync_key_ok', { k: key }).catch(() => false)))
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const dry = !!body.dry;
  const out: Record<string, any> = { ok: true, dry, at: new Date().toISOString() };

  if (body.ytTest) {
    try { out.ytTest = (await youtube(String(body.ytTest))).slice(0, 20); } catch (e) { out.ytTest = String(e); }
    return Response.json(out);
  }

  // 1. results, fixtures and standings
  if (body.results !== false) {
    try {
      const ms = L.parseEfbetMatches(await page('https://efbetleague.com/matches'));
      out.efbet = summary(ms);
      if (dry) out.efbet.sample = ms.filter(m => m.round === out.efbet.lastFinishedRound).slice(0, 2);
      if (ms.length >= 50 && !dry) await upsertMatches(ms);
      const table = L.parseEfbetStandings(await page('https://efbetleague.com/standings'));
      out.efbet.table = table.length;
      if (dry) out.efbet.tableTop = table.slice(0, 2);
      else out.efbet.tableSaved = await rpc('football_replace_standings', { p_league: 'efbet', p_season: L.SEASON, p_rows: table });
    } catch (e) { out.efbetError = String((e as Error).message ?? e); }
    try {
      const html = await page('https://mr-bit.bg/vtora-liga/');
      const ms = L.parseMrbit(html);
      out.mrbit = summary(ms);
      if (dry) out.mrbit.sample = ms.filter(m => m.round === out.mrbit.lastFinishedRound).slice(0, 2).concat(ms.filter(m => m.status === 'scheduled').slice(0, 1));
      if (ms.length >= 50 && !dry) await upsertMatches(ms);
      const table = L.parseMrbitStandings(html, ms);
      out.mrbit.table = table.length;
      if (dry) out.mrbit.tableTop = table.slice(0, 2);
      else out.mrbit.tableSaved = await rpc('football_replace_standings', { p_league: 'mrbit', p_season: L.SEASON, p_rows: table });
    } catch (e) { out.mrbitError = String((e as Error).message ?? e); }
  }

  // 2. videos for finished matches that don't have them yet (a few per run, newest first)
  const n = Math.max(0, Math.min(Number(body.videos ?? 6), 40));
  if (n && !dry) {
    const v: Record<string, any> = out.videos = { checked: 0, short: 0, long: 0, flagged: 0, searches: 0, embedUnknown: 0, stoppedEarly: false, errors: [] as string[], found: [] as string[] };
    try {
      const queue: any[] = await rpc('football_video_queue', { n });
      const teamRows: any[] = await rest(`football_standings?select=league,team_name&season=eq.${encodeURIComponent(L.SEASON)}`);
      const teams: Record<string, Set<string>> = { efbet: new Set(), mrbit: new Set() };
      for (const t of teamRows) teams[t.league]?.add(t.team_name);
      for (const m of queue) { teams[m.league]?.add(m.home_name); teams[m.league]?.add(m.away_name); }
      const aliases = { efbet: L.teamAliases([...teams.efbet]), mrbit: L.teamAliases([...teams.mrbit]) } as Record<string, any>;
      for (const m of queue) {
        if (Date.now() - started > 100000) break;                       // stay well inside the time limit
        const cur: Record<string, any> = { short: m.short_video, long: m.long_video };
        const patch: Record<string, any> = {};
        // 1. videos saved before the "playable here?" check get checked now
        let justBlocked = false;
        for (const k of ['short', 'long']) {
          const sv = cur[k];
          if (!sv || sv.embed !== undefined) continue;
          const e = await embeddable(sv.id);
          cur[k] = e === 'gone' ? null : { ...sv, embed: e };
          patch[k + '_video'] = cur[k];
          v.flagged++;
          if (e !== true) justBlocked = true;
        }
        // 2. look for a missing video, or a playable one instead of one that only plays on YouTube
        const wantShort = !cur.short || cur.short.embed === false;
        const wantLong = m.league === 'efbet' ? (!cur.long || cur.long.embed === false) : !cur.long;
        const due = !m.videos_checked_at || Date.now() - Date.parse(m.videos_checked_at) >= BACKOFF_H[Math.min(m.video_tries, 4)] * 3600e3;
        const searchNow = (wantShort || (m.league === 'efbet' && wantLong)) && m.video_tries < (MAX_TRIES[m.league] ?? 4) && (due || justBlocked);
        let failed = false;
        if (searchNow) {
          const home = L.searchName(m.home_name), away = L.searchName(m.away_name);
          let vids: any[] = [];
          // YouTube slows down rapid searches: pause between them, and stop the whole run on the first refusal
          const search = async (q: string) => {
            if (failed) return;
            if (v.searches) await sleep(1800 + Math.random() * 1200);
            v.searches++;
            try { vids = vids.concat(await youtube(q)); } catch (e) { failed = true; v.errors.push(String((e as Error).message)); }
          };
          const better = (k: string, c: any) => c && (!cur[k] || (cur[k].embed === false && c.embed && c.id !== cur[k].id));
          let best: Record<string, any> = {};
          const pickAll = async () => {
            const p = L.pickVideos(m, vids, aliases[m.league]);
            if (wantShort) best.short = await choose(p.shorts);
            if (wantLong) best.long = await choose(p.longs);
          };
          await search(`${home} ${away} ${m.home_score}:${m.away_score}`);
          await pickAll();
          if (wantShort && !best.short?.embed) { await search(`${home} ${away} репортаж`); await pickAll(); }
          if (m.league === 'efbet' && wantLong && !best.long?.embed) { await search(`${home} ${away} разширен репортаж`); await pickAll(); }
          for (const k of ['short', 'long']) if (better(k, best[k])) { cur[k] = best[k]; patch[k + '_video'] = best[k]; v[k as 'short' | 'long']++; }
          // a refused search is not counted as a try (the match comes back next run); anything already found is kept
          if (!failed) { patch.video_tries = m.video_tries + 1; patch.videos_checked_at = new Date().toISOString(); }
        }
        if (Object.keys(patch).length) await rest(`football_matches?id=eq.${encodeURIComponent(m.id)}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' } });
        const tag = (k: string) => patch[k + '_video'] && patch[k + '_video'].id !== (k === 'short' ? m.short_video : m.long_video)?.id ? `${k}${patch[k + '_video'].embed ? '' : ' (YouTube only)'}` : '';
        const got = [tag('short'), tag('long')].filter(Boolean).join(' + ');
        if (got) v.found.push(`${m.home_name} – ${m.away_name}: ${got}`);
        if (failed) { v.stoppedEarly = true; break; }
        v.checked++;
      }
      v.embedUnknown = embedUnknown;
      v.errors = [...new Set(v.errors)].slice(0, 5);
      v.found = v.found.slice(0, 40);
    } catch (e) { out.videosError = String((e as Error).message ?? e); }
  }
  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (!dry) await rpc('football_log', { details: out }).catch(() => {});
  return Response.json(out);
});
