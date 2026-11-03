// Cloudflare Pages "advanced mode" worker for BG Referee Watch.
//
//   /feed?url=...     Google News / Bing News RSS relay (only those hosts), so the page needs no public proxies.
//   /extract?url=...  Opens a news article (resolving Google News links first) and returns, as JSON only,
//                     the videos embedded in it and the match minutes the text mentions.
//   /config.json      Supabase URL + anon key from the Pages environment variables
//                     SUPABASE_URL and SUPABASE_ANON_KEY (both are public by design; data is protected by RLS).
//   everything else   the static site.

const FEED_HOSTS = ['news.google.com', 'www.bing.com', 'bing.com'];
const FEED_CACHE_SECONDS = 900;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BROWSER_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'bg-BG,bg;q=0.9,en;q=0.6' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/feed') return handleFeed(request, url, ctx);
    if (url.pathname === '/extract') return handleExtract(request, url, ctx);
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
    upstream = await fetch(target.toString(), { headers: { ...BROWSER_HEADERS, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' }, redirect: 'follow' });
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

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }

  let result;
  try {
    let articleUrl = target.toString();
    if (target.hostname === 'news.google.com') {
      articleUrl = await resolveGoogleNews(target);
      if (!articleUrl) throw new Error('could not resolve the Google News link');
    }
    const page = await fetch(articleUrl, { headers: { ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow' });
    if (!page.ok) throw new Error('article returned HTTP ' + page.status);
    const html = await decodeBody(page);
    const finalUrl = page.url || articleUrl;
    result = { ok: true, url: finalUrl, ...extractFromHtml(html, finalUrl) };
  } catch (e) {
    result = { ok: false, error: String((e && e.message) || e) };
  }
  const response = json(result, 200, result.ok ? 21600 : 1800);
  if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

function isPrivateHost(h) {
  h = h.toLowerCase();
  return h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[');
}

// Google News RSS links are encoded article ids; old ids contain the URL, new ones need Google's own decoder call.
async function resolveGoogleNews(u) {
  const m = u.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/);
  if (!m) return null;
  const id = m[1];
  try {
    const b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const found = bin.match(/https?:\/\/[\x21-\x7e]+/);
    if (found && !bin.includes('AU_yqL')) return found[0].replace(/[\x00-\x20\x7f-\xff]+$/, '');
  } catch {}
  const page = await fetch('https://news.google.com/rss/articles/' + id, { headers: BROWSER_HEADERS });
  const html = await page.text();
  const sg = (html.match(/data-n-a-sg="([^"]+)"/) || [])[1];
  const ts = (html.match(/data-n-a-ts="([^"]+)"/) || [])[1];
  if (!sg || !ts) return null;
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
  const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]])),
  });
  const txt = await r.text();
  try {
    const part = txt.split('\n\n')[1];
    const decoded = JSON.parse(JSON.parse(part)[0][2])[1];
    return /^https?:\/\//.test(decoded) ? decoded : null;
  } catch { return null; }
}

async function decodeBody(resp) {
  const bytes = new Uint8Array((await resp.arrayBuffer()).slice(0, 2500000));
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
const AD_HOSTS = /doubleclick|googlesyndication|googleadservices|adservice|taboola|outbrain|teads|adform|criteo|amazon-adsystem|smartadserver|gemius|facebook\.com\/(?:tr|plugins\/(?:like|share|page|comments))/i;
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly|vbox7\.com|streamable\.com|facebook\.com|fb\.watch|twitter\.com|x\.com)$/i;

