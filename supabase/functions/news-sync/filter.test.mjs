import * as N from './news.js';
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const bgQ = { ctx: 'bg', div: 'd1' }, loose = { ctx: 'loose' };
const keep = [
  'Скандал в мача Левски – Дунав след червения картон', 'ВАР отмени гол на ЦСКА срещу Славия заради засада',
  'Кабаков ще свири дербито Лудогорец - ЦСКА 1948', 'Нападнаха съдия в мач от Трета лига Югозапад',
  'Треньорът на Ботев: Съдията ни ограби', 'БФС глоби Левски с 5000 лв. заради пиротехника',
  'Дисциплинарната комисия наказа футболист на ЦСКА за 3 мача', 'Жълт картон вади капитана на Левски от дербито',
  'Спорна дузпа реши мача в Пловдив', 'Съдийската комисия обяви наряда за 15-ия кръг на efbet Лига',
  'Прекратиха мача Монтана - Етър след инциденти', 'Груб фал на Х остана ненаказан в мача в Разград',
  'Арбитър от Втора лига спрян от наряд след грешки', 'Ла Лига: ВАР скандал в Реал Мадрид - Барселона',
  'Лудогорец остана с десет и загуби от Арда',
];
const drop = [
  'Левски привлече бразилски нападател', 'ЦСКА уволни треньора си след загубата', 'Защитник на Лудогорец с контузия, пропуска мача с ЦСКА',
  'Лудогорец наказа Славия с три гола', 'Интервю с капитана на ЦСКА: Целим титлата', 'Съдът остави в ареста бивш президент на Литекс',
  'Ботев Пловдив е в бой за оцеляване', 'Нов треньор поема Арда', 'Левски победи ЦСКА с 2:1 в дербито',
  'Собственикът на Ботев Враца обяви нов бюджет', 'Х подписа договор с Черно море до 2028 г.', 'Треньорът на Дунав: Играхме добре',
  'Баскетбол: Левски победи Балкан', 'Борис Борисов: Ще разследваме уредени търгове', 'Националният отбор на България загуби от Испания',
];
for (const t of keep) ok(!!N.analyze(t, '', bgQ), 'keep: ' + t + ' → ' + JSON.stringify((N.analyze(t, '', bgQ) || {}).cats));
for (const t of drop) ok(!N.analyze(t, '', bgQ) && !N.analyze(t, '', loose), 'drop: ' + t + (N.analyze(t, '', bgQ) ? ' → ' + JSON.stringify(N.analyze(t, '', bgQ).cats) : ''));
// player story with a refereeing headline stays
ok(!!N.analyze('Трансферът на Х пропадна, а той получи червен картон в последния мач', '', bgQ), 'player story with a red card in the headline stays');
// feed parsing
const google = `<?xml version="1.0"?><rss><channel><item><title>Кабаков ще свири дербито Лудогорец - ЦСКА 1948 - Sportal.bg</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Tue, 03 Nov 2026 08:00:00 GMT</pubDate><description>&lt;a href="x"&gt;Кабаков ще свири дербито&lt;/a&gt;&amp;nbsp;&lt;font&gt;Sportal.bg&lt;/font&gt;</description><source url="https://www.sportal.bg">Sportal.bg</source></item>
<item><title><![CDATA[Левски привлече нападател &amp; защитник - Gong.bg]]></title><link>https://news.google.com/rss/articles/def</link><pubDate>Tue, 03 Nov 2026 09:00:00 GMT</pubDate><description></description><source url="https://gong.bg">Gong.bg</source></item></channel></rss>`;
const items = N.parseRss(google);
ok(items.length === 2 && items[0].source === 'Sportal.bg' && items[1].title === 'Левски привлече нападател & защитник - Gong.bg', 'Google feed parsed');
const a0 = N.toArticle(items[0], 'google', bgQ, Date.parse('2026-11-04T12:00:00Z'));
ok(a0 && a0.title === 'Кабаков ще свири дербито Лудогорец - ЦСКА 1948' && a0.src === 'Sportal.bg' && a0.descr === '' && a0.aid === 'кабаков ще свири дербито лудогорец цска 1948|sportal bg' && a0.cats.includes('committee'), 'article row: ' + JSON.stringify(a0));
ok(N.toArticle(items[1], 'google', bgQ) === null, 'transfer story dropped');
const bing = `<rss><channel><item><title>ВАР отмени гол на ЦСКА срещу Славия</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2fblitz.bg%2fx&amp;c=1</link><description>Съдията Кабаков отмени гола след преглед</description><pubDate>Mon, 02 Nov 2026 18:00:00 GMT</pubDate><News:Source>Blitz.bg</News:Source></item></channel></rss>`;
const b0 = N.toArticle(N.parseRss(bing)[0], 'bing', loose, Date.parse('2026-11-04T12:00:00Z'));
ok(b0 && b0.link === 'https://blitz.bg/x' && b0.src === 'Blitz.bg' && b0.descr.startsWith('Съдията'), 'Bing item: real link, source, description');
const w = N.windows(Date.parse('2026-11-04T12:00:00Z'));
ok(w.length === 10 && new Date(w[w.length - 1][0]).toISOString().startsWith('2026-06-30') && w[0][1] > Date.parse('2026-11-05'), 'season windows: ' + w.length);
console.log(fails ? fails + ' FAILED' : 'all passed');
const more = [
  ['drop', 'Лапоухов за спасената дузпа: Най-хубавото чувство'], ['drop', 'Автогол и изпусната дузпа провалиха Астън Вила срещу Фулъм'],
  ['drop', 'НА ЖИВО: Манчестър Юнайтед 0:2 Рома, Мален удови от дузпа'], ['drop', 'Спартак Варна сменя треньора, отстранява двама футболисти и налага глоби'],
  ['drop', 'Черно море пречупи Ботев Враца с дузпа след забавения старт на „Тича“'], ['drop', 'Голям скандал разтърсил Ягелония: Ето защо съперникът на Левски бил в криза'],
  ['keep', 'Ботев (Враца) изригна срещу съдийството след спорна дузпа във Варна'], ['keep', 'Тебас: Дузпа за Реал Мадрид нямаше, ВАР трябваше да се намеси'],
  ['keep', 'Три гола, спасена дузпа и червен картон! Арда измъкна трудна победа в напрегнат сблъсък'], ['keep', 'Имаше ли дузпа за Ливърпул?'],
  ['keep', 'Счупиха носа на български национал в Първа лига, съдията не отсъди дори нарушение'], ['keep', 'Марек с над 500 евро глоби след кръга във Втора лига'],
  ['keep', 'Доказано: БФС призна, че съдиите са ощетили Локо срещу Лудогорец, но какво от това? - видео'],
];
for (const [want, t] of more) { const r = N.analyze(t, 'съдията беше в центъра на вниманието', { ctx: 'bg' }); ok(want === 'keep' ? !!r : !r, want + ': ' + t + (r ? ' → ' + r.cats : '')); }
console.log(fails ? fails + ' FAILED' : 'all passed');
for (const [want, t, cat] of [['keep', 'БФС призна ощетяване на Локо срещу Лудогорец и слугинаж към Левски в Русе (ВИДЕО)', 'dispute'],
  ['keep', 'Напрежение в българския футбол: БФС призна две грешки, Лудогорец обяви война', 'dispute'],
  ['keep', 'Никола Попов свири на Левски, Великов на ЦСКА - Ботев Пловдив', 'committee'], ['keep', 'Избраха рефера на Левски - ЦСКА', 'committee'],
  ['keep', 'Ботев Вр се оплака от съдийството на мача с Черно море във Варна', 'dispute']]) {
  const r = N.analyze(t, '', { ctx: 'bg' }); ok(r && r.cats.includes(cat), want + ' as ' + cat + ': ' + t + ' → ' + (r && r.cats)); }
console.log(fails ? fails + ' FAILED' : 'all passed');
