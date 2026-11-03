// Cloudflare Pages "advanced mode" worker for BG Referee Watch.
// - Serves the site (index.html) as normal.
// - /feed?url=...  fetches a Google News or Bing News RSS feed on the page's behalf,
//   so the browser does not need public CORS proxies. Only these news hosts are allowed,
//   so the relay cannot be abused as an open proxy.

const ALLOWED_HOSTS = ['news.google.com', 'www.bing.com', 'bing.com'];
const CACHE_SECONDS = 900; // identical searches within 15 minutes are served from Cloudflare's cache

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/feed') return handleFeed(request, url, ctx);
    return env.ASSETS.fetch(request);
  },
};

async function handleFeed(request, url, ctx) {
  if (request.method !== 'GET') return text('Method not allowed', 405);

  let target;
  try { target = new URL(url.searchParams.get('url') || ''); }
  catch { return text('Missing or invalid ?url=', 400); }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
    return text('Host not allowed', 403);
  }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'bg-BG,bg;q=0.9,en;q=0.6',
      },
      redirect: 'follow',
    });
  } catch (e) {
    return text('Upstream fetch failed: ' + e.message, 502);
  }

  const body = await upstream.text();
  const response = new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
  // Cache only real feeds, never error or "unusual traffic" pages
  if (cache && upstream.ok && /<(rss|channel|feed)[\s>]/i.test(body)) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

function text(msg, status) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
}
