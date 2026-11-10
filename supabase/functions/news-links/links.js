// Google News article links → the articles' own addresses. Plain JS so it can be tested with Node.
// A Google News RSS link (news.google.com/rss/articles/CBMi…) is an encoded id. Old ids carry the address inside; new
// ones (with "AU_yqL") only Google's decoder can turn into it, and it answers "too many requests" to servers (search
// engines turn them away too), so the article is found by its headline in the outlet's own feed: its RSS / Atom feed
// or its news sitemap, which list the newest articles with their headlines and addresses.

// "https://news.google.com/rss/articles/CBMi…?oc=5" → "CBMi…"
export const googleId = link => {
  const m = String(link || '').match(/^https:\/\/news\.google\.com\/(?:rss\/)?articles\/([\w-]+)/);
  return m ? m[1] : null;
};

// an old id carries the address itself
export function oldIdUrl(id) {
  try {
    const b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    if (bin.includes('AU_yqL')) return null;
    const m = bin.match(/https?:\/\/[\x21-\x7e]+/);
    return m ? m[0] : null;
  } catch { return null; }
}

export const goodUrl = u => typeof u === 'string' && /^https?:\/\/[^\s/]+\.[^\s/]+/.test(u) && !/^https?:\/\/news\.google\.com\//.test(u);

