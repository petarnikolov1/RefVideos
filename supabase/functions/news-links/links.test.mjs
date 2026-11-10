// Tests for links.js (Google News links → the articles' own addresses). Run: node links.test.mjs
import * as G from './links.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

ok(G.googleId('https://news.google.com/rss/articles/CBMiVkFVX3lxTE5f_Zt-yf?oc=5') === 'CBMiVkFVX3lxTE5f_Zt-yf' && G.googleId('https://sportal.bg/news-1') === null, 'the id of a Google News link');
const old = 'CBMi' + btoa('\x08\x13\x22\x2bhttps://www.sportal.bg/news-2026110817414276606\xd2\x01\x00').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
ok(G.oldIdUrl(old) === 'https://www.sportal.bg/news-2026110817414276606', 'an old id carries the address');
ok(G.oldIdUrl('CBMi' + btoa('\x08AU_yqLxyz').replace(/=+$/, '')) === null, 'a new id needs the decoder');
// the article by its headline in the outlet's own feed
ok(G.outletSite('Blitz.bg') === 'blitz.bg' && G.outletSite('https://novini247.com/') === 'novini247.com' && G.outletSite('www.24chasa.bg') === '24chasa.bg'
  && G.outletSite('ФОКУС') === 'focus-news.net' && G.outletSite('Някой блог') === null, 'the outlet\'s site');
ok(JSON.stringify(G.feedLinks('<head><link rel="alternate" type="application/rss+xml" title="Спорт" href="/rss/sport"><link rel="alternate" type="application/rss+xml" href="/comments/feed"><link rel="stylesheet" href="/a.css"></head>', 'https://sport.blitz.bg/'))
  === '["https://sport.blitz.bg/rss/sport"]', 'the feeds a home page announces (not the comments)');
const rss = `<rss><channel><item><title><![CDATA[Срам! Съдията спести червен картон на Сангаре!]]></title><link>https://sport.blitz.bg/efbet-liga/sram-sadiyata_600585.html</link></item>
  <item><title>Левски загуби</title><link>https://sport.blitz.bg/a_1.html</link></item></channel></rss>`;
const atom = `<feed><entry><title type="html">Валентин Илиев атакува съдиите &amp; БФС</title><link rel="alternate" href="https://sportal.bg/news-2026110817414276606"/></entry></feed>`;
const sitemap = `<urlset><url><loc>https://topsport.bg/cska/andrey-jordanov.html</loc><news:news><news:title>Андрей Йорданов: Кристиан Димитров направи дузпа срещу Годой</news:title></news:news></url></urlset>`;
const items = [...G.feedItems(rss), ...G.feedItems(atom), ...G.feedItems(sitemap)];
ok(items.length === 4 && items[2].title === 'Валентин Илиев атакува съдиите & БФС', 'RSS, Atom and news sitemap items');
ok(G.matchTitle(items, 'Срам! Съдията спести червен картон на Сангаре!') === 'https://sport.blitz.bg/efbet-liga/sram-sadiyata_600585.html'
  && G.matchTitle(items, 'Андрей Йорданов: Кристиан Димитров направи дузпа срещу Годой (ВИДЕО)') === 'https://topsport.bg/cska/andrey-jordanov.html'
  && G.matchTitle(items, 'Левски загуби от ЦСКА с 0:3 във вечното дерби') === null, 'the same headline (a word added is fine), not a different one');
ok(G.feedGuesses('blitz.bg').includes('https://sport.blitz.bg/rss') && G.feedGuesses('sport.bg').includes('https://www.sport.bg/feed'), 'where to look for a feed');
ok(JSON.stringify(G.robotsSitemaps('User-agent: *\nDisallow: /x\nSitemap: https://gong.bg/sitemap.xml\nsitemap: https://gong.bg/sitemap-news.xml\n'))
  === '["https://gong.bg/sitemap-news.xml","https://gong.bg/sitemap.xml"]', 'robots.txt sitemaps, news first');
ok(G.FEEDS['bbc.co.uk'][0].startsWith('https://feeds.bbci.co.uk/sport/football'), 'known football feeds');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
