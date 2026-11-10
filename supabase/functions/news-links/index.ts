// news-links: gives the saved news articles found through Google News their own address (news_articles.link), so
// the page can open them and find their videos. A Google News link can't be opened from a server (Google's decoder
// answers "too many requests" to Cloudflare and Supabase alike), so each article is looked up by its headline in its
// outlet's own feed (RSS / Atom / news sitemap). Old Google ids carry the address themselves.
// Called by pg_cron every 10 minutes (news-setup.sql), newest articles first.
// Body (JSON, all optional): { sites: 14 (outlets per run), dry, site: "blitz.bg" (just this outlet) }
import * as G from './links.js';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: unknown) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
async function get(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'bg-BG,bg;q=0.9,en;q=0.8', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    redirect: 'follow', signal: AbortSignal.timeout(12000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error('HTTP ' + r.status); }
  return { text: (await r.text()).slice(0, 3_000_000), url: r.url || url };
}

Deno.serve(async (req) => {
  const started = Date.now();
  const key = req.headers.get('x-sync-key') ?? '';
  if (!key || !(await rpc('football_sync_key_ok', { k: key }).catch(() => false)))
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const dry = !!body.dry, maxSites = Math.max(1, Math.min(Number(body.sites ?? 14), 40));
  const out: Record<string, any> = { ok: true, dry, at: new Date().toISOString(), resolved: 0, notFound: 0, noSite: 0, left: 0,
    feeds: {} as Record<string, number>, errors: [] as string[], sample: [] as string[] };

  // what earlier runs learnt: each outlet's feeds (looked for again after 3 days), and the articles not found yet
  // (tried again after 12 hours, four times at most: an article drops out of its feed after a day or two)
  const state: any = (await rpc('news_state_get', { p_k: 'links' }).catch(() => null)) || {};
  const feeds: Record<string, { urls: string[]; t: number }> = state.feeds || {};
  const fails: Record<string, { n: number; t: number }> = state.fails || {};
  let rows: any[] = await rest(`news_articles?select=aid,link,title,src,published_at&link=like.${encodeURIComponent('https://news.google.com/*')}&order=published_at.desc&limit=600`);
  rows = rows.filter(r => { const f = fails[r.aid]; return !f || (f.n < 4 && Date.now() - f.t > 12 * 3600e3); });
  out.left = rows.length;

  const save = async (r: any, url: string) => {
    out.resolved++;
    if (out.sample.length < 8) out.sample.push(`${r.src}: ${url}`);
    if (!dry) await rest(`news_articles?aid=eq.${encodeURIComponent(r.aid)}`, { method: 'PATCH', body: JSON.stringify({ link: url }), headers: { Prefer: 'return=minimal' } });
    delete fails[r.aid];
  };

  // 1. old ids carry the address; the others are grouped by outlet
  const bySite = new Map<string, any[]>();
  for (const r of rows) {
    const id = G.googleId(r.link);
    if (!id) continue;
    const old = G.oldIdUrl(id);
    if (old && G.goodUrl(old)) { await save(r, old); continue; }
    const site = G.outletSite(r.src);
    if (!site) { out.noSite++; continue; }
    if (body.site && site !== body.site) continue;
    if (!bySite.has(site)) bySite.set(site, []);
    bySite.get(site)!.push(r);
  }

  // 2. each outlet's feeds: those found before, or the ones its home page announces and the usual addresses
  const feedsOf = async (site: string) => {
    const known = feeds[site];
    if (known && Date.now() - known.t < 3 * 864e5) return known.urls;
    const tried: string[] = [...((G.FEEDS as Record<string, string[]>)[site] ?? [])];
    for (const home of site.split('.').length > 2 ? [`https://${site}/`] : [`https://www.${site}/`, `https://sport.${site}/`]) {
      try { const h = await get(home); tried.push(...G.feedLinks(h.text, h.url)); } catch { /* no such page */ }
    }
    // the news sitemap robots.txt names (Google News sitemaps: the last two days, with headlines)
    try { const r = await get(`https://${site.split('.').length > 2 ? site : 'www.' + site}/robots.txt`); tried.push(...G.robotsSitemaps(r.text).filter(u => /news/i.test(u)).slice(0, 2)); } catch { /* none */ }
    const urls: string[] = [];
    for (const u of [...new Set([...tried, ...G.feedGuesses(site)])].slice(0, 12)) {
      if (urls.length >= 4 || Date.now() - started > 80000) break;
      try { if (G.feedItems((await get(u)).text).length) urls.push(u); } catch { /* not a feed */ }
    }
    feeds[site] = { urls, t: Date.now() };
    return urls;
  };
  const sites = [...bySite.keys()].slice(0, maxSites);
  for (const site of sites) {
    if (Date.now() - started > 90000) break;
    const urls = await feedsOf(site);
    const items: any[] = [];
    for (const u of urls) { try { items.push(...G.feedItems((await get(u)).text)); } catch (e) { if (out.errors.length < 8) out.errors.push(`${u}: ${(e as Error).message}`); } }
    out.feeds[site] = items.length;
    for (const r of bySite.get(site)!) {
      const url = items.length ? G.matchTitle(items, r.title) : null;
      if (url) await save(r, url);
      else { out.notFound++; fails[r.aid] = { n: (fails[r.aid]?.n ?? 0) + 1, t: Date.now() }; }
    }
  }
  out.sitesLeft = Math.max(0, bySite.size - sites.length);
  for (const [a, f] of Object.entries(fails)) if (Date.now() - f.t > 14 * 864e5) delete fails[a];
  if (!dry) await rpc('news_state_set', { p_k: 'links', p_v: { feeds, fails } }).catch(e => out.errors.push(String(e.message)));
  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (!dry && (out.resolved || out.errors.length)) await rpc('news_log', { details: { links: out } }).catch(() => {});
  return Response.json(out);
});
