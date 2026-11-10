// Tests for the worker's article video finder (public/_worker.js, extractFromHtml). Run: node tests/extract.test.mjs
// The pages are cut-down copies of real ones (November 2026), kept to the parts that matter.
import { extractFromHtml } from '../public/_worker.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const urls = r => r.videos.map(v => v.url);
const page = (title, head, body, rest = '') => `<html><head><meta property="og:title" content="${title}"><title>${title}</title>${head}</head><body>
  <header><nav><a href="/">Начало</a></nav></header>${rest}<article><h1>${title}</h1>${body}</article><aside><div class="sidebar"></div></aside></body></html>`;
const text = 'Треньорът коментира съдийството след мача и каза, че отборът му е ощетен. '.repeat(8);

// actualno.com: no video in the article; the cards of other articles carry preview clips (a theatre interview)
{
  const r = extractFromHtml(page('Съдиите грешат, БФС признава: Кой обаче носи отговорност?', '', `<p>${text}</p>`,
    `<div class="a__item"><div class="a__item-card-block a__solo" data-video-preview="https://cdn.actualno.eu/actualno_2013/upload//videos/b37444d42fc7fa6961e8237b9a57cd9d.mp4"><a href="/interview/teatyr">Театър с чувство за хумор</a></div></div>
     <script>var promo = {"file":"https://cdn.actualno.eu/actualno_2013/upload//videos/436d8c3e9ffa39887c1e74ce94bef75d.mp4"};</script>`), 'https://www.actualno.com/bgfootball/a-news_2660922.html');
  ok(!r.videos.length, 'the preview clips of other articles and the page script\'s files are not the article\'s: ' + urls(r).join(' '));
}

// 24chasa.bg: the site's own YouTube video next to every article
{
  const r = extractFromHtml(page('Никола Попов свири вечното дерби', '', `<p>${text}</p>`,
    `<div class="tv-box"><iframe src="https://www.youtube.com/embed/87hNYt6nMas" width="560"></iframe></div>`), 'https://www.24chasa.bg/sport/article/23867186');
  ok(!r.videos.length, 'a player outside the article with no title of its own is left out');
}

// dsport.bg: the article's video sits above the text, titled with the headline
{
  const title = 'Вальо Илиев по традиция захапа съдиите: Футболистите се бориха не само срещу Левски (ВИДЕО)';
  const r = extractFromHtml(page(title, '', `<p>${text}</p>`,
    `<div class="video-holder"><iframe id="video.frame" src="//www.youtube.com/embed/R6g1LPScoGA?enablejsapi=1&autoplay=1&mute=1" allow="autoplay; fullscreen" title="${title}" frameborder="0"></iframe></div>
     <iframe src="https://www.facebook.com/plugins/video.php?height=476&amp;href=https%3A%2F%2Fwww.facebook.com%2Fdsport%2Fvideos%2F1234567890" height="476"></iframe>`),
    'https://dsport.bg/valo-iliev-video~244292.html');
  ok(urls(r).length >= 1 && urls(r).every(u => /R6g1LPScoGA/.test(u)) && r.videos[0].how === 'page', 'the player titled with the headline is kept, an untitled one next to it is not: ' + urls(r).join(' '));
}

// gong.bg / sportal.bg: players inside the article body are the article's
{
  const r = extractFromHtml(page('Илиев отново недоволен от съдиите', '',
    `<p>${text}</p><iframe src="https://www.vbox7.com/emb/external.php?vid=e2ceb0abb9&start=1&autoplay=1"></iframe>
     <iframe src="https://sportal.bg/video_embed/aWQ9MjAyNjExMDgxNTE5MTg2OTMzNw=="></iframe><p>${text}</p>`), 'https://gong.bg/bg-football/a-912706');
  ok(urls(r).some(u => /vbox7\.com\/emb\/external\.php\?vid=e2ceb0abb9/.test(u)) && r.videos.some(v => v.kind === 'player' && /video_embed/.test(v.url)), 'players in the body are kept');
}

// the "related news" part at the end of the article is not the article
{
  const r = extractFromHtml(page('Черноморец и Янтра не се победиха', '',
    `<p>${text}</p><iframe src="https://www.youtube.com/embed/AAAAAAAAAAA"></iframe><p>${text}</p>
     <div class="related-news"><h3>Още по темата</h3><a href="/x"><iframe src="https://www.youtube.com/embed/BBBBBBBBBBB"></iframe></a></div>`), 'https://example.bg/a');
  ok(urls(r).length === 1 && /AAAAAAAAAAA/.test(urls(r)[0]), 'a video in the related news is left out: ' + urls(r).join(' '));
  const r2 = extractFromHtml(page('Мач', '', `<p>${text}</p><h3>Свързани новини</h3><ul><li><a href="https://www.youtube.com/watch?v=CCCCCCCCCCC">клип</a></li></ul>`), 'https://example.bg/b');
  ok(!r2.videos.length, '…also when the part starts with a heading');
}

// the page's declared video (JSON-LD) counts, wherever it is
{
  const ld = `<script type="application/ld+json">{"@type":"NewsArticle","video":{"@type":"VideoObject","name":"Засадата","embedUrl":"https://www.youtube.com/embed/DDDDDDDDDDD"}}</script>`;
  const r = extractFromHtml(page('Засадата спря Кристъл Палас', ld, `<p>${text}</p>`), 'https://example.bg/c');
  ok(urls(r).length === 1 && /DDDDDDDDDDD/.test(urls(r)[0]) && r.videos[0].how === 'ld', 'the JSON-LD video is the article\'s');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
