// football-sync: keeps public.football_matches / public.football_standings up to date for efbet Лига and
// Mr Bit Втора лига, and finds each finished match's short report and extended report on YouTube.
// Called by pg_cron: results every 30 minutes, videos every 5 minutes (with the key stored in the vault as football_sync_key).
// Репортаж (short) and Разширен (long) are always Gong.bg's; every other channel's report of the match goes to other_videos.
// Each video is checked with YouTube's oEmbed: embed:false means its owner only allows playing it on YouTube.
// It also finds each played round's "Обзор на кръга" (Diema's round review, uploaded by Gong.bg) for public.football_rounds.
// Body (JSON, all optional): { results: true, leagues: ["efbet", "mrbit"] (whose results to read), rounds: 0, videos: 10, dry: false,
//   live: false, ytTest: "search words" }. While matches are played, pg_cron calls it every few minutes for results only, with
//   live: true (live-setup.sql).
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
// Репортаж and Разширен are always Gong.bg's; every other channel's report goes to "other_videos"
const isGong = (v: any) => /gong/i.test(String(v?.channel ?? ''));
// every other channel's report of the match (up to 12), best first: playable ones, the league's channel, then the rest
const MAX_OTHERS = 12;
async function rankOthers(list: any[], keep: any[] = []) {
  const out: any[] = [...keep], seen = new Set(keep.map(v => v.id));
  for (const c of list) {
    if (out.length >= MAX_OTHERS || seen.has(c.id) || isGong(c)) continue;
    seen.add(c.id);
    const e = await embeddable(c.id);
    if (e !== 'gone') out.push({ ...c, embed: e });
  }
  const rank = (v: any) => (v.embed ? 10 : 0) + (/професионална футболна лига|bpfl|efbet/i.test(v.channel) ? 2 : 0);
  return out.map((v, i) => [v, i] as const).sort((a, b) => rank(b[0]) - rank(a[0]) || a[1] - b[1]).map(x => x[0]);
}
// Gong posts its reports within a day or two: recent matches are retried on the back-off schedule (up to 8 times),
// a match older than 10 days gets one search
const LEAGUE_NAME: Record<string, string> = { efbet: 'efbet Лига', mrbit: 'Втора лига' };
const maxTries = (m: any) => Date.now() - Date.parse(m.kickoff) > 10 * 864e5 ? 1 : 8;
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
  const want = new Set(Array.isArray(body.leagues) ? body.leagues : ['efbet', 'mrbit']);
  if (body.results !== false) {
    if (want.has('efbet')) try {
      const ms = L.parseEfbetMatches(await page('https://efbetleague.com/matches'));
      out.efbet = summary(ms);
      if (dry) out.efbet.sample = ms.filter(m => m.round === out.efbet.lastFinishedRound).slice(0, 2);
      if (ms.length >= 50 && !dry) await upsertMatches(ms);
      const table = L.parseEfbetStandings(await page('https://efbetleague.com/standings'));
      out.efbet.table = table.length;
      if (dry) out.efbet.tableTop = table.slice(0, 2);
      else out.efbet.tableSaved = await rpc('football_replace_standings', { p_league: 'efbet', p_season: L.SEASON, p_rows: table });
    } catch (e) { out.efbetError = String((e as Error).message ?? e); }
    if (want.has('mrbit')) try {
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

  // 2. "Обзор на кръга" (Diema's round review show, uploaded by Gong.bg) for every played round.
  //    A round is searched once most of it has been played, then after 3, 6, 12 and 24 hours (Gong posts the show a day
  //    or two later, sometimes after an international break); a round older than two weeks gets two searches.
  //    One search usually brings up the reviews of other rounds too, and those are saved as well.
  const nr = Math.max(0, Math.min(Number(body.rounds ?? 0), 10));
  if (nr && !dry) {
    const rv: Record<string, any> = out.rounds = { searches: 0, found: [] as string[], errors: [] as string[] };
    try {
      const info: any[] = await rpc('football_round_info', { p_season: L.SEASON });
      const now = Date.now(), have = new Set(info.filter(r => r.has_review).map(r => r.league + '|' + r.round));
      const due = info.filter(r => r.played > 0 && !r.has_review && Date.parse(r.main_end) < now
          && r.tries < (now - Date.parse(r.main_end) > 14 * 864e5 ? 2 : 12)
          && (!r.checked_at || now - Date.parse(r.checked_at) >= [0, 3, 6, 12, 24][Math.min(r.tries, 4)] * 3600e3))
        .sort((a, b) => Number(!!a.checked_at) - Number(!!b.checked_at) || Date.parse(b.main_end) - Date.parse(a.main_end));
      const save = (row: Record<string, unknown>) => rest('football_rounds?on_conflict=league,season,round', { method: 'POST',
        body: JSON.stringify([{ season: L.SEASON, updated_at: new Date().toISOString(), ...row }]), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      for (const r of due) {
        if (rv.searches >= nr || Date.now() - started > 40000) break;
        const k = r.league + '|' + r.round;
        if (have.has(k)) continue;                                   // found by an earlier search in this run
        if (rv.searches) await sleep(1800 + Math.random() * 1200);
        rv.searches++;
        let vids: any[];
        try { vids = await youtube(`Обзор на кръга ${r.league === 'efbet' ? 'efbet Лига' : 'Втора лига'} ${r.round} кръг`); }
        catch (e) { rv.errors.push(String((e as Error).message)); break; }   // YouTube refused: try again next run
        for (const [key, video] of L.pickRoundReviews(vids, info)) {
          if (have.has(key)) continue;
          const e = await embeddable(video.id);
          if (e === 'gone') continue;
          const [league, round] = key.split('|');
          await save({ league, round: Number(round), review: { ...video, embed: e } });
          have.add(key);
          rv.found.push(`${LEAGUE_NAME[league] ?? league} ${round}${e ? '' : ' (YouTube only)'}`);
        }
        if (!have.has(k)) await save({ league: r.league, round: r.round, tries: r.tries + 1, checked_at: new Date().toISOString() });
      }
    } catch (e) { out.roundsError = String((e as Error).message ?? e); }
  }

  // 3. videos for finished matches that don't have them yet (a few per run, newest first)
  const n = Math.max(0, Math.min(Number(body.videos ?? 6), 40));
  if (n && !dry) {
    const v: Record<string, any> = out.videos = { checked: 0, short: 0, long: 0, others: 0, flagged: 0, searches: 0, embedUnknown: 0, stoppedEarly: false, errors: [] as string[], found: [] as string[] };
    try {
      const queue: any[] = await rpc('football_video_queue', { n });
      const teamRows: any[] = await rest(`football_standings?select=league,team_name&season=eq.${encodeURIComponent(L.SEASON)}`);
      const teams: Record<string, Set<string>> = { efbet: new Set(), mrbit: new Set() };
      for (const t of teamRows) teams[t.league]?.add(t.team_name);
      for (const m of queue) { teams[m.league]?.add(m.home_name); teams[m.league]?.add(m.away_name); }
      const aliases = { efbet: L.teamAliases([...teams.efbet]), mrbit: L.teamAliases([...teams.mrbit]) } as Record<string, any>;
      const qnames = { efbet: L.queryNames([...teams.efbet]), mrbit: L.queryNames([...teams.mrbit]) } as Record<string, Map<string, string>>;
      for (const m of queue) {
        if (Date.now() - started > 100000) break;                       // stay well inside the time limit
        const cur: Record<string, any> = { short: m.short_video, long: m.long_video };
        const patch: Record<string, any> = {};
        let others: any[] | null = m.other_videos ?? null;
        const moved: any[] = [];
        // 1. Репортаж / Разширен must be Gong's: anything else moves to the other reports;
        //    videos saved before the "playable here?" check get checked now
        for (const k of ['short', 'long']) {
          const sv = cur[k];
          if (!sv) continue;
          if (!isGong(sv)) { cur[k] = null; patch[k + '_video'] = null; moved.push(sv); others = null; continue; }
          if (sv.embed !== undefined) continue;
          const e = await embeddable(sv.id);
          cur[k] = e === 'gone' ? null : { ...sv, embed: e };
          patch[k + '_video'] = cur[k];
          v.flagged++;
        }
        // 2. search when a Gong report is missing (on the back-off schedule), or once to collect the other reports
        const wantShort = !cur.short, wantLong = !cur.long;
        const gongWanted = (wantShort || wantLong) && m.video_tries < maxTries(m);
        const due = !m.videos_checked_at || Date.now() - Date.parse(m.videos_checked_at) >= BACKOFF_H[Math.min(m.video_tries, 4)] * 3600e3;
        const searchGong = gongWanted && due, wantOthers = others === null;
        let failed = false;
        if (searchGong || wantOthers) {
          const home = qnames[m.league]?.get(m.home_name) ?? L.searchName(m.home_name), away = qnames[m.league]?.get(m.away_name) ?? L.searchName(m.away_name);
          let vids: any[] = [];
          // YouTube slows down rapid searches: pause between them, and stop the whole run on the first refusal
          const search = async (q: string) => {
            if (failed) return;
            if (v.searches) await sleep(1800 + Math.random() * 1200);
            v.searches++;
            try { vids = vids.concat(await youtube(q)); } catch (e) { failed = true; v.errors.push(String((e as Error).message)); }
          };
          let p: any = { shorts: [], longs: [], all: [] };
          const best: Record<string, any> = {};
          const pickAll = async () => {
            p = L.pickVideos(m, vids, aliases[m.league]);
            if (wantShort) best.short = await choose(p.shorts.filter(isGong));
            if (wantLong) best.long = await choose(p.longs.filter(isGong));
          };
          await search(`${home} ${away} ${m.home_score}:${m.away_score}`);
          await pickAll();
          if (searchGong && wantShort && !best.short) { await search(`${home} ${away} репортаж`); await pickAll(); }
          // the 2nd league: Gong covers only some matches, so its extended report is looked for when it has the short one
          if (searchGong && wantLong && !best.long && (m.league === 'efbet' || cur.short || best.short)) { await search(`${home} ${away} разширен репортаж`); await pickAll(); }
          for (const k of ['short', 'long']) if (best[k] && !cur[k]) { cur[k] = best[k]; patch[k + '_video'] = best[k]; v[k as 'short' | 'long']++; }
          if (!failed || vids.length) {
            const before = JSON.stringify(others ?? null);
            others = await rankOthers([...moved, ...p.all], others ?? []);
            if (JSON.stringify(others) !== before) { patch.other_videos = others; if (others.length) v.others++; }
          }
          // a refused search is not counted as a try (the match comes back next run); anything already found is kept
          if (searchGong && !failed) { patch.video_tries = m.video_tries + 1; patch.videos_checked_at = new Date().toISOString(); }
        }
        if (Object.keys(patch).length) await rest(`football_matches?id=eq.${encodeURIComponent(m.id)}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' } });
        const tag = (k: string) => patch[k + '_video'] && patch[k + '_video'].id !== (k === 'short' ? m.short_video : m.long_video)?.id ? `${k}${patch[k + '_video'].embed ? '' : ' (YouTube only)'}` : '';
        const got = [tag('short'), tag('long'), patch.other_videos?.length ? `${patch.other_videos.length} other` : ''].filter(Boolean).join(' + ');
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
  // the calls made every few minutes during matches (live: true) are logged only when something failed
  if (!dry && !(body.live && !out.efbetError && !out.mrbitError)) await rpc('football_log', { details: out }).catch(() => {});
  return Response.json(out);
});