/* ───────── the outlet's own feed ───────── */
const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const unent = s => String(s).replace(/&(#x?[\da-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m));
const cdata = s => unent(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
export const words = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(w => w.length > 1);

// the outlets Google names without their address
export const SITES = { 'BBC': ['bbc.co.uk', 'bbc.com'], 'ESPN': ['espn.com', 'espn.co.uk'], 'Sky Sports': ['skysports.com'],
  'London Evening Standard': ['standard.co.uk'], 'TNT Sports': ['tntsports.co.uk'], 'The New York Times': ['nytimes.com'], 'Diario AS': ['as.com'],
  'beIN SPORTS': ['beinsports.com'], 'Football Italia': ['football-italia.net'], 'Premier League': ['premierleague.com'], 'The Guardian': ['theguardian.com'],
  'The Independent': ['independent.co.uk'], 'The Sun': ['thesun.co.uk'], 'Sports Illustrated': ['si.com'], 'Mundo Deportivo': ['mundodeportivo.com'],
  'The Mirror': ['mirror.co.uk'], 'talkSPORT': ['talksport.com'], 'Reuters': ['reuters.com'], 'NBC Sports': ['nbcsports.com'], 'MARCA': ['marca.com'],
  'Football365': ['football365.com'], 'France 24': ['france24.com'],
  'Novsport': ['novsport.com'], 'ФОКУС': ['focus-news.net'], 'БНР Новини': ['bnr.bg'], 'БНР': ['bnr.bg'], 'БНТ Новини': ['bntnews.bg'],
  'Делник БГ': ['delnik.bg'], 'Арена Спорт': ['arenasport.bg'], 'Таралеж: Истината има значение': ['taralej.com'], 'bTV Спорт': ['btvsport.bg'],
  'Тема Спорт': ['temasport.com'], 'Утро Русе': ['utroruse.com'], 'Пловдив Нюз': ['plovdivnews.bg'], 'Вестник "ДУМА"': ['duma.bg'], 'Webcafe': ['webcafe.bg'],
  'БТА': ['bta.bg'], 'Вестник Борба': ['borbabg.com'], 'Евроком': ['eurocom.bg'], 'Стандарт нюз': ['standartnews.com'], 'Bgonair': ['bgonair.bg'],
  'Palms Sport': ['palms-sport.com'], 'KotaSport': ['kotasport.com'] };
// where an outlet's articles are: its address when Google gives one ("Blitz.bg", "https://novini247.com/"), else the known one
export function outletSite(src) {
  const s = String(src || '').trim();
  const addr = s.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(addr)) return addr;
  return SITES[s] ? SITES[s][0] : null;
}
// the feeds a page announces: <link rel="alternate" type="application/rss+xml" href="…">
export function feedLinks(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(?:rss|atom)\+xml/i.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    try { const u = new URL(unent(href), base).toString(); if (!out.includes(u) && !/comments/i.test(u)) out.push(u); } catch { /* skip */ }
  }
  return out;
}
// a feed's articles: RSS <item>, Atom <entry>, or a news sitemap's <url> with <news:title>
export function feedItems(xml) {
  const x = String(xml), out = [];
  for (const m of x.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const t = cdata((m[0].match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const l = cdata((m[0].match(/<link\b[^>]*>([\s\S]*?)<\/link>/i) || [])[1]) || cdata((m[0].match(/<guid\b[^>]*>([\s\S]*?)<\/guid>/i) || [])[1]);
    if (t && /^https?:\/\//.test(l)) out.push({ title: t, url: l });
  }
  for (const m of x.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const t = cdata((m[0].match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const l = unent((m[0].match(/<link\b[^>]*href=["']([^"']+)["']/i) || [])[1] || '');
    if (t && /^https?:\/\//.test(l)) out.push({ title: t, url: l });
  }
  for (const m of x.matchAll(/<url>[\s\S]*?<\/url>/gi)) {
    const t = cdata((m[0].match(/<news:title>([\s\S]*?)<\/news:title>/i) || [])[1]);
    const l = cdata((m[0].match(/<loc>([\s\S]*?)<\/loc>/i) || [])[1]);
    if (t && /^https?:\/\//.test(l)) out.push({ title: t, url: l });
  }
  return out;
}
// the feed's article with the same headline (word for word, give or take a word or two)
export function matchTitle(items, title) {
  const A = new Set(words(title));
  if (A.size < 3) return null;
  let best = null, score = 0;
  for (const it of items) {
    const T = new Set(words(it.title));
    let n = 0; for (const w of T) if (A.has(w)) n++;
    const s = n / Math.max(A.size, T.size);
    if (s >= 0.8 && s > score && goodUrl(it.url)) { best = it.url; score = s; }
  }
  return best;
}
// the football feeds of outlets whose home page announces none, or only its general news
export const FEEDS = {
  'bbc.co.uk': ['https://feeds.bbci.co.uk/sport/football/rss.xml', 'https://feeds.bbci.co.uk/sport/rss.xml'],
  'skysports.com': ['https://www.skysports.com/rss/12040', 'https://www.skysports.com/rss/11095'],
  'espn.com': ['https://www.espn.com/espn/rss/soccer/news'], 'theguardian.com': ['https://www.theguardian.com/football/rss'],
  'independent.co.uk': ['https://www.independent.co.uk/sport/football/rss'], 'thesun.co.uk': ['https://www.thesun.co.uk/sport/football/feed/'],
  'mirror.co.uk': ['https://www.mirror.co.uk/sport/football/?service=rss'], 'talksport.com': ['https://talksport.com/football/feed/'],
  'standard.co.uk': ['https://www.standard.co.uk/sport/football/rss'], 'football365.com': ['https://www.football365.com/feed'],
  'goal.com': ['https://www.goal.com/en/feeds/news?fmt=rss'],
};
// the sitemaps robots.txt names: news sitemaps (the last two days, with headlines) first
export function robotsSitemaps(txt) {
  const all = [...String(txt).matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]).filter(u => /^https?:\/\//.test(u));
  return [...all.filter(u => /news/i.test(u)), ...all.filter(u => !/news/i.test(u))].filter((u, i, a) => a.indexOf(u) === i);
}
// where to look for an outlet's feed when its home page doesn't say
export const feedGuesses = site => {
  const hosts = site.split('.').length > 2 ? [site] : ['www.' + site, 'sport.' + site];
  return hosts.flatMap(h => ['/rss', '/feed', '/rss.xml', '/sitemap-news.xml', '/news-sitemap.xml'].map(p => `https://${h}${p}`));
};