function extractFromHtml(html, pageUrl) {
  html = String(html).slice(0, 2500000);
  const meta = prop => {
    const tag = (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i')) || [])[0];
    if (!tag) return '';
    return decodeEntities((tag.match(/content=["']([^"']*)["']/i) || [])[1] || '');
  };
  const title = meta('og:title') || decodeEntities(((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim());
  const region = articleRegion(html);

  const cands = [];
  const add = (u, how) => {
    if (!u) return;
    u = decodeEntities(String(u).trim());
    if (u.startsWith('//')) u = 'https:' + u;
    let parsed;
    try { parsed = new URL(u, pageUrl); } catch { return; }
    if (!/^https?:$/.test(parsed.protocol) || AD_HOSTS.test(parsed.href)) return;
    const isFile = /\.(mp4|webm|m3u8|mov)(\?|$)/i.test(parsed.pathname);
    if (!isFile && !VIDEO_HOSTS.test(parsed.hostname) && how !== 'ld' && how !== 'meta') return;
    if (/(^|\.)facebook\.com$/i.test(parsed.hostname) && !/\/videos\/|\/watch|\/reel\/|plugins\/video\.php/.test(parsed.href)) return;
    if (/(^|\.)(twitter|x)\.com$/i.test(parsed.hostname) && !/\/status\/\d+/.test(parsed.pathname)) return;
    if (!cands.some(c => c.url === parsed.href)) cands.push({ url: parsed.href, how });
  };

  // 1. structured data
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim()), o => { if (/VideoObject/i.test(String(o['@type'] || ''))) { add(o.embedUrl, 'ld'); add(o.contentUrl, 'ld'); } }); } catch {}
  }
  // 2. page-level video tags
  ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player'].forEach(p => add(meta(p), 'meta'));
  // 3. players and links inside the article body
  for (const m of region.matchAll(/<iframe\b[^>]*?\s(?:data-src|data-lazy-src|src)=["']([^"']+)["']/gi)) add(m[1], 'iframe');
  for (const m of region.matchAll(/<(?:video|source)\b[^>]*?\ssrc=["']([^"']+)["']/gi)) add(m[1], 'video');
  for (const m of region.matchAll(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{11}/gi)) add(m[0], 'link');
  for (const m of region.matchAll(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/\w+\/status\/\d+/gi)) add(m[0], 'link');
  for (const m of region.matchAll(/https?:\/\/(?:www\.)?(?:facebook\.com\/[^"'\s<>]+\/videos\/[^"'\s<>]+|fb\.watch\/[\w-]+)/gi)) add(m[0], 'link');
  for (const m of region.matchAll(/https?:\/\/(?:www\.)?vbox7\.com\/(?:play:\w+|emb\/external\.php\?vid=\w+)/gi)) add(m[0], 'link');

  const text = htmlToText(region).slice(0, 200000);
  return { title: title.slice(0, 300), videos: cands.slice(0, 8), minutes: findMinutes(text) };
}

function walk(o, fn) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach(x => walk(x, fn)); return; }
  fn(o);
  Object.values(o).forEach(v => walk(v, fn));
}

function articleRegion(html) {
  const blocks = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map(m => m[0]).sort((a, b) => b.length - a.length);
  if (blocks.length && blocks[0].length > 300) return blocks[0];
  const m = html.match(/<(?:div|section)[^>]+(?:class|id)=["'][^"']*(?:article[-_]?(?:body|content|text)|entry-content|post-content|news-(?:body|content|text)|story-body|content-body|text-content|single-content)[^"']*["'][^>]*>/i);
  if (m) return html.slice(m.index, m.index + 80000);
  const b = html.search(/<body/i);
  return b >= 0 ? html.slice(b) : html;
}

function htmlToText(h) {
  return decodeEntities(h
    .replace(/<(script|style|noscript|svg|template|nav|footer|aside|form|header)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n')
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

// "в 67-ата минута", "90+3-ата минута", "минута 54", "67'" → minute + a short context snippet
const MIN_RE = /(?<![\p{L}\p{N}])(\d{1,3})(?:\s*\+\s*(\d{1,2}))?(?:\s*-?\s*(?:вата|рата|мата|ата|ия|та|ва|ра|ма))?\s+(?:минута(?![\p{L}])|мин\.)|(?<![\p{L}])минута\s+(\d{1,3})(?:\s*\+\s*(\d{1,2}))?(?![\p{N}])|(?<![\p{L}\p{N}])(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s?['’′](?![\p{L}\p{N}])/giu;
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
    if (out.has(key) || out.size >= 15) return;
    const sS = sentenceStart(h.start), sE = sentenceEnd(h.end);
    // tags come only from this minute's own part of the sentence (up to the neighbouring minute mentions)
    // when two minutes share a sentence, split it at the last comma/semicolon between them
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
