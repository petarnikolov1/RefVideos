// news-sync: searches Google News and Bing News for refereeing stories and saves them in public.news_articles.
// The site only reads the saved articles, so nothing is searched in the browser.
//   { recent: true }   the last few days (every 30 minutes)
//   { backfill: true } one older 2-week window of the season per run, newest first; once the whole season has been
//                      searched it rests for a day, then goes through it again to catch anything published late
//   + intl: true       the same for the international media of the World sections (English-language outlets and the
//                      English editions of foreign ones; intl.js), with their own schedule and their own place in the season
// Articles keep the time they were first found (found_at), so the page can mark what is new since a visit.
import * as N from './news.js';
import * as INTL from './intl.js';

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
      const page = await rest(`news_articles?select=aid,title,descr,src,link,scope,divs,comps,lang&order=aid&offset=${from}&limit=1000`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const drop: any[] = [], move: any[] = [];
    for (const r of rows) {
      const a = OLD_LANGS.includes(r.lang) ? null
        // the outlet's name stands in for its address: "Premier League", "Bundesliga | official website" say the league
        : INTL_LANGS.includes(r.lang) ? (INTL.looksEnglish(r.title) ? INTL.analyzeIntl(r.title, [r.descr, r.src].filter(Boolean).join(' · '), r.lang) : null)
        : N.notBulgarian(r.title, r.src, r.link) ? null : N.analyze(r.title, r.descr, { ctx: r.scope === 'world' ? 'world' : 'bg' });
      if (!a) { drop.push(r); continue; }
      const same = a.scope === r.scope && [...a.comps].sort().join() === [...(r.comps ?? [])].sort().join() &&
        (a.scope !== 'world' || [...a.divs].sort().join() === [...(r.divs ?? [])].sort().join());
      if (!same) move.push({ aid: r.aid, title: r.title, from: `${r.scope}:${(r.comps ?? []).join('+')}`, to: `${a.scope}:${a.comps.join('+')}`,
        patch: { scope: a.scope, comps: a.comps, divs: a.scope === 'bg' && r.scope === 'bg' ? r.divs : a.divs } });
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
  } else return Response.json({ ok: false, error: 'say recent or backfill' }, { status: 400 });

  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  await rpc('news_log', { details: out }).catch(() => {});
  return Response.json(out);
});
