// Cloudflare Pages "advanced mode" worker for BG Referee Watch.
//
//   /feed?url=...                 Google News / Bing News RSS relay (only those hosts).
//   /extract?url=...&title=&src=  Opens a news article and returns, as JSON only, the videos embedded in it,
//                                 the match minutes the text mentions, and what was tried (diag).
//   /config.json                  Supabase URL + key from the Pages environment variables
//                                 SUPABASE_URL and SUPABASE_ANON_KEY (public by design; data is protected by RLS).
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
  const cacheKey = new Request(url.origin + '/selftest?v=' + EXTRACT_VERSION, { method: 'GET' });
  if (cache && !url.searchParams.has('fresh')) { const hit = await cache.match(cacheKey); if (hit) return hit; }
  const out = { time: new Date().toISOString(), version: EXTRACT_VERSION };
  let items = [];
  try {
    const r = await fetch('https://news.google.com/rss/search?q=' + encodeURIComponent('съдия efbet Лига') + '&hl=bg&gl=BG&ceid=BG:bg',
      { headers: { ...BROWSER_HEADERS, Cookie: GOOGLE_COOKIES }, signal: AbortSignal.timeout(10000) });
    const xml = await r.text();
    items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 2).map(m => ({
      title: decodeEntities((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''), link: ((m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim() }));
    out.googleFeed = { status: r.status, items: (xml.match(/<item>/g) || []).length };
  } catch (e) { out.googleFeed = { error: e.message }; }
  out.googleLinks = await Promise.all(items.map(async it => {
    const diag = [], cut = it.title.lastIndexOf(' - ');
    const title = cut > 15 ? it.title.slice(0, cut) : it.title, src = cut > 15 ? it.title.slice(cut + 3) : '';
    let resolved = null;
    try { resolved = await resolveGoogleNews(new URL(it.link), { title, src }, diag); } catch (e) { diag.push(e.message); }
    return { title: title.slice(0, 90), source: src, resolved, diag };
  }));
  const urls = [...out.googleLinks.map(g => g.resolved).filter(Boolean), ...SELFTEST_ARTICLES];
  out.articles = await Promise.all(urls.map(async u => {
    const diag = [], page = await fetchArticle(u, diag);
    return { url: u.slice(0, 110), opened: !!page, diag, kb: page ? Math.round(page.html.length / 1024) : 0,
      iframes: page ? (page.html.match(/<iframe\b/gi) || []).length : 0,
      youtube: page ? (page.html.match(/youtube(?:-nocookie)?\.com\/(?:embed|watch)|youtu\.be\/|videoid=/gi) || []).length : 0 };
  }));
  const response = json(out, 200, 600);
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
  for (const q of queries) {
    for (const base of ['https://www.bing.com/news/search?format=rss&q=', 'https://www.bing.com/search?format=rss&q=']) {
      try {
        const r = await fetch(base + encodeURIComponent(q) + '&setlang=bg&cc=BG', { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
        const xml = await r.text();
        for (const it of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
          const t = decodeEntities((it[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
          let link = decodeEntities((it[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
          try { const lu = new URL(link); link = lu.searchParams.get('url') || link; } catch { continue; }
          let host = ''; try { host = new URL(link).hostname; } catch { continue; }
          if (/(^|\.)(bing|google|microsoft|msn)\.com$/.test(host)) continue;
          if (site && !host.endsWith(site)) continue;
          if (similarity(t, title) >= 0.6) { diag.push('found on Bing: ' + host); return link; }
        }
      } catch (e) { diag.push('bing error: ' + e.message); }
    }
  }
  diag.push('headline not found on Bing');
  return null;
}

// Some news sites block cloud servers; then the article is read through public relays and a reader
// service (which opens the page like a browser, so videos added by scripts are included). The relays are
// tried at the same time and the first good answer wins, so a blocked site costs seconds, not a minute.
const isBotWall = h => h.length < 80000 && /cf-chl|challenge-platform|Just a moment\.\.\.|Attention Required|captcha|DDoS-Guard|Access denied|enable JavaScript and cookies/i.test(h.slice(0, 30000));
const RELAYS = [
  ['allorigins', u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u), { 'User-Agent': UA }],
  ['codetabs', u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), { 'User-Agent': UA }],
  ['reader', u => 'https://r.jina.ai/' + u, { 'X-Return-Format': 'html', 'X-Timeout': '15' }],
];
async function tryRoute(name, href, headers, ms, diag) {
  try {
    const r = await fetch(href, { redirect: 'follow', signal: AbortSignal.timeout(ms), headers });
    const html = await decodeBody(r);
    if (r.ok && html.length > 1500 && !isBotWall(html)) return { html, finalUrl: r.url, name };
    diag.push(`article ${name}: HTTP ${r.status}${isBotWall(html) ? ' bot check' : html.length <= 1500 ? ' empty' : ''}`);
  } catch (e) { diag.push(`article ${name}: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`); }
  return null;
}
async function fetchArticle(articleUrl, diag) {
  const direct = await tryRoute('direct', articleUrl, { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml' }, 8000, diag);
  if (direct) { diag.push('article opened (direct)'); return { html: direct.html, finalUrl: direct.finalUrl || articleUrl }; }
  const hit = await Promise.any(RELAYS.map(([name, make, headers]) =>
    tryRoute(name, make(articleUrl), headers, 16000, diag).then(r => r || Promise.reject()))).catch(() => null);
  if (hit) { diag.push('article opened (' + hit.name + ')'); return { html: hit.html, finalUrl: articleUrl }; }
  return null;
}

async function decodeBody(resp) {
  const bytes = new Uint8Array((await resp.arrayBuffer()).slice(0, 2000000));
  let charset = ((resp.headers.get('content-type') || '').match(/charset=["']?([\w-]+)/i) || [])[1];
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
  html = String(html).slice(0, 2000000);
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
  if (!cands.length) scanEmbeds(stripBlocks(html, ['aside', 'footer', 'nav']), 'page');
  // 4. video files referenced by the page's own player script
  if (!cands.some(c => c.kind !== 'player')) {
    for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>()]+?\.(?:mp4|m3u8)(?:\?[^"'\s<>()]*)?/gi)) { add(m[0].replace(/\\\//g, '/'), 'script'); if (cands.length >= 6) break; }
  }

  const text = htmlToText(region).slice(0, 200000);
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

/* ---------------- helpers ---------------- */
function json(obj, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(obj), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*',
    'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' } });
}
function text(msg, status) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}
