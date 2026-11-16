// news-sync: searches Google News and Bing News for refereeing stories and saves them in public.news_articles.
// The site only reads the saved articles, so nothing is searched in the browser.
//   { recent: true }   the last few days (every 30 minutes)
//   { backfill: true } one older 2-week window of the season per run, newest first; once the whole season has been
//                      searched it rests for a day, then goes through it again to catch anything published late
//   + intl: true       the same for the international media of the World sections (English-language outlets and the
//                      English editions of foreign ones; intl.js), with their own schedule and their own place in the season
//   { matches: true }  each played match of the Bulgarian leagues on its own ("Рилски спортист" Хебър), a few times after
//                      its kickoff (matches.js): its refereeing articles, and its coverage (kind 'match': shown under the
//                      match on Results only). + ids: [match ids] searches just those now; + dry: nothing is saved
// Articles keep the time they were first found (found_at), so the page can mark what is new since a visit.
import * as N from './news.js';
import * as INTL from './intl.js';
import * as MS from './matches.js';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const RELAY = 'https://refvideos.pages.dev/feed?url=';     // the site's own feed relay on Cloudflare, if Google refuses us

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: unknown) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const isFeed = (t: string) => /<(rss|channel)[\s>]/i.test(t);

async function feed(url: string, via: Record<string, number>, lang = 'bg') {
  const google = url.startsWith('https://news.google.com');
  let err = '';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': N.UA, 'Accept-Language': (INTL.ACCEPT_LANG as Record<string, string>)[lang] ?? 'bg-BG,bg;q=0.9,en;q=0.6',
      Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8', ...(google ? { Cookie: N.GOOGLE_COOKIES } : {}) }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    if (r.ok && isFeed(t)) { via.direct = (via.direct ?? 0) + 1; return N.parseRss(t); }
    err = `HTTP ${r.status}${r.ok ? ' (not a feed)' : ''}`;
  } catch (e) { err = String((e as Error).message ?? e); }
  try {
    const r = await fetch(RELAY + encodeURIComponent(url), { signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    if (r.ok && isFeed(t)) { via.relay = (via.relay ?? 0) + 1; return N.parseRss(t); }
    err += ` · relay HTTP ${r.status}`;
  } catch (e) { err += ' · relay ' + String((e as Error).message ?? e); }
  throw new Error(err);
}

type Task = { kind: 'google' | 'bing'; q: any; url: string };
async function scan(tasks: Task[], started: number) {
  const st = { searches: tasks.length, worked: 0, failed: 0, items: 0, kept: 0, inserted: 0, via: {} as Record<string, number>, errors: [] as string[] };
  const rows = new Map<string, any>();
  let i = 0;
  const worker = async () => {
    while (i < tasks.length && Date.now() - started < 110000) {
      const t = tasks[i++];
      try {
        const items = await feed(t.url, st.via, t.q.lang);
        st.worked++; st.items += items.length;
        for (const it of items) {
          const a = N.toArticle(it, t.kind, t.q);
          if (!a) continue;
          const ex = rows.get(a.aid);
          if (!ex) { rows.set(a.aid, a); continue; }
          ex.cats = [...new Set([...ex.cats, ...a.cats])].filter((c, _, all) => c !== 'other' || all.length === 1);
          ex.score = Math.max(ex.score, a.score);
          if (!ex.descr && a.descr) ex.descr = a.descr;
        }
      } catch (e) { st.failed++; if (st.errors.length < 5) st.errors.push(String((e as Error).message ?? e).slice(0, 160)); }
      await sleep(250 + Math.random() * 250);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  st.searches = i;
  st.kept = rows.size;
  const list = [...rows.values()];
  for (let k = 0; k < list.length; k += 200) st.inserted += Number(await rpc('news_upsert', { p_rows: list.slice(k, k + 200) }) ?? 0);
  return st;
}
// the season's matches of the Bulgarian leagues and the European cups (for each club's nearest match)
async function seasonMatches() {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`football_matches?select=id,league,kickoff,status,home_name,away_name&league=in.(${MS.ALL_LEAGUES.join(',')})` +
      `&kickoff=gte.${N.SEASON_START}T00:00:00Z&order=kickoff.asc,id.asc&offset=${from}&limit=1000`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}
async function scanMatches(body: any, started: number) {
  const ctx = MS.context(await seasonMatches());
  const state = (await rpc('news_state_get', { p_k: 'matches' }).catch(() => null)) ?? {};
  const seen: Record<string, number> = state.seen ?? {};
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
  const todo = ids ? ctx.matches.filter(m => ids.includes(m.id)) : MS.due(ctx, seen, started).slice(0, Math.max(1, Math.min(Number(body.max ?? 30), 60)));
  const st = { matches: todo.length, due: ids ? undefined : MS.due(ctx, seen, started).length, searches: 0, worked: 0, failed: 0, items: 0,
    ref: 0, coverage: 0, linked: 0, inserted: 0, via: {} as Record<string, number>, errors: [] as string[], sample: [] as string[], why: [] as any[] };
  const rows = new Map<string, any>();
  let i = 0;
  const worker = async () => {
    while (i < todo.length && Date.now() - started < 100000) {
      const m = todo[i++];
      let worked = false;
      for (const s of MS.searches(m)) {
        st.searches++;
        try {
          const items = await feed(s.url, st.via);
          st.worked++; st.items += items.length; worked = true;
          for (const it of items) {
            const r = MS.toRow(it, m, ctx, started, s.strict);
            // why: show what became of the results whose headline has these words (with dry)
            if (body.why && String(it.title).includes(String(body.why)) && st.why.length < 20)
              st.why.push({ search: s.q.slice(0, 60), title: it.title, date: it.date instanceof Date && isFinite(it.date.getTime()) ? it.date.toISOString() : String(it.date), got: r ? `${r.kind} ${r.match_id}` : null });
            if (!r) continue;
            const ex = rows.get(r.aid);
            if (!ex) { rows.set(r.aid, r); continue; }
            if (ex.kind !== 'ref' && r.kind === 'ref') rows.set(r.aid, { ...r, match_id: r.match_id ?? ex.match_id });
            else if (!ex.match_id && r.match_id) ex.match_id = r.match_id;
          }
        } catch (e) { st.failed++; if (st.errors.length < 5) st.errors.push(`${m.home_name} – ${m.away_name}: ` + String((e as Error).message ?? e).slice(0, 140)); }
        await sleep(300 + Math.random() * 400);
      }
      if (worked) seen[m.id] = Date.now();
    }
  };
  await Promise.all([worker(), worker()]);
  const list = [...rows.values()];
  for (const r of list) { if (r.kind === 'ref') st.ref++; else st.coverage++; if (r.match_id) st.linked++; }
  const byId = new Map(ctx.matches.map(m => [m.id, m]));
  st.sample = list.filter(r => r.match_id).slice(0, Number(body.n ?? 12)).map(r => { const m = byId.get(r.match_id);
    return `${r.kind} | ${m ? m.home_name + ' – ' + m.away_name : r.match_id} | ${r.src} | ${r.title}`; });
  if (!body.dry) {
    for (let k = 0; k < list.length; k += 200) st.inserted += Number(await rpc('news_upsert', { p_rows: list.slice(k, k + 200) }) ?? 0);
    // forget matches from before the season
    for (const id of Object.keys(seen)) if (!byId.has(id)) delete seen[id];
    await rpc('news_state_set', { p_k: 'matches', p_v: { seen } });
  } else (st as any).rows = list.slice(0, 60).map(r => ({ kind: r.kind, match: r.match_id, src: r.src, title: r.title, at: r.published_at }));
  return st;
}
const googleTasks = (from: number, to: number): Task[] => N.GOOGLE_QUERIES.map(q => ({ kind: 'google', q, url: N.googleUrl(q.q, from, to) }));
const intlTasks = (from: number, to: number): Task[] => INTL.INTL_QUERIES.map(q => ({ kind: 'google', q, url: INTL.intlUrl(q, from, to) }));
const INTL_LANGS = INTL.LANGS as string[];                 // English only
const OLD_LANGS = ['es', 'it', 'de', 'fr'];                 // the languages searched before: their articles are removed

Deno.serve(async (req) => {
  const started = Date.now();
  const key = req.headers.get('x-sync-key') ?? '';
  if (!key || !(await rpc('football_sync_key_ok', { k: key }).catch(() => false)))
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const out: Record<string, any> = { ok: true, at: new Date().toISOString() };

  if (body.test) {                                  // try one search and show what it gives (no saving); lang: en (ed: en / us)
    const via: Record<string, number> = {};
    try {
      const q = body.lang ? { q: String(body.test), ctx: 'intl', lang: String(body.lang), ed: String(body.ed ?? 'en') } : { q: String(body.test), ctx: 'loose' };
      const url = body.lang ? INTL.intlUrl(q, started - 7 * 864e5, started + 864e5) : N.googleUrl(String(body.test), started - 7 * 864e5, started + 864e5);
      const items = await feed(url, via, body.lang);
      out.test = { via, items: items.length, sample: items.slice(0, Number(body.n ?? 8)).map(it => ({ title: it.title, src: it.source, srcUrl: it.srcUrl,
        kept: !!N.toArticle(it, 'google', q), outlet: body.lang ? INTL.topOutlet(String(body.lang), it.srcUrl, it.source) : undefined,
        english: body.lang ? INTL.looksEnglish(it.title.replace(/ - [^-]+$/, ''), INTL.bilingual(it.srcUrl)) : undefined })) };
    } catch (e) { out.test = { via, error: String((e as Error).message ?? e) }; }
    return Response.json(out);
  }

  if (body.reclassify) {                            // run the current filter over everything saved: remove what no longer
    out.mode = 'reclassify';                        // passes, and move the rest to their current section / competitions
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await rest(`news_articles?select=aid,title,descr,src,link,scope,divs,comps,clubs,hinted,lang,kind,match_id&order=aid&offset=${from}&limit=1000`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const drop: any[] = [], move: any[] = [];
    for (const r of rows) {
      // a match's coverage is not about refereeing and stays as it is (only a non-Bulgarian one is removed); a refereeing
      // article that no longer passes but belongs to a match becomes that match's coverage instead of being removed
      if (r.kind === 'match') { if (N.notBulgarian(r.title, r.src, r.link)) drop.push(r); continue; }
      const a = OLD_LANGS.includes(r.lang) ? null
        // the outlet's name stands in for its address: "Premier League", "Bundesliga | official website" say the league
        : INTL_LANGS.includes(r.lang) ? (INTL.looksEnglish(r.title) ? INTL.analyzeIntl(r.title, [r.descr, r.src].filter(Boolean).join(' · '), r.lang) : null)
        : N.notBulgarian(r.title, r.src, r.link) ? null : N.analyze(r.title, r.descr, { ctx: r.scope === 'world' ? 'world' : 'bg' });
      if (!a && r.match_id && r.scope === 'bg' && !N.notBulgarian(r.title, r.src, r.link)) {
        move.push({ aid: r.aid, title: r.title, from: 'ref', to: 'match ' + r.match_id, patch: { kind: 'match', cats: ['match'] } });
        continue;
      }
      if (!a) { drop.push(r); continue; }
      // a Bulgarian article keeps its divisions when they came from the search that found it (hinted), or when the analysis
      // finds none of its own; otherwise it takes the new ones ("„Пирин“ (Рз)" is a Third League club, not Втора лига's Пирин)
      const divs = a.scope === 'bg' && r.scope === 'bg' && (r.hinted || a.divs.join() === 'unk') ? (r.divs ?? a.divs) : a.divs;
      const key = (x: any[]) => [...(x ?? [])].sort().join();
      const same = a.scope === r.scope && key(a.comps) === key(r.comps) && key(divs) === key(r.divs) && key(a.clubs) === key(r.clubs);
      if (!same) move.push({ aid: r.aid, title: r.title, from: `${r.scope}:${(r.comps ?? []).join('+')}:${(r.divs ?? []).join('+')}:${(r.clubs ?? []).join('+')}`,
        to: `${a.scope}:${a.comps.join('+')}:${divs.join('+')}:${(a.clubs ?? []).join('+')}`, patch: { scope: a.scope, comps: a.comps, divs, clubs: a.clubs } });
    }
    if (!body.dry) {
      for (let k = 0; k < drop.length; k += 100) {
        const ids = drop.slice(k, k + 100).map(r => '"' + String(r.aid).replace(/"/g, '\\"') + '"').join(',');
        await rest(`news_articles?aid=in.(${encodeURIComponent(ids)})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      }
      let i = 0;
      const todo = move.slice(0, 600);
      await Promise.all([0, 1, 2, 3].map(async () => { while (i < todo.length) { const m = todo[i++];
        await rest(`news_articles?aid=eq.${encodeURIComponent(m.aid)}`, { method: 'PATCH', body: JSON.stringify({ ...m.patch, updated_at: new Date().toISOString() }), headers: { Prefer: 'return=minimal' } }); } }));
    }
    out.checked = rows.length; out.removed = drop.length; out.moved = move.length; out.dry = !!body.dry;
    out.removedByLang = drop.reduce((o: Record<string, number>, r) => { o[r.lang ?? 'null'] = (o[r.lang ?? 'null'] ?? 0) + 1; return o; }, {});
    out.sample = [...drop.filter(r => !OLD_LANGS.includes(r.lang)), ...drop.filter(r => OLD_LANGS.includes(r.lang))].slice(0, 40).map(r => `${r.lang ?? '-'} | ${r.title}`);
    out.movedSample = move.slice(0, 40).map(m => `${m.from} → ${m.to} | ${m.title}`);
  } else if (body.matches) {
    out.mode = 'matches';
    Object.assign(out, await scanMatches(body, started));
    if (body.dry) { out.seconds = Math.round((Date.now() - started) / 100) / 10; return Response.json(out); }
  } else if (body.recent) {
    out.mode = body.intl ? 'intl-recent' : 'recent';
    const tasks = body.intl ? intlTasks(started - 3 * 864e5, started + 864e5) : [...googleTasks(started - 3 * 864e5, started + 864e5),
      ...N.BING_QUERIES.map(q => ({ kind: 'bing' as const, q, url: N.bingUrl(q.q) }))];
    Object.assign(out, await scan(tasks, started));
  } else if (body.backfill) {
    out.mode = body.intl ? 'intl-backfill' : 'backfill';
    const SK = body.intl ? 'backfill-intl' : 'backfill';
    const state = (await rpc('news_state_get', { p_k: SK }).catch(() => null)) ?? {};
    const idx = Number(state.idx ?? 0);
    if (idx === 0 && state.done_at && started - Date.parse(state.done_at) < 20 * 3600e3)
      return Response.json({ ...out, skipped: 'season searched recently', done_at: state.done_at });
    const wins = N.windows(started);
    const [from, to] = wins[Math.min(idx, wins.length - 1)];
    out.window = [new Date(from).toISOString().slice(0, 10), new Date(to).toISOString().slice(0, 10), `${Math.min(idx, wins.length - 1) + 1}/${wins.length}`];
    Object.assign(out, await scan(body.intl ? intlTasks(from, to) : googleTasks(from, to), started));
    // move on only when most searches worked; otherwise the same window is tried again next run
    const next = out.worked >= out.searches * 0.6 ? idx + 1 : idx;
    await rpc('news_state_set', { p_k: SK, p_v: next >= wins.length
      ? { idx: 0, done_at: new Date().toISOString(), cycles: Number(state.cycles ?? 0) + 1 }
      : { ...state, idx: next } });
  } else return Response.json({ ok: false, error: 'say recent, backfill or matches' }, { status: 400 });

  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  await rpc('news_log', { details: out }).catch(() => {});
  return Response.json(out);
});
