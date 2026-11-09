// Cloudflare Pages "advanced mode" worker for BG Referee Watch.
//
//   /feed?url=...                 Google News / Bing News RSS relay (only those hosts).
//   /extract?url=...&title=&src=  Opens a news article and returns, as JSON only, the videos embedded in it,
//                                 the match minutes the text mentions, and what was tried (diag).
//   /logo?u=...                   a team crest from mr-bit.bg or bgclubs.eu, served from this site's own address and
//                                 cached for 30 days (blockers, rate limits).
//   /config.json                  Supabase URL + key from the Pages environment variables
//                                 SUPABASE_URL and SUPABASE_ANON_KEY (public by design; data is protected by RLS).
//   POST /drive/list {url}        the videos in a Google Drive folder shared "anyone with the link" (approved
//                                 members only), including its subfolders, so a whole folder can be added at once.
//   POST /ebfu/login, /ebfu/explore   ebfu.net with the member's OWN account (approved members only):
//                                 log in once, then map the video archive. Passwords are never stored or logged;
//                                 the ebfu.net session goes back to the member's browser only.
//   everything else               the static site.

const FEED_HOSTS = ['news.google.com', 'www.bing.com', 'bing.com'];
const FEED_CACHE_SECONDS = 900;
const EXTRACT_VERSION = 4;   // bump to ignore results cached by older versions
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BROWSER_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'bg-BG,bg;q=0.9,en;q=0.6' };
// Google shows a cookie-consent page to EU servers unless consent cookies are present
const GOOGLE_COOKIES = 'CONSENT=YES+cb.20240101-00-p0.bg+FX+000; SOCS=CAESHAgBEhJnd3NfMjAyNDAxMDEtMF9SQzIaAmJnIAEaBgiA_LyuBg';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/feed') return handleFeed(request, url, ctx);
    if (url.pathname === '/extract') return handleExtract(request, url, ctx);
    if (url.pathname === '/selftest') return handleSelftest(url, ctx);
    if (url.pathname === '/logo') return handleLogo(request, url, ctx);
    if (url.pathname.startsWith('/ebfu/')) return handleEbfu(request, url, env);
    if (url.pathname === '/drive/list') return handleDrive(request, env);
    if (url.pathname === '/config.json') {
      return json({ supabaseUrl: env.SUPABASE_URL || '', supabaseKey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' }, 200, 300);
    }
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- /feed ---------------- */
async function handleFeed(request, url, ctx) {
  if (request.method !== 'GET') return text('Method not allowed', 405);
  let target;
  try { target = new URL(url.searchParams.get('url') || ''); } catch { return text('Missing or invalid ?url=', 400); }
  if (target.protocol !== 'https:' || !FEED_HOSTS.includes(target.hostname)) return text('Host not allowed', 403);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }

  let upstream;
  try {
    upstream = await fetch(target.toString(), { headers: { ...BROWSER_HEADERS, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      ...(target.hostname === 'news.google.com' ? { Cookie: GOOGLE_COOKIES } : {}) }, redirect: 'follow' });
  } catch (e) { return text('Upstream fetch failed: ' + e.message, 502); }
  const body = await upstream.text();
  const response = new Response(body, { status: upstream.status, headers: {
    'Content-Type': upstream.headers.get('Content-Type') || 'application/xml; charset=utf-8',
    'Cache-Control': `public, max-age=${FEED_CACHE_SECONDS}`, 'Access-Control-Allow-Origin': '*' } });
  if (cache && upstream.ok && /<(rss|channel|feed)[\s>]/i.test(body)) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/* ---------------- /logo ----------------
   Team crests from mr-bit.bg (blocked by ad and DNS blockers that filter betting sites) and from bgclubs.eu (the
   Втора лига and Трета лига crests; the site limits how often it is asked): fetched here once, cached for 30 days and
   served from this site's own address. Only raster images from the listed hosts, at most 1 MB. */
const LOGO_HOSTS = ['mr-bit.bg', 'media.bgclubs.eu'];
const LOGO_CACHE_SECONDS = 30 * 86400;
async function handleLogo(request, url, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return text('Method not allowed', 405);
  let target;
  try { target = new URL(url.searchParams.get('u') || ''); } catch { return text('Missing or invalid ?u=', 400); }
  if (target.protocol !== 'https:' || !LOGO_HOSTS.includes(target.hostname.replace(/^www\./, '')) || !/\.(png|jpe?g|webp|gif)$/i.test(target.pathname))
    return text('Not allowed', 403);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request('https://refvideos.pages.dev/logo?u=' + encodeURIComponent(target.origin + target.pathname), { method: 'GET' });
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }
  let upstream;
  try {
    upstream = await fetch(target.origin + target.pathname, { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/png,image/*;q=0.8' },
      redirect: 'follow', cf: { cacheTtl: LOGO_CACHE_SECONDS, cacheEverything: true } });
  } catch (e) { return text('Upstream fetch failed: ' + e.message, 502); }
  const type = upstream.headers.get('Content-Type') || '';
  if (!upstream.ok || !/^image\/(png|jpeg|webp|gif)/i.test(type)) return text('Logo not available', 502);
  const body = await upstream.arrayBuffer();
  if (body.byteLength > 1e6) return text('Logo too large', 502);
  const response = new Response(body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': `public, max-age=${LOGO_CACHE_SECONDS}`,
    'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/* ---------------- /extract ---------------- */
async function handleExtract(request, url, ctx) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method not allowed' }, 405);
  let target;
  try { target = new URL(url.searchParams.get('url') || ''); } catch { return json({ ok: false, error: 'invalid url' }, 400); }
  if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) return json({ ok: false, error: 'url not allowed' }, 400);
  const hint = { title: (url.searchParams.get('title') || '').slice(0, 300), src: (url.searchParams.get('src') || '').slice(0, 80) };

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const keyUrl = new URL(url.toString()); keyUrl.searchParams.set('v', String(EXTRACT_VERSION));
  const cacheKey = new Request(keyUrl.toString(), { method: 'GET' });
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }

  const diag = [];
  let result;
  try {
    let articleUrl = target.toString();
    if (target.hostname === 'news.google.com') {
      articleUrl = await resolveGoogleNews(target, hint, diag);
      if (!articleUrl) throw new Error('could not find the original article behind the Google News link');
    }
    const page = await fetchArticle(articleUrl, diag);
    if (!page) throw new Error('the news site did not let us open the article');
    result = { ok: true, url: page.finalUrl, ...extractFromHtml(page.html, page.finalUrl), diag };
  } catch (e) {
    result = { ok: false, error: String((e && e.message) || e), diag };
  }
  const response = json(result, 200, result.ok ? 21600 : 900);
  if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/* ---------------- /selftest ----------------
   Runs the whole chain on the server and reports each step: Google News feed → resolving two of its
   links → opening those articles and a few sites known to block servers. Cached for 10 minutes. */
const SELFTEST_ARTICLES = [
  'https://sport.blitz.bg/efbet-liga/vizhte-nadupcheniya-krak-na-igracha-na-dunav-pri-situaciyata-vzrivila-futbola-ni_600191.html',
  'https://fakti.bg/sport/1096583-sadiiskata-komisia-prizna-dve-greshki-v-parva-liga-ne-sa-dadeni-dva-cherveni-kartoni',
];
async function handleSelftest(url, ctx) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(url.origin + '/selftest?v=' + EXTRACT_VERSION + '&w=' + (url.searchParams.get('wait') || ''), { method: 'GET' });
  if (cache && !url.searchParams.has('fresh')) { const hit = await cache.match(cacheKey); if (hit) return hit; }
  const started = Date.now();
  const out = { time: new Date().toISOString(), version: EXTRACT_VERSION, finished: false, seconds: 0,
    googleFeed: 'running', googleLinks: [], googleArticles: [],
    blockedSites: SELFTEST_ARTICLES.map(u => ({ url: u.slice(0, 90), opened: 'running', diag: [] })) };
  // light check only (does the page open, and how): the full video search is what /extract does per article
  const open = async (u, slot) => {
    const page = await fetchArticle(u, slot.diag, true);
    slot.opened = !!page;
    if (page) slot.kb = Math.round(page.size / 1024);
  };
  const googlePart = (async () => {
    let items = [];
    try {
      const r = await fetch('https://news.google.com/rss/search?q=' + encodeURIComponent('съдия efbet Лига') + '&hl=bg&gl=BG&ceid=BG:bg',
        { headers: { ...BROWSER_HEADERS, Cookie: GOOGLE_COOKIES }, signal: AbortSignal.timeout(8000) });
      const xml = await r.text();
      items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 2).map(m => ({
        title: decodeEntities((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''), link: ((m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim() }));
      out.googleFeed = { status: r.status, items: (xml.match(/<item>/g) || []).length };
    } catch (e) { out.googleFeed = { error: e.message }; return; }
    await Promise.all(items.map(async it => {
      const cut = it.title.lastIndexOf(' - ');
      const g = { title: (cut > 15 ? it.title.slice(0, cut) : it.title).slice(0, 90), source: cut > 15 ? it.title.slice(cut + 3) : '', resolved: 'running', diag: [] };
      out.googleLinks.push(g);
      try { g.resolved = await resolveGoogleNews(new URL(it.link), { title: g.title, src: g.source }, g.diag); } catch (e) { g.resolved = null; g.diag.push(e.message); }
      if (g.resolved) { const slot = { url: g.resolved.slice(0, 90), opened: 'running', diag: [] }; out.googleArticles.push(slot); await open(g.resolved, slot); }
    }));
  })();
  const sitesPart = Promise.all(SELFTEST_ARTICLES.map((u, i) => open(u, out.blockedSites[i])));
  let timer;
  const limit = Math.min(25000, Math.max(3000, Number(url.searchParams.get('wait')) * 1000 || 8000));   // answer within ~8 s by default
  await Promise.race([Promise.all([googlePart, sitesPart]).then(() => { out.finished = true; }), new Promise(r => { timer = setTimeout(r, limit); })]);
  clearTimeout(timer);
  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  const response = json(out, 200, out.finished ? 600 : 60);
  if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function isPrivateHost(h) {
  h = h.toLowerCase();
  return h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[');
}

// Google News RSS links are encoded article ids. Old ids contain the URL; new ones need Google's decoder call.
// If Google refuses, the same headline is looked up on Bing, which links to the original site directly.
async function resolveGoogleNews(u, hint, diag) {
  const m = u.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/);
  if (!m) { diag.push('not a Google News article link'); return null; }
  const id = m[1];
  try {
    const b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const found = bin.match(/https?:\/\/[\x21-\x7e]+/);
    if (found && !bin.includes('AU_yqL')) { diag.push('google id decoded'); return found[0]; }
  } catch {}
  try {
    const gh = { ...BROWSER_HEADERS, Cookie: GOOGLE_COOKIES };
    const page = await fetch(`https://news.google.com/rss/articles/${id}?hl=bg&gl=BG&ceid=BG:bg`, { headers: gh, signal: AbortSignal.timeout(10000) });
    const html = await page.text();
    const sg = (html.match(/data-n-a-sg="([^"]+)"/) || [])[1];
    const ts = (html.match(/data-n-a-ts="([^"]+)"/) || [])[1];
    if (sg && ts) {
      const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
      const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { ...gh, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]])),
      });
      const txt = await r.text();
      try {
        const decoded = JSON.parse(JSON.parse(txt.split('\n\n')[1])[0][2])[1];
        if (/^https?:\/\//.test(decoded)) { diag.push('google link resolved'); return decoded; }
      } catch {}
      diag.push('google decoder answered ' + r.status + ' without a link');
    } else diag.push('google page ' + page.status + ' without decoder data');
  } catch (e) { diag.push('google error: ' + e.message); }
  return hint.title ? findByTitle(hint.title, hint.src, diag) : null;
}

const words = s => new Set(String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(w => w.length > 2));
function similarity(a, b) { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n ? n / Math.max(A.size, B.size) : 0; }

async function findByTitle(title, src, diag) {
  const site = /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/i.test(src) ? src.toLowerCase().replace(/^www\./, '') : '';
  const queries = [site ? `${title} site:${site}` : null, `"${title}"`].filter(Boolean);
  const bases = ['https://www.bing.com/news/search?format=rss&q=', 'https://www.bing.com/search?format=rss&q='];
  const lookups = queries.flatMap(q => bases.map(base => (async () => {
    const r = await fetch(base + encodeURIComponent(q) + '&setlang=bg&cc=BG', { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(7000) });
    const xml = await r.text();
    for (const it of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const t = decodeEntities((it[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
      let link = decodeEntities((it[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim(), host = '';
      try { const lu = new URL(link); link = lu.searchParams.get('url') || link; host = new URL(link).hostname; } catch { continue; }
      if (/(^|\.)(bing|google|microsoft|msn)\.com$/.test(host) || (site && !host.endsWith(site))) continue;
      if (similarity(t, title) >= 0.6) return { link, host };
    }
    throw new Error('no match');
  })()));
  const hit = await Promise.any(lookups).catch(() => null);   // all four lookups at once; first match wins
  if (hit) { diag.push('found on Bing: ' + hit.host); return hit.link; }
  diag.push('headline not found on Bing');
  return null;
}

// Some news sites block cloud servers; then the article is read through public relays and a reader
// service (which opens the page like a browser, so videos added by scripts are included). The relays are
// tried at the same time; the first good answer wins and the others are stopped.
// Cloudflare's free plan allows only ~10 ms of computing per request, so pages are read only up to
// MAX_BYTES and a failed answer is never fully decoded.
const MAX_BYTES = 700000;
const BOT_RE = /cf-chl|challenge-platform|Just a moment\.\.\.|Attention Required|captcha|DDoS-Guard|Access denied|enable JavaScript and cookies/i;
const RELAYS = [
  ['allorigins', u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u), { 'User-Agent': UA }],
  ['codetabs', u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), { 'User-Agent': UA }],
  ['reader', u => 'https://r.jina.ai/' + u, { 'X-Return-Format': 'html', 'X-Timeout': '15' }],
];
async function tryRoute(name, href, headers, ms, diag, ctrl) {
  ctrl = ctrl || new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(href, { redirect: 'follow', signal: ctrl.signal, headers });
    const bytes = await readBytes(r, MAX_BYTES);
    const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 30000));
    const wall = bytes.length < 80000 && BOT_RE.test(head);
    if (r.ok && bytes.length > 1500 && !wall) return { bytes, contentType: r.headers.get('content-type') || '', finalUrl: r.url, name };
    diag.push(`article ${name}: HTTP ${r.status}${wall ? ' bot check' : bytes.length <= 1500 ? ' empty' : ''}`);
  } catch (e) {
    if (ctrl.signal.reason !== 'lost') diag.push(`article ${name}: ${ctrl.signal.aborted ? 'timeout' : e.message}`);
  } finally { clearTimeout(timer); }
  return null;
}
async function readBytes(r, max) {
  if (!r.body) return new Uint8Array(0);
  const reader = r.body.getReader(), parts = [];
  let n = 0;
  while (n < max) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.length;
  }
  if (n >= max) reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(n, max));
  let o = 0;
  for (const p of parts) { if (o >= out.length) break; const take = p.subarray(0, out.length - o); out.set(take, o); o += take.length; }
  return out;
}
async function fetchArticle(articleUrl, diag, probeOnly) {
  let hit = await tryRoute('direct', articleUrl, { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml' }, 8000, diag);
  if (!hit) {
    const ctrls = RELAYS.map(() => new AbortController());
    hit = await Promise.any(RELAYS.map(([name, make, headers], i) =>
      tryRoute(name, make(articleUrl), headers, 16000, diag, ctrls[i]).then(r => r || Promise.reject()))).catch(() => null);
    ctrls.forEach(c => { try { c.abort('lost'); } catch {} });   // stop the slower relays
  }
  if (!hit) return null;
  diag.push('article opened (' + hit.name + ')');
  if (probeOnly) return { size: hit.bytes.length };
  return { html: decodeBytes(hit.bytes, hit.contentType), finalUrl: hit.name === 'direct' ? (hit.finalUrl || articleUrl) : articleUrl };
}

function decodeBytes(bytes, contentType) {
  let charset = ((contentType || '').match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!charset) {
    let head = '';
    for (let i = 0; i < Math.min(bytes.length, 4096); i++) head += String.fromCharCode(bytes[i]);
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  try { return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

/* ---------------- HTML → videos + minutes ---------------- */
const AD_HOSTS = /doubleclick|googlesyndication|googleadservices|googletagmanager|adservice|taboola|outbrain|teads|adform|criteo|amazon-adsystem|smartadserver|gemius|adocean|pubmatic|rubiconproject|onesignal|recaptcha|google\.com\/maps|disqus|addthis|sharethis|platform\.twitter\.com\/widgets|facebook\.com\/(?:tr|plugins\/(?:like|share|page|comments|follow))/i;
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly|vbox7\.com|streamable\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|instagram\.com|tiktok\.com)$/i;
const PLAYER_HINT = /player|embed|video|vod|stream|media|tv|clip/i;
const baseDomain = h => h.toLowerCase().replace(/^www\./, '').split('.').slice(-2).join('.');

function extractFromHtml(html, pageUrl) {
  html = String(html).slice(0, MAX_BYTES);
  let pageHost = ''; try { pageHost = new URL(pageUrl).hostname; } catch {}
  const meta = prop => {
    const tag = (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i')) || [])[0];
    if (!tag) return '';
    return decodeEntities((tag.match(/content=["']([^"']*)["']/i) || [])[1] || '');
  };
  const title = meta('og:title') || decodeEntities(((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim());
  const region = articleRegion(html);

  const cands = [];
  const add = (u, how, iframe) => {
    if (!u || cands.length >= 12) return;
    u = decodeEntities(String(u).trim());
    if (u.startsWith('//')) u = 'https:' + u;
    let p;
    try { p = new URL(u, pageUrl); } catch { return; }
    if (!/^https?:$/.test(p.protocol) || AD_HOSTS.test(p.href)) return;
    let kind = 'host';
    if (/\.(mp4|webm|m3u8|mov)(\?|$)/i.test(p.pathname)) kind = 'file';
    else if (!VIDEO_HOSTS.test(p.hostname)) {
      // a site's own video player inside the article (e.g. a TV or club player)
      if (!(iframe && (baseDomain(p.hostname) === baseDomain(pageHost) || PLAYER_HINT.test(p.hostname + p.pathname))) && how !== 'ld' && how !== 'meta') return;
      kind = 'player';
    }
    if (/(^|\.)facebook\.com$/i.test(p.hostname) && !/\/videos\/|\/watch|\/reel\/|\/share\/v\/|plugins\/video\.php/.test(p.href)) return;
    if (/(^|\.)(twitter|x)\.com$/i.test(p.hostname) && !/\/status\/\d+/.test(p.pathname)) return;
    if (/(^|\.)instagram\.com$/i.test(p.hostname) && !/\/(p|reel|tv)\/[\w-]+/.test(p.pathname)) return;
    if (/(^|\.)tiktok\.com$/i.test(p.hostname) && !/\/video\/\d+|\/embed\//.test(p.pathname)) return;
    if (!cands.some(c => c.url === p.href)) cands.push({ url: p.href, how, kind });
  };
  const scanEmbeds = (src, how) => {
    for (const m of src.matchAll(/<iframe\b[^>]*?\s(?:data-src|data-lazy-src|data-original|data-url|src)=["']([^"']+)["']/gi)) add(m[1], how, true);
    for (const m of src.matchAll(/<(?:video|source)\b[^>]*?\s(?:data-src|src)=["']([^"']+)["']/gi)) add(m[1], how);
    for (const m of src.matchAll(/(?:videoid|data-video-?id|data-youtube-?id|data-yt-?id|data-ytid|data-embed-id)=["']([\w-]{11})["']/gi)) add('https://www.youtube.com/watch?v=' + m[1], how);
    for (const m of src.matchAll(/(?:https?:)?\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)[\w-]{11}/gi)) add(m[0], how);
    for (const m of src.matchAll(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/\w+\/status\/\d+/gi)) add(m[0], how);
    for (const m of src.matchAll(/https?:\/\/(?:www\.|m\.)?(?:facebook\.com\/(?:[^"'\s<>]+\/videos\/[^"'\s<>]+|watch\/?\?v=\d+|reel\/\d+|share\/v\/[\w-]+)|fb\.watch\/[\w-]+)/gi)) add(m[0], how);
    for (const m of src.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[\w-]+/gi)) add(m[0], how);
    for (const m of src.matchAll(/https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/gi)) add(m[0], how);
    for (const m of src.matchAll(/https?:\/\/(?:www\.)?vbox7\.com\/(?:play:\w+|emb\/external\.php\?vid=\w+)/gi)) add(m[0], how);
    for (const m of src.matchAll(/https?:\/\/(?:www\.)?(?:vimeo\.com\/\d{6,}|player\.vimeo\.com\/video\/\d{6,}|dailymotion\.com\/(?:video|embed\/video)\/\w+|dai\.ly\/\w+|streamable\.com\/(?:e\/)?\w+)/gi)) add(m[0], how);
  };

  // 1. structured data and page-level video tags describe the article's own video
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim()), o => { if (/VideoObject/i.test(String(o['@type'] || ''))) { add(o.embedUrl, 'ld'); add(o.contentUrl, 'ld'); } }); } catch {}
  }
  ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream', 'twitter:player'].forEach(p => add(meta(p), 'meta'));
  // 2. players and links inside the article body
  scanEmbeds(region, 'article');
  // 3. nothing in the body: look at the rest of the page (minus sidebars and footers) for players
  if (!cands.length) scanEmbeds(stripBlocks(html.slice(0, 400000), ['aside', 'footer', 'nav']), 'page');
  // 4. video files referenced by the page's own player script
  if (!cands.some(c => c.kind !== 'player')) {
    for (const m of html.slice(0, 400000).matchAll(/https?:\\?\/\\?\/[^"'\s<>()]+?\.(?:mp4|m3u8)(?:\?[^"'\s<>()]*)?/gi)) { add(m[0].replace(/\\\//g, '/'), 'script'); if (cands.length >= 6) break; }
  }

  const text = htmlToText(region.slice(0, 150000)).slice(0, 100000);
  return { title: title.slice(0, 300), videos: cands.slice(0, 10), minutes: findMinutes(text) };
}

function walk(o, fn) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach(x => walk(x, fn)); return; }
  fn(o);
  Object.values(o).forEach(v => walk(v, fn));
}

function stripBlocks(h, tags) {
  return h.replace(new RegExp(`<(${tags.join('|')})\\b[\\s\\S]*?<\\/\\1>`, 'gi'), ' ');
}

function articleRegion(html) {
  const blocks = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map(m => m[0]).sort((a, b) => b.length - a.length);
  if (blocks.length && blocks[0].length > 300) return blocks[0];
  const m = html.match(/<(?:div|section)[^>]+(?:class|id)=["'][^"']*(?:article[-_]?(?:body|content|text|inner)|entry-content|post-content|post-body|news-(?:body|content|text|details)|story-body|content-body|text-content|single-content|article-details|newsText|news_text)[^"']*["'][^>]*>/i);
  if (m) return html.slice(m.index, m.index + 100000);
  const b = html.search(/<body/i);
  return b >= 0 ? html.slice(b) : html;
}

function htmlToText(h) {
  return decodeEntities(stripBlocks(h, ['script', 'style', 'noscript', 'svg', 'template', 'nav', 'footer', 'aside'])
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&bdquo;/g, '„').replace(/&ldquo;/g, '“')
    .replace(/&amp;/g, '&');
}

// "в 67-ата минута", "67-а минута", "90+3-ата мин.", "минута 54", "67'" → minute + a short snippet + what happened
const MIN_RE = /(?<![\p{L}\p{N}])(\d{1,3})(?:\s*\+\s*(\d{1,2}))?(?:\s*-?\s*(?:вата|рата|мата|ата|ия|та|ва|ра|ма|ми|ри|ви|ти|а))?\s+(?:минута(?![\p{L}])|мин\.?(?![\p{L}]))|(?<![\p{L}])минута\s+(\d{1,3})(?:\s*\+\s*(\d{1,2}))?(?![\p{N}])|(?<![\p{L}\p{N}])(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s?['’′](?![\p{L}\p{N}])/giu;
const MIN_TAGS = [
  ['penalty', /дузп|наказател\p{L}* удар/iu], ['red', /червен\p{L}* картон|изгон|втори жълт/iu], ['yellow', /жълт\p{L}* картон/iu],
  ['offside', /засад|офсайд/iu], ['var', /(?<![\p{L}])(?:вар|var)(?![\p{L}])|видеоповтор/iu], ['goal', /(?<![\p{L}])(?:гол|гола|голът|изравни|откри резултата)(?![\p{L}])/iu],
  ['foul', /фаул|нарушение|събори|спъна/iu],
];
function findMinutes(text) {
  const hits = [];
  for (const m of text.matchAll(MIN_RE)) {
    const min = Number(m[1] || m[3] || m[5]), plus = Number(m[2] || m[4] || m[6] || 0);
    if (min && min <= 130 && plus <= 20) hits.push({ min, plus, start: m.index, end: m.index + m[0].length, raw: m[0].trim() });
    if (hits.length >= 60) break;
  }
  const sentenceStart = i => { let p = i; while (p > 0 && !/[.!?\n]/.test(text[p - 1])) p--; return p; };
  const sentenceEnd = i => { const n = text.slice(i).search(/[.!?\n]/); return n < 0 ? text.length : i + n; };
  const out = new Map();
  hits.forEach((h, i) => {
    const key = h.min + '+' + h.plus;
    if (out.has(key) || out.size >= 20) return;
    const sS = sentenceStart(h.start), sE = sentenceEnd(h.end);
    // tags come from this minute's own part of the sentence; two minutes in one sentence split at the last comma between them
    const prev = hits[i - 1], next = hits[i + 1];
    let segS = sS, segE = sE;
    if (prev && prev.end > sS) { const gap = text.slice(prev.end, h.start), c = Math.max(gap.lastIndexOf(','), gap.lastIndexOf(';')); segS = c >= 0 ? prev.end + c + 1 : prev.end; }
    if (next && next.start < sE) { const gap = text.slice(h.end, next.start), c = Math.max(gap.lastIndexOf(','), gap.lastIndexOf(';')); segE = c >= 0 ? h.end + c : next.start; }
    const seg = text.slice(segS, segE);
    const before = text.slice(sS, h.start).split(/\s+/).filter(Boolean).slice(-6).join(' ');
    const after = text.slice(h.end, sE).split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
    const ctx = (before + ' ' + h.raw + ' ' + after).replace(/\s+/g, ' ').trim().slice(0, 140);
    out.set(key, { m: h.min, plus: h.plus, ctx, tags: MIN_TAGS.filter(([, re]) => re.test(seg)).map(([k]) => k) });
  });
  return [...out.values()].sort((a, b) => a.m - b.m || a.plus - b.plus);
}

/* ---------------- ebfu.net (each member's own account) ----------------
   Only members the site admin approved can use this, so the site can't be used to guess referees' passwords.
   Login: the ebfu.net login form is filled with the member's username/password exactly like a browser would.
   The resulting ebfu.net session is returned to the member's browser; nothing is stored here.
   Explore: walks start page → Видеоархив → a league round → one match video and reports how the pages are
   built (links, forms, buttons, players), so the automatic match + minute search can be built on it.
   Calendar/history pages are never opened or reported. */
const SB_URL = 'https://zinuspouctowujhocevy.supabase.co';
const SB_KEY = 'sb_publishable_sElFdQnVmyqIZMRqBV5dAg_VrstG7T8';
const EBFU_BASE = 'https://ebfu.net/';
const EBFU_ARCHIVE = 'https://ebfu.net/interfaceReferees/videoShowChampWeek.php';   // Видеоархив
const EBFU_SKIP = /календар|история|calendar|history|събити|event|изход|logout|log-out|signout|exit|настройки|settings|profile|профил|gdpr/i;

async function handleEbfu(request, url, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const member = await checkMember(request.headers.get('Authorization') || '', env);
  if (!member.ok) return json({ ok: false, error: member.error }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  const diag = [];
  try {
    if (url.pathname === '/ebfu/login') return json({ ...(await ebfuLogin(String(body.username || '').trim(), String(body.password || ''), diag)), diag });
    if (url.pathname === '/ebfu/explore') return json({ ...(await ebfuExplore(String(body.session || ''), diag)), diag });
  } catch (e) { return json({ ok: false, error: 'ebfu.net: ' + (e.name === 'TimeoutError' ? 'no answer in time' : e.message), diag }); }
  return json({ ok: false, error: 'unknown action' }, 404);
}

async function checkMember(auth, env) {
  if (!/^Bearer\s+\S+/.test(auth)) return { ok: false, error: 'Log in to the site first.' };
  const base = env.SUPABASE_URL || SB_URL, key = env.SUPABASE_ANON_KEY || SB_KEY;
  try {
    const u = await fetch(base + '/auth/v1/user', { headers: { apikey: key, Authorization: auth }, signal: AbortSignal.timeout(8000) });
    if (!u.ok) return { ok: false, error: 'Your site login has expired. Log in again.' };
    const user = await u.json();
    const p = await fetch(base + '/rest/v1/profiles?select=approved,role&id=eq.' + encodeURIComponent(user.id), { headers: { apikey: key, Authorization: auth }, signal: AbortSignal.timeout(8000) });
    const rows = p.ok ? await p.json() : [];
    if (!rows[0] || !(rows[0].approved || rows[0].role === 'admin')) return { ok: false, error: 'Only members approved by the admin can connect ebfu.net.' };
    return { ok: true, id: user.id };
  } catch (e) { return { ok: false, error: 'Could not check your site login: ' + e.message }; }
}

// --- a tiny cookie jar, so ebfu.net sees one consistent browser session ---
const jarFrom = str => { const m = new Map(); String(str || '').split(/;\s*/).forEach(p => { const i = p.indexOf('='); if (i > 0) m.set(p.slice(0, i), p.slice(i + 1)); }); return m; };
const jarStr = jar => [...jar].map(([k, v]) => k + '=' + v).join('; ');
function absorbCookies(jar, resp) {
  const list = typeof resp.headers.getSetCookie === 'function' ? resp.headers.getSetCookie() : (resp.headers.get('set-cookie') ? [resp.headers.get('set-cookie')] : []);
  for (const c of list) {
    const first = c.split(';')[0], i = first.indexOf('=');
    if (i <= 0) continue;
    const k = first.slice(0, i).trim(), v = first.slice(i + 1).trim();
    if (!v || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v);
  }
}
async function ebfuFetch(href, jar, opts, diag) {
  opts = opts || {};
  let u = href, method = opts.method || 'GET', body = opts.body, ct = opts.contentType;
  const notices = [];
  for (let hop = 0; hop < 8; hop++) {
    const target = new URL(u);
    if (!/(^|\.)ebfu\.net$/i.test(target.hostname)) throw new Error('left ebfu.net (' + target.hostname + ')');
    const h = { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' };
    if (jar.size) h.Cookie = jarStr(jar);
    if (ct) h['Content-Type'] = ct;
    if (opts.referer) h.Referer = opts.referer;
    if (opts.headers && hop === 0) Object.assign(h, opts.headers);
    const r = await fetch(u, { method, headers: h, body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    absorbCookies(jar, r);
    diag.push(`${method} ${maskUrl(u)} → ${r.status}`);
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) { u = new URL(loc, u).toString(); method = 'GET'; body = undefined; ct = undefined; continue; }
    const bytes = await readBytes(r, 1500000);
    const text = decodeBytes(bytes, r.headers.get('content-type') || '');
    // ebfu.net sends visitors on with a tiny page that only runs  self.location.href = "…"  (sometimes after an alert)
    const js = scriptRedirect(text);
    if (js) {
      if (js.alert) notices.push(js.alert);
      u = new URL(js.to, u).toString(); method = 'GET'; body = undefined; ct = undefined;
      diag.push('script redirect → ' + maskUrl(u));
      continue;
    }
    return { status: r.status, url: u, text, type: r.headers.get('content-type') || '', notices };
  }
  throw new Error('too many redirects');
}

// a page that is only a script sending the browser elsewhere (no real content) → { to, alert }
function scriptRedirect(html) {
  if (html.length > 6000) return null;
  const visible = stripTags(html.replace(/<(script|style|noscript|head)\b[\s\S]*?<\/\1>/gi, ' '));
  if (visible.length > 120 || /<form\b|<input\b/i.test(html)) return null;
  const m = html.match(/(?:self|window|top|document)?\.?location(?:\.href)?\s*=\s*["']([^"']+)["']/) || html.match(/location\.(?:replace|assign)\(\s*["']([^"']+)["']/)
    || html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i);
  if (!m) return null;
  const a = html.match(/alert\(\s*["']([^"']{1,200})["']/);
  return { to: decodeEntities(m[1]), alert: a ? a[1] : '' };
}

// --- reading pages ---
const attrOf = (s, n) => { const m = s.match(new RegExp('\\s' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i')); return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : ''; };
const stripTags = h => decodeEntities(String(h).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function maskUrl(u) {
  try {
    const x = new URL(u);
    x.pathname = x.pathname.replace(/\([A-Z]\([^)]{12,}\)\)/g, '(S(…))');
    for (const [k, v] of [...x.searchParams]) if (v.length > 24 || /token|session|sid|auth|key|pass/i.test(k)) x.searchParams.set(k, '…');
    return x.toString();
  } catch { return String(u).slice(0, 200); }
}
function parseForms(html, base) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(m => {
    let action = base; try { action = new URL(attrOf(m[1], 'action') || base, base).toString(); } catch {}
    const inputs = [...m[2].matchAll(/<(input|button|select|textarea)\b([^>]*)>/gi)].map(x => {
      const tag = x[1].toLowerCase();
      return { tag, name: attrOf(x[2], 'name'), id: attrOf(x[2], 'id'), value: attrOf(x[2], 'value'), checked: /\schecked\b/i.test(x[2]),
        type: (attrOf(x[2], 'type') || (tag === 'button' ? 'submit' : tag === 'input' ? 'text' : tag)).toLowerCase() };
    }).filter(i => i.name);
    return { action, method: (attrOf(m[1], 'method') || 'GET').toUpperCase(), id: attrOf(m[1], 'id'), inputs, onsubmit: attrOf(m[1], 'onsubmit').slice(0, 200) };
  });
}
function findLoginForm(html, base) {
  const forms = parseForms(html, base).filter(f => f.inputs.filter(i => i.type === 'password').length === 1 && f.inputs.some(i => ['text', 'email', 'tel'].includes(i.type)));
  if (!forms.length) return null;
  const f = forms[0];
  f.userField = f.inputs.find(i => ['text', 'email', 'tel'].includes(i.type) && !/search|търс/i.test(i.name));
  f.submit = f.inputs.find(i => i.type === 'submit' && /вход|login|sign|влез|submit/i.test(i.value + ' ' + i.name)) || f.inputs.find(i => i.type === 'submit');
  return f;
}
function pageLinks(html, base) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(m => {
    let href = ''; try { href = new URL(attrOf(m[1], 'href') || '#', base).toString(); } catch {}
    return { text: stripTags(m[2]).slice(0, 80), href, onclick: attrOf(m[1], 'onclick').slice(0, 160), inner: m[2].slice(0, 300), cls: attrOf(m[1], 'class') };
  });
}
function summarizePage(html, base) {
  const links = pageLinks(html, base).filter(l => (l.text || l.onclick || /video|camera|play|fa-/i.test(l.inner + l.cls)) && !EBFU_SKIP.test(l.text + ' ' + l.href))
    .map(l => ({ text: l.text, href: maskUrl(l.href), ...(l.onclick ? { onclick: l.onclick } : {}), ...(/video|camera|play|fa-|icon/i.test(l.inner + l.cls) && !l.text ? { icon: (l.cls + ' ' + (l.inner.match(/class=["']([^"']+)/) || [])[1]).trim().slice(0, 80) } : {}) }))
    .slice(0, 90);
  const clicks = [...html.matchAll(/<(button|div|span|i|img|td|tr|li|a)\b([^>]*\s(?:onclick|data-url|data-href|data-video|data-src|ng-click|@click|v-on:click)=["'][^"']{2,240}["'][^>]*)>/gi)]
    .map(m => m[1] + ' ' + (m[2].match(/\s(?:onclick|data-url|data-href|data-video|data-src|ng-click|@click|v-on:click)=["'][^"']+["']/gi) || []).join(' ').slice(0, 240))
    .filter(c => !EBFU_SKIP.test(c)).slice(0, 40);
  const scripts = [...html.matchAll(/<script\b[^>]*\ssrc=["']([^"']+)["']/gi)].map(m => { try { return maskUrl(new URL(m[1], base).toString()); } catch { return m[1]; } }).slice(0, 30);
  const hints = new Set();
  for (const m of html.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const k of m[1].matchAll(/\$\.(?:ajax|post|get|getJSON)|fetch\(|XMLHttpRequest|\.load\(|url\s*:|video|player|m3u8|\.mp4|hls|jwplayer|videojs|plyr|api\//gi)) {
      hints.add(m[1].slice(Math.max(0, k.index - 100), k.index + 200).replace(/\s+/g, ' '));
      if (hints.size >= 20) break;
    }
    if (hints.size >= 20) break;
  }
  const media = [];
  for (const m of html.matchAll(/<(iframe|video|source|embed|object)\b[^>]*\s(?:src|data|data-src)=["']([^"']+)["']/gi)) media.push(m[1] + ' ' + maskUrl(new URL(m[2], base).toString()));
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>()]+?\.(?:mp4|m3u8|webm|mpd)(?:\?[^"'\s<>()]*)?/gi)) media.push('file ' + maskUrl(m[0].replace(/\\\//g, '/')));
  return { url: maskUrl(base), title: stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 120), kb: Math.round(html.length / 1024),
    headings: [...html.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map(m => stripTags(m[1]).slice(0, 80)).filter(Boolean).slice(0, 20),
    forms: parseForms(html, base).map(f => ({ action: maskUrl(f.action), method: f.method, id: f.id, inputs: f.inputs.map(i => i.type + ':' + i.name), onsubmit: f.onsubmit })),
    links, clicks, scripts, hints: [...hints], media: [...new Set(media)].slice(0, 30) };
}
// Everything that can be tapped, and where it leads: a real link, an address inside onclick/data-*,
// or an ASP.NET "postback" (a form submit done by a script). Icon-only camera buttons are flagged.
const CAMERA = /fa-video|fa-camera|video-camera|bi-camera|bi-camera-video|mdi-video|glyphicon-facetime|camera|\bvideo\b|видео/i;
const maskAttrs = t => String(t).replace(/=\s*(["'])([^"']{40,})\1/g, (m, q) => '=' + q + '…' + q).slice(0, 300);
function clickables(html, base) {
  const out = [];
  const add = (attrs, inner, tag) => {
    const href = attrOf(attrs, 'href'), onclick = attrOf(attrs, 'onclick');
    const dh = attrOf(attrs, 'data-href') || attrOf(attrs, 'data-url') || attrOf(attrs, 'data-link');
    const js = /^javascript:/i.test(href) ? href.slice(11) : onclick;
    let how = null, url = null, target = null, arg = null, m;
    if ((m = js.match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/))) { how = 'postback'; target = m[1]; arg = m[2]; }
    else if (href && !/^(javascript:|#)/i.test(href)) { how = 'get'; url = href; }
    else if ((m = js.match(/(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/) || js.match(/window\.open\(\s*['"]([^'"]+)['"]/) || js.match(/location\.(?:assign|replace)\(\s*['"]([^'"]+)['"]/))) { how = 'get'; url = m[1]; }
    else if (dh) { how = 'get'; url = dh; }
    if (url) { try { url = new URL(url, base).toString(); if (!/(^|\.)ebfu\.net$/i.test(new URL(url).hostname)) { how = null; url = null; } } catch { how = null; url = null; } }
    const f = js.match(/^\s*(?:return\s+)?([A-Za-z_$][\w$.]*)\s*\(([^)]*)\)/);
    const fn = f && !/^(?:__doPostBack|location|window\.location|window\.open)$/.test(f[1]) ? { name: f[1], args: f[2].slice(0, 80) } : null;
    out.push({ text: stripTags(inner).slice(0, 80), how, url, target, arg, fn, camera: CAMERA.test(attrs + ' ' + inner) && stripTags(inner).length < 30,
      tag: maskAttrs(tag + ' ' + attrs.replace(/\s+/g, ' ')) });
  };
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) add(m[1], m[2], 'a');
  for (const m of html.matchAll(/<(button|div|span|li|td|tr|i)\b([^>]*\s(?:onclick|data-href|data-url|data-link|data-id|data-video|data-mid|data-match|data-bs-toggle|data-toggle)\s*=[^>]*)>([\s\S]{0,600}?)<\/\1>/gi)) add(m[2], m[3], m[1]);
  return out.filter(c => !EBFU_SKIP.test(c.text + ' ' + (c.url || '') + ' ' + (c.target || '') + ' ' + (c.fn ? c.fn.name : '')));
}
async function follow(c, page, jar, diag) {
  if (c.how === 'get') return ebfuFetch(c.url, jar, { referer: page.url }, diag);
  if (c.how === 'postback') {
    const forms = parseForms(page.text, page.url);
    const form = forms.find(f => f.inputs.some(i => i.name === '__VIEWSTATE')) || forms[0];
    if (!form) throw new Error('postback without a form');
    const fields = new URLSearchParams();
    form.inputs.filter(i => i.type === 'hidden').forEach(i => fields.set(i.name, i.value));
    fields.set('__EVENTTARGET', c.target); fields.set('__EVENTARGUMENT', c.arg || '');
    return ebfuFetch(form.action, jar, { method: 'POST', body: fields.toString(), contentType: 'application/x-www-form-urlencoded', referer: page.url }, diag);
  }
  return null;
}
const roundNo = t => { const m = String(t).match(/кръг\D{0,6}(\d{1,2})/i) || String(t).match(/(\d{1,2})\s*$/); return m ? Number(m[1]) : 0; };
const maskText = t => String(t).replace(/https?:\/\/[^\s"'<>\\]+/g, u => maskUrl(u)).replace(/[A-Za-z0-9_-]{40,}/g, '…');
// the HTML around the first camera button (one match card), with long values shortened
function cardSample(html) {
  const i = html.search(/fa-video|fa-camera|video-camera|bi-camera|mdi-video|camera/i);
  if (i < 0) return '';
  return maskText(html.slice(Math.max(0, i - 1400), i + 400).replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ')).replace(/=\s*(["'])([^"']{40,})\1/g, (m, q) => '=' + q + '…' + q);
}
// find a named function in the page's inline scripts and its own script files
function findFunction(name, sources) {
  const short = name.split('.').pop().replace(/[$]/g, '\\$');
  const re = new RegExp(`(?:function\\s+${short}\\s*\\(|${short}\\s*[:=]\\s*(?:async\\s*)?function\\s*\\(|${short}\\s*[:=]\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>)`);
  for (const src of sources) { const m = src.text.match(re); if (m) return { where: src.where, code: maskText(src.text.slice(m.index, m.index + 900).replace(/\s+/g, ' ')) }; }
  return null;
}

// a login page is either a classic form or ebfu.net's script login (loginUser() → loginUser.php)
const isLoginPage = (html, url) => !!findLoginForm(html, url) || /loginUser\s*\(|loginUser\.php/i.test(html);
const NAME_RE = /<(?:h[1-6]|span|div|b|strong|p|td|a)[^>]*>\s*([А-Я][а-я]+ [А-Я][а-я]+)\s*</;

async function ebfuLogin(username, password, diag) {
  if (!username || !password) return { ok: false, error: 'Enter your ebfu.net username and password.' };
  const jar = new Map();
  const first = await ebfuFetch(EBFU_BASE, jar, {}, diag);
  const form = findLoginForm(first.text, first.url);
  if (!form) return scriptLogin(first, jar, username, password, diag);
  const fields = new URLSearchParams();
  for (const f of form.inputs) {
    if (f.type === 'password') fields.set(f.name, password);
    else if (f === form.userField) fields.set(f.name, username);
    else if (f.type === 'hidden') fields.set(f.name, f.value);
    else if (f.type === 'checkbox' && f.checked) fields.set(f.name, f.value || 'on');
    else if (f === form.submit) fields.set(f.name, f.value);
  }
  const isGet = form.method === 'GET';
  const target = isGet ? form.action + (form.action.includes('?') ? '&' : '?') + fields : form.action;
  const res = await ebfuFetch(target, jar, { method: isGet ? 'GET' : 'POST', body: isGet ? undefined : fields.toString(),
    contentType: isGet ? undefined : 'application/x-www-form-urlencoded', referer: first.url }, diag);
  const text = stripTags(res.text.replace(/<head\b[\s\S]*?<\/head>/i, ' ')) + ' ' + (res.notices || []).join(' ');
  if (findLoginForm(res.text, res.url) || res.status >= 400) {
    const msg = (res.notices || [])[0] || (text.match(/[^.!?]{0,80}(?:грешн|невалид|неправил|заключ|блокир|опит)[^.!?]{0,80}/i) || [])[0];
    return { ok: false, error: msg ? 'ebfu.net says: ' + msg.trim() : 'ebfu.net did not accept the login.', inspect: summarizePage(res.text, res.url) };
  }
  const name = (res.text.match(NAME_RE) || [])[1] || '';
  return { ok: true, session: jarStr(jar), name, landing: maskUrl(res.url) };
}

// ---- ebfu.net's script login ----
// The "Вход" button runs loginUser(), which posts the fields to loginUser.php in the background (jQuery.ajax).
// Before sending anything, the site reads that function: the password is sent only if the function passes the
// typed password on unchanged. Anything unexpected → stop, send nothing, report the function instead
// (every wrong try counts toward ebfu.net's 5-try lock).
const inlineScripts = html => [...html.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n;\n');
function blockFrom(code, open) {           // text from an opening "{" to its matching "}", skipping strings and comments
  let depth = 0;
  for (let i = open; i < code.length && i < open + 20000; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; for (i++; i < code.length && code[i] !== q; i++) if (code[i] === '\\') i++; continue; }
    if (c === '/' && code[i + 1] === '/') { const n = code.indexOf('\n', i); i = n < 0 ? code.length : n; continue; }
    if (c === '/' && code[i + 1] === '*') { const n = code.indexOf('*/', i + 2); i = n < 0 ? code.length : n + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return code.slice(open, i + 1);
  }
  return null;
}
function splitTop(s) {                       // split "a: b, c: d(e, f)" at top-level commas
  const out = []; let depth = 0, cur = '', q = null;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++; if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
function loginPlan(html) {
  const js = inlineScripts(html);
  const call = js.match(/(?:jQuery|\$)\.(?:ajax|post)\(\s*\{\s*url\s*:\s*['"]([^'"]*login[^'"]*)['"]/i);
  if (!call) return { ok: false, why: 'no background login call found' };
  // the function that contains the call
  let fnStart = -1, fnName = '';
  for (const m of js.slice(0, call.index).matchAll(/function\s*([\w$]*)\s*\([^)]*\)\s*\{/g)) { fnStart = m.index + m[0].length - 1; fnName = m[1]; }
  const body = fnStart >= 0 ? blockFrom(js, fnStart) : null;
  if (!body || !body.includes(call[0])) return { ok: false, why: 'login function not readable', code: js.slice(Math.max(0, call.index - 1500), call.index + 800) };
  const code = 'function ' + fnName + '() ' + body;
  const dataM = body.slice(body.indexOf(call[0])).match(/data\s*:\s*\{/);
  const dataObj = dataM ? blockFrom(body, body.indexOf(call[0]) + dataM.index + dataM[0].length - 1) : null;
  if (!dataObj) return { ok: false, why: 'login fields not readable', code };
  const vars = {};
  for (const m of body.matchAll(/(?:let|var|const)\s+([\w$]+)\s*=\s*([^;\n]+)/g)) if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
  const inputType = id => { const t = html.match(new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i')); return t ? (attrOf(t[0], 'type') || 'text').toLowerCase() : ''; };
  const before = body.slice(0, body.indexOf(call[0]));
  const fields = [];
  for (const entry of splitTop(dataObj.slice(1, -1))) {
    const m = entry.match(/^["']?([\w$-]+)["']?\s*:\s*([\s\S]+)$/);
    if (!m) return { ok: false, why: 'unexpected field: ' + entry.slice(0, 40), code };
    const key = m[1], raw = m[2].trim();
    const ident = /^[\w$]+$/.test(raw) ? raw : null;
    const expr = ident && vars[ident] ? vars[ident] : raw;
    const el = expr.match(/^(?:\$|jQuery)\(\s*['"]#([\w-]+)['"]\s*\)\.val\(\)(\.trim\(\))?$/);
    if (el) {
      // the variable must not be changed again before it is sent (e.g. pass = md5(pass))
      if (ident && new RegExp(`(?<![\\w$.])${ident.replace(/\$/g, '\\$')}\\s*(?:[+\\-*/]?=(?!=)|\\+\\+|--)`).test(before.replace(new RegExp(`(?:let|var|const)\\s+${ident.replace(/\$/g, '\\$')}\\s*=`), ''))) return { ok: false, why: `"${key}" is changed before sending`, code };
      fields.push({ key, kind: inputType(el[1]) === 'password' ? 'password' : 'username', trim: !!el[2] });
    } else if (/\.width\(\)/.test(expr) || /^width$/i.test(key)) fields.push({ key, kind: 'width' });
    else if (/^attempt/i.test(key) || /^attempt/i.test(ident || '')) fields.push({ key, kind: 'attempt', ident });
    else if (/^-?\d+(\.\d+)?$/.test(raw) || /^(['"])[^'"]*\1$/.test(raw)) fields.push({ key, kind: 'literal', value: raw.replace(/^['"]|['"]$/g, '') });
    else return { ok: false, why: `unknown value for "${key}": ${raw.slice(0, 40)}`, code };
  }
  if (fields.filter(f => f.kind === 'password').length !== 1 || fields.filter(f => f.kind === 'username').length !== 1) return { ok: false, why: 'username/password fields not recognised', code };
  // attempt counter: its starting value, +1 if the function counts up before sending
  const att = fields.find(f => f.kind === 'attempt');
  if (att) {
    const id = att.ident || att.key;
    let n = Number((js.match(new RegExp(`(?:let|var|const)\\s+${id}\\s*=\\s*(\\d+)`)) || [])[1] || 0);
    if (new RegExp(`${id}\\s*\\+\\+|\\+\\+\\s*${id}|${id}\\s*\\+=\\s*1|${id}\\s*=\\s*${id}\\s*\\+\\s*1`).test(before)) n++;
    att.value = String(n);
  }
  const method = /type\s*:\s*['"]GET['"]/i.test(body.slice(body.indexOf(call[0]), body.indexOf(call[0]) + 600)) ? 'GET' : 'POST';
  const jumps = [...body.matchAll(/location(?:\.href)?\s*=\s*([^;\n]+)/g)].map(m => m[1].trim());
  return { ok: true, url: call[1], method, fields, jumps, code };
}
function evalJump(expr, answer) {             // "'interfaceReferees/' + result.page" → a URL, using the login answer
  let out = '';
  for (const part of splitTop(expr.replace(/\+/g, ','))) {
    const lit = part.match(/^(['"])(.*)\1$/);
    if (lit) { out += lit[2]; continue; }
    const prop = part.match(/^[\w$]+(?:\.([\w$]+)|\[['"]([\w$]+)['"]\])$/);
    const v = prop && answer && typeof answer === 'object' ? answer[prop[1] || prop[2]] : undefined;
    if (typeof v === 'string' || typeof v === 'number') { out += v; continue; }
    return null;
  }
  return out || null;
}
async function scriptLogin(first, jar, username, password, diag) {
  const plan = loginPlan(first.text);
  if (!plan.ok) return { ok: false, error: "Couldn't read ebfu.net's login script (" + plan.why + '). Nothing was sent to ebfu.net.',
    inspect: { ...summarizePage(first.text, first.url), loginFunction: maskText(String(plan.code || '').slice(0, 6000)) } };
  diag.push('login fields: ' + plan.fields.map(f => f.key + '=' + f.kind).join(', '));
  const fields = new URLSearchParams();
  for (const f of plan.fields) fields.set(f.key, f.kind === 'username' ? username.trim() : f.kind === 'password' ? (f.trim ? password.trim() : password) : f.kind === 'width' ? '1280' : f.value);
  const target = new URL(plan.url, first.url).toString();
  const xhr = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', Origin: 'https://ebfu.net' };
  const res = await ebfuFetch(plan.method === 'GET' ? target + (target.includes('?') ? '&' : '?') + fields : target, jar,
    { method: plan.method, body: plan.method === 'GET' ? undefined : fields.toString(), contentType: plan.method === 'GET' ? undefined : 'application/x-www-form-urlencoded; charset=UTF-8', referer: first.url, headers: xhr }, diag);
  let answer = null;
  try { answer = JSON.parse(res.text.replace(/^﻿/, '').trim()); } catch {}
  diag.push('login answer: ' + (answer && typeof answer === 'object' ? 'JSON keys ' + Object.keys(answer).join(',') : 'HTTP ' + res.status + ' ' + (res.text.trim().length < 40 ? JSON.stringify(res.text.trim()) : res.text.length + ' chars')));
  // follow where the login script would send the browser on success
  const jumps = plan.jumps.map(j => evalJump(j, answer)).filter(Boolean);
  if (answer && typeof answer === 'object') Object.values(answer).forEach(v => { if (typeof v === 'string' && /^(?:https?:\/\/(?:www\.)?ebfu\.net\/|[\w\/.-]+\.php)/i.test(v)) jumps.push(v); });
  let landing = null;
  for (const j of [...new Set(jumps)].slice(0, 2)) {
    try { const u = new URL(j, first.url).toString(); if (!/(^|\.)ebfu\.net$/i.test(new URL(u).hostname)) continue; const pg = await ebfuFetch(u, jar, { referer: first.url }, diag); if (!isLoginPage(pg.text, pg.url)) { landing = pg; break; } } catch {}
  }
  // the real test: can the video archive be opened now?
  const check = landing && /videoShow/i.test(landing.url) ? landing : await ebfuFetch(EBFU_ARCHIVE, jar, { referer: first.url }, diag);
  if (!isLoginPage(check.text, check.url)) {
    const name = ((landing || check).text.match(NAME_RE) || check.text.match(NAME_RE) || [])[1] || '';
    return { ok: true, session: jarStr(jar), name, landing: maskUrl((landing || check).url) };
  }
  const says = [];
  (function walk(o) { if (typeof o === 'string') { if (/[А-Яа-я]{3,}/.test(o) && o.length < 300) says.push(o); } else if (o && typeof o === 'object') Object.values(o).forEach(walk); })(answer);
  const msg = says[0] || (res.notices || [])[0] || (stripTags(res.text).match(/[^.!?]{0,80}(?:грешн|невалид|неправил|заключ|блокир|опит)[^.!?]{0,80}/i) || [])[0];
  const safe = t => maskText(String(t).split(password).join('•••'));
  return { ok: false, error: msg ? 'ebfu.net says: ' + safe(msg).trim() : 'ebfu.net did not accept the login.',
    inspect: { loginFields: plan.fields.map(f => f.key + '=' + f.kind), answer: answer ? safe(JSON.stringify(answer)).slice(0, 1500) : safe(res.text.slice(0, 800)), loginFunction: maskText(plan.code.slice(0, 4000)) } };
}

async function ebfuExplore(session, diag) {
  if (!session) return { ok: false, error: 'Connect ebfu.net first.' };
  const jar = jarFrom(session), report = { pages: [], notes: [] };
  let start = await ebfuFetch(EBFU_BASE, jar, {}, diag);
  if (isLoginPage(start.text, start.url)) {
    start = await ebfuFetch(EBFU_ARCHIVE, jar, {}, diag);
    if (isLoginPage(start.text, start.url)) return { ok: false, expired: true, error: 'The ebfu.net session has expired. Connect again.' };
    report.notes.push('The start address shows the login page, so Видеоархив was opened directly.');
  }
  report.pages.push({ step: 'start', ...summarizePage(start.text, start.url) });
  const scripts = [{ where: 'start page', text: start.text }];
  const done = () => ({ ok: true, report, session: jarStr(jar) });

  // 1. "Видеоархив" (in the burger menu on phones, straight in the menu on computers — same page underneath)
  const toArchive = clickables(start.text, start.url).find(c => c.how && /видео\s*архив|видеоархив|video\s*archive/i.test(c.text))
    || clickables(start.text, start.url).find(c => c.how && /videoShow|video|archive|arhiv/i.test((c.url || '') + c.target))
    || { how: 'get', url: EBFU_ARCHIVE, text: 'Видеоархив (direct address)' };
  const archive = start.url.startsWith(EBFU_ARCHIVE) ? start : await follow(toArchive, start, jar, diag);
  if (isLoginPage(archive.text, archive.url)) return { ok: false, expired: true, error: 'The ebfu.net session has expired. Connect again.' };
  report.pages.push({ step: 'archive', via: toArchive.how + (toArchive.text.includes('direct') ? ' (direct address)' : ''), ...summarizePage(archive.text, archive.url) });
  scripts.push({ where: 'archive page', text: archive.text });

  // 2. league round tiles ("efbet Лига КРЪГ 12", "ВПФЛ КРЪГ 3", "В ЮЗ …", "U17 …"): take the newest efbet Лига round
  const tiles = clickables(archive.text, archive.url).filter(c => c.how && /кръг|krug|round|rnd/i.test(c.text + ' ' + (c.url || '') + ' ' + c.tag));
  report.roundTiles = tiles.slice(0, 60).map(c => ({ text: c.text, how: c.how, ...(c.url ? { url: maskUrl(c.url) } : {}), ...(c.target ? { postback: c.target } : {}) }));
  const efbet = tiles.filter(c => /efbet/i.test(c.text));
  const order = (efbet.length ? efbet : tiles).slice().sort((x, y) => roundNo(y.text) - roundNo(x.text));
  if (!order.length) { report.notes.push('No league/round tiles found on the archive page.'); return done(); }
  // newest round first; a round just played may have no videos yet, so up to two older ones are tried
  let round = null, tile = null, cams = [];
  for (const t of order.slice(0, 3)) {
    const pg = await follow(t, archive, jar, diag).catch(e => { report.notes.push(t.text + ': ' + e.message); return null; });
    if (!pg || pg.status >= 400) { report.notes.push(t.text + ': HTTP ' + (pg ? pg.status : '?')); continue; }
    round = pg; tile = t; cams = clickables(pg.text, pg.url).filter(c => c.camera);
    if (cams.length) break;
    report.notes.push(t.text + ': no camera buttons, trying an older round');
  }
  if (!round) return done();
  report.pages.push({ step: 'round', tile: tile.text, via: tile.how, ...summarizePage(round.text, round.url) });
  scripts.push({ where: 'round page', text: round.text });
  report.matchCard = cardSample(round.text);

  // 3. the camera button of the first match: a link, a postback, or a script that opens the pop-up player
  report.cameraButtons = cams.slice(0, 4).map(c => ({ how: c.how || 'script', ...(c.url ? { url: maskUrl(c.url) } : {}), ...(c.target ? { postback: c.target } : {}), ...(c.fn ? { calls: c.fn.name + '(' + c.fn.args + ')' } : {}), tag: c.tag }));
  if (!cams.length) report.notes.push('No camera button recognised on the round page (see matchCard and clicks).');

  // the site's own scripts (not libraries): the addresses they call and the camera function
  const isEbfu = x => { try { return /(^|\.)ebfu\.net$/i.test(new URL(x).hostname); } catch { return false; } };
  const own = [...new Set(report.pages.flatMap(pg => pg.scripts).filter(x => isEbfu(x) && !/jquery|bootstrap|font|analytics|gtag|moment|select2|datatables|popper|sweetalert|toastr/i.test(x)))].slice(0, 4);
  report.scriptCalls = [];
  for (const src of own) {
    try {
      const js = (await ebfuFetch(src, jar, { referer: round.url }, diag)).text;
      scripts.push({ where: src, text: js });
      const calls = [...js.matchAll(/["'`](\/?(?:api|ajax|handlers?|services?|video|archive|arhiv|match|stream|player)[\w\/.-]{2,80}(?:\?[^"'`\s]{0,60})?)["'`]/gi)].map(m => m[1]);
      report.scriptCalls.push({ src, calls: [...new Set(calls)].slice(0, 40) });
    } catch (e) { report.scriptCalls.push({ src, error: e.message }); }
  }
  const cam = cams[0];
  if (cam && cam.how) {
    const video = await follow(cam, round, jar, diag);
    report.pages.push({ step: 'video', via: cam.how, ...summarizePage(video.text, video.url) });
  } else if (cam && cam.fn) {
    const fn = findFunction(cam.fn.name, scripts);
    report.cameraFunction = fn || { missing: cam.fn.name };
    // try the address that function loads the video from, once, with this match's own id
    const arg = (cam.fn.args.match(/['"]?([\w-]{1,40})['"]?/) || [])[1];
    const path = fn && (fn.code.match(/["'`](\/?[\w\/.-]+(?:\.(?:ashx|aspx|php|json)|\/[\w-]*)(?:\?[\w.-]*=)?)["'`]\s*\+/) || [])[1];
    if (arg && path) {
      try {
        const probe = await ebfuFetch(new URL(path + encodeURIComponent(arg), round.url).toString(), jar, { referer: round.url }, diag);
        report.cameraProbe = { url: maskUrl(new URL(path, round.url).toString()) + '…', status: probe.status, type: probe.type, preview: maskText(probe.text.slice(0, 600)) };
      } catch (e) { report.cameraProbe = { error: e.message }; }
    } else report.notes.push('The camera button runs ' + cam.fn.name + '(); its video address is built inside that function (see cameraFunction).');
  }
  return done();
}

/* ---------------- /drive/list: the videos in a shared Google Drive folder ---------------- */
// Google's own embeddable folder view lists a public folder's files and subfolders without any API key.
const DRIVE_VIDEO = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|mpe?g|3gp|flv|mts|m2ts|ts)$/i;
const driveFolderId = u => { const m = String(u || '').match(/\/folders\/([\w-]{10,})/) || String(u || '').match(/[?&]id=([\w-]{10,})/); return m ? m[1] : (/^[\w-]{10,}$/.test(String(u || '')) ? String(u) : null); };
const unhtml = t => String(t || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();
export function parseDriveFolder(html) {
  const files = [], folders = [], seen = new Set();
  const title = unhtml((String(html).match(/<title>([\s\S]*?)<\/title>/i) || [])[1]).replace(/\s*[-–]\s*Google Drive\s*$/i, '');
  // one entry per file / subfolder: <div class="flip-entry" id="entry-ID"> … <a href=".../file/d/ID/..."> … <div class="flip-entry-title">NAME</div>
  const chunks = String(html).split(/<div[^>]+class="flip-entry"/i).slice(1);
  for (const c of chunks) {
    const f = c.match(/\/file\/d\/([\w-]{10,})/), d = c.match(/\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/);
    const name = unhtml((c.match(/class="flip-entry-title"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
    const id = f ? f[1] : d ? d[1] : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    (f ? files : folders).push({ id, name });
  }
  if (!chunks.length) {        // a changed page layout: fall back to the links alone
    for (const m of String(html).matchAll(/\/file\/d\/([\w-]{10,})/g)) if (!seen.has(m[1])) { seen.add(m[1]); files.push({ id: m[1], name: '' }); }
    for (const m of String(html).matchAll(/\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/g)) if (!seen.has(m[1])) { seen.add(m[1]); folders.push({ id: m[1], name: '' }); }
  }
  return { title, files, folders };
}
async function handleDrive(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const member = await checkMember(request.headers.get('Authorization') || '', env);
  if (!member.ok) return json({ ok: false, error: member.error }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad request' }, 400); }
  const root = driveFolderId(body.url);
  if (!root) return json({ ok: false, error: 'That is not a Google Drive folder link.' }, 400);
  // the folder and its subfolders, breadth first: up to 40 folders and 500 videos
  const out = [], queue = [{ id: root, path: '' }], done = new Set();
  let rootTitle = '', skipped = 0, failed = 0;
  while (queue.length && done.size < 40 && out.length < 500) {
    const { id, path } = queue.shift();
    if (done.has(id)) continue;
    done.add(id);
    let html;
    try {
      const r = await fetch('https://drive.google.com/embeddedfolderview?id=' + encodeURIComponent(id), { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(12000) });
      if (!r.ok) { failed++; if (id === root) return json({ ok: false, error: r.status === 404 ? 'Folder not found — is it shared as "Anyone with the link"?' : 'Google Drive answered ' + r.status }); continue; }
      html = await r.text();
    } catch (e) { failed++; if (id === root) return json({ ok: false, error: 'Google Drive did not answer: ' + e.message }); continue; }
    const p = parseDriveFolder(html);
    if (id === root) rootTitle = p.title;
    if (id === root && !p.files.length && !p.folders.length && /accounts\.google\.com|ServiceLogin/i.test(html))
      return json({ ok: false, error: 'The folder is private. In Google Drive choose Share → General access → "Anyone with the link", then try again.' });
    for (const f of p.files) {
      if (f.name && !DRIVE_VIDEO.test(f.name)) { skipped++; continue; }
      out.push({ id: f.id, name: f.name, folder: path, url: 'https://drive.google.com/file/d/' + f.id + '/view' });
    }
    for (const d of p.folders) queue.push({ id: d.id, path: (path ? path + ' / ' : '') + (d.name || 'folder') });
  }
  return json({ ok: true, folder: rootTitle, files: out.slice(0, 500), skipped, folders: done.size, failed, more: queue.length > 0 || out.length >= 500 });
}

/* ---------------- helpers ---------------- */
function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*',
    'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' } });
}
function text(msg, status) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}
