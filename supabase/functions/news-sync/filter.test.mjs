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
// World: the five leagues, the three European cups and national teams each go to their own competition
for (const [t, scope, comps] of [
  ['Скандално съдийство в Лига Европа: Лудогорец ощетен от рефера', 'world', ['uel']],
  ['ВАР отмени гол на Фиорентина в Лигата на конференциите', 'world', ['uecl']],
  ['Съдията от мача България – Исландия в Лигата на нациите е от Норвегия', 'world', ['nat']],
  ['Червен картон и скандал в мача на Англия в квалификациите за Мондиал 2030', 'world', ['nat']],
  ['Майкъл Оливър отново в центъра на скандал с ВАР', 'world', ['eng']],
  ['Червен картон за играч на Хофенхайм след намеса на ВАР', 'world', ['ger']],
  ['Славия Прага ощетена от рефера в Шампионска лига', 'world', ['ucl']],
  ['Левски с дузпа и червен картон, съдийството на световно ниво', 'bg', []],
]) { const r = N.analyze(t, '', loose); ok(r && r.scope === scope && comps.every(c => r.comps.includes(c)), `${scope} ${comps}: ${t} → ${r && r.scope + ':' + r.comps}`); }
// other languages written in Cyrillic, and sites from those countries
ok(N.notBulgarian('Сдержал ли Моуринью обещание разоблачить ошибочные решения арбитров', 'Tribuna.com', '') &&
  N.notBulgarian('ВАР, пречки, повреди и драма во 89-та! Баерн и Дортмунд го одиграа мечот', 'sportstation.mk', '') &&
  N.notBulgarian('Судија', 'x', 'https://www.sportklub.rs/a') && !N.notBulgarian('Кабаков ще свири дербито', 'Sportal.bg', 'https://www.sportal.bg/x'), 'Russian / Macedonian / Serbian articles are left out');
// Russian without the letters Bulgarian lacks, and Russian clubs written about in Bulgarian
ok(N.notBulgarian('Стала известна бригада арбитров, которая обслужит матч "Краснодар" - ЦСКА', 'x', '') &&
  N.notBulgarian('Судья матча Спартак - Зенит', 'x', '') && N.notBulgarian('Тренер ЦСКА недоволен судейством', 'x', ''), 'Russian headlines without ы/э/ё are left out');
const bgOk = ['Никола Попов ще ръководи дербито Левски – ЦСКА', 'Съдийската комисия: Трябваше да има червен картон за Левски', 'Ясно е кой ще свири гостуването на ЦСКА в Атина',
  'Арбитър от Втора лига спрян от наряд след грешки', 'Мохамед Ал Хаким ще ръководи срещата Панатинайкос – ЦСКА', 'Албанец и иракски швед свирят на Левски и ЦСКА в Европа',
  'Дисциплинарната комисия наказа футболист на ЦСКА за 3 мача', 'Чужд съдия за последно свири ЦСКА – Левски преди 19 години', 'Съдия от две загуби на Лудогорец свири на ЦСКА в Атина'];
ok(bgOk.every(t => !N.notBulgarian(t, 'Sportal.bg', 'https://www.sportal.bg/x')), 'Bulgarian headlines are not taken for Russian: ' + bgOk.filter(t => N.notBulgarian(t, 'Sportal.bg', '')).join(' | '));
ok(!N.analyze('Скандално съдийство в мача Краснодар - ЦСКА, червен картон за домакините', '', bgQ) && !N.analyze('Съдията на ЦСКА Москва - Зенит отмени гол след ВАР', '', bgQ) &&
  !N.analyze('Червен картон за ЦСКА (Москва) в дербито', '', bgQ), 'CSKA Moscow and other Russian clubs are left out, even in Bulgarian');
ok(!!N.analyze('Червен картон за ЦСКА в дербито с Левски', '', bgQ) && !!N.analyze('Кабаков ще свири Зенит - Краснодар в Русия', '', bgQ), 'the Bulgarian ЦСКА stays; a Bulgarian referee in Russia stays');
// World stories about Bulgarian clubs or referees are also shown in the Bulgaria tab (division "eur")
for (const [t, eur] of [
  ['Албански рефер ще ръководи мача на Левски с Ягелония в Лига Европа', true],
  ['Радослав Гидженов получи наряд за мач от Лига на нациите', true],
  ['Наш съдия ще свири на Будьо/Глимт и Лил в Шампионска лига', true],
  ['Съдия №1 у нас дебютира в Лига Европа', true],
  ['УЕФА даде 5-и мач в Лига Европа на български съдия тази есен', true],
  ['Скандал с ВАР в Ливърпул – Арсенал: Оливър отмени гола на Салах', false],
  ['Червен картон и скандал в мача на Англия в квалификациите за Мондиал 2030', false],
]) { const r = N.analyze(t, '', loose); ok(r && r.scope === 'world' && r.divs.includes('eur') === eur, `${eur ? 'also Bulgaria' : 'World only'}: ${t} → ${r && r.scope + ':' + r.divs}`); }
// ЦСКА (София) and ЦСКА 1948 are two clubs; ЦСКА II and III are reserve teams; "ЦСКА 2:1" is a score, not ЦСКА 2
const clubsOf = t => N.CLUBS.filter(c => c.re.test(t)).map(c => c.k).sort().join(',');
for (const [t, want] of [
  ['Любомиров получи сблъсъка между ЦСКА 1948 и ЦСКА', 'cska,cska48'],
  ['ЦСКА 1948 - ЦСКА 2:3, спорна дузпа в края', 'cska,cska48'],
  ['Лудогорец - ЦСКА 1948 1:2, "червените" обърнаха резултата', 'cska48,ludo'],
  ['Скандал в мача на ЦСКА-1948 с Ботев', 'cska48'],
  ['Левски - ЦСКА 0:3, съдията не даде дузпа', 'cska,levski'],
  ['ЦСКА 2:1 Левски след червен картон', 'cska,levski'],
  ['Червен картон за играч на ЦСКА 2 срещу Беласица', 'belasitsa,cska2'],
  ['ЦСКА II загуби от Беласица', 'belasitsa,cska2'],
  ['Спорен гол в мача ЦСКА III - Кюстендил', 'kyustendil'],   // ЦСКА III is not ЦСКА; Кюстендил is a Third League club
  ['Лудогорец 2:2 ЦСКА 1948, съдията отмени гол', 'cska48,ludo'],
]) ok(clubsOf(t) === want, `clubs of "${t}" → ${clubsOf(t)} (want ${want})`);
// "съдия" is also a judge (real headlines that were saved before this rule)
for (const [t, keep, d] of [
  ['При 69,44 процента активност приключи изборният ден за членове на Висшия съдебен съвет от квотата на съдиите в Монтана', false, 'the judiciary\'s election'],
  ['Разпитаха пред съдия част от екипажа на „Челси 3“, чакат експертизи', false, 'a ship\'s crew before a judge'],
  ['Спортният арбитраж решава съдбата на финала за Купата на африканските нации през ноември', false, 'the court of arbitration'],
  ['Съдията от Монтана получи наряд за Добруджа - Етър', true, 'a referee from Монтана'],
  ['Марица отстъпи пред адашите от Милево след много съдийски спорни отсъждания', true, 'a town club with refereeing words'],
  ['Вижте как футболист рита в главата съдия, Дани Петканов зове прокуратурата', true, 'a referee attacked, the prosecutor called'],
  ['Моуриньо се оправда със съдията за боя от Атлетико', true, 'a coach blames the referee'],
  ['Огромен скандал на Етър - Марек! Тръгнаха да бият съдията (видео)', true, 'two town clubs and a referee'],
  ['„Дунав“ ще обжалва рекордна глоба от 7090 евро', true, 'a river club fined'],
]) ok(!!N.analyze(t, '', { ctx: 'bg' }) === keep, `${keep ? 'kept' : 'left out'}: ${d}`);
ok(!N.CLUBS.find(c => c.k === 'levski').re.test('Бой между фенове на ЦСКА и Лудогорец на "Васил Левски"') && N.CLUBS.find(c => c.k === 'levski').re.test('Левски с жалба'),
  '"Васил Левски" (the stadium, the man) is not Левски');
// a club's name that is something else: another town's club, a referee's town, a former club, a reserve team
const an = t => N.analyze(t, '', { ctx: 'bg' }) || {};
ok(an('„Пирин“ (Рз) загуби дънното дерби в мач с двама изгонени').clubs?.join() === 'pirinrz' && an('„Пирин“ (Рз) загуби дънното дерби в мач с двама изгонени').divs?.join() === 'd3',
  '„Пирин“ (Рз) is Пирин Разлог, a Third League club');
ok(an('Съдии от Монтана и Враца ще ръководят мача на "Бдин" с "Етър II"').clubs?.join() === '', '"Съдии от Монтана": a referee\'s town; "Етър II" is not Етър');
ok(an('Марица отстъпи пред адашите от Милево след много съдийски спорни отсъждания').divs?.join() === 'd3', 'Марица plays in the Third League');
ok(!!N.analyze('Бивш нападател на ЦСКА вече е съдия', '', { ctx: 'bg' }) && an('Бивш нападател на ЦСКА вече е съдия').clubs?.join() === '', 'a former ЦСКА player who is a referee now: kept, but not ЦСКА\'s story');
ok(an('Струмска слава се добра до равенство срещу дубъла на Левски след дузпа в 93-ата минута').clubs?.join() === 'strumska', '"дубъла на Левски" is Левски II, not Левски');
ok(an('Скандал на "Бернабеу": как изчезна запис от фал на Арда Гюлер при 26 камери?').scope === 'world', 'Арда Гюлер at the Bernabéu: Real Madrid, not Арда');
ok(an('БФС наложи 5 307,50 евро глоби след II предварителен кръг на Купата: Берое 2 132,50€, Миньор 1 583,75€').clubs?.slice().sort().join() === 'beroe,minyor',
  '"Берое 2 132,50€" is a fine, not Берое II');
ok(N.clubsIn('Габриела Найденова ще бъде главен съдия на двубоя между „Родопа“ (Смолян) и втория отбор на „Ботев“ (Пловдив)').join() === 'botev2', '"втория отбор на „Ботев“ (Пловдив)" is Ботев II');
ok(!N.analyze('Най-бързият червен картон за дебютант закопа Славия Прага (ВИДЕО)', '', { ctx: 'bg' }) && !!N.analyze('Левски е на прага на титлата след спорна дузпа', '', { ctx: 'bg' }),
  'Славия Прага is Czech football (left out); "на прага на" is not Prague');
// international football in Bulgarian papers (the feed had these on 17 Nov 2026): not Bulgarian news, whatever site wrote it
for (const [t, d] of [
  ['Ямал към Андерсън при червения картон: Глупако, глупако...', ''],
  ['Гол на Дания бе отменен заради засада', ''],
  ['Рафиня за съдийството на мача с Япония: Това е недопустимо', ''],
  ['Анчелоти: Съдията нямаше нужния опит за мач от такова високо ниво', ''],
  ['Наказаха вратаря на Андора за фаталния сблъсък с футболист на Тенерифе', ''],
  ['Петко Ганчев от Уелс: Обявиха за мъртъв жив съдия!', 'Бившият съдия от Левски и Арда'],       // a Bulgarian club only in the description
  ['Галатасарай бесен на съдията след дербито с Фенербахче', ''],
  ['Червен картон за Холанд, Сити загуби', ''],
  ['Скандална дузпа в Португалската първа лига', ''],
  ['Пике скочи срещу наказанието от 12 мача за вратаря, причинил смъртта на Хесус де Мигел', ''],
  ['Рафиня за червения си картон: Трудно е да запазя самообладание след толкова много съдийски грешки', ''],
]) { const r = N.analyze(t, d, bgQ); ok(!r || r.scope === 'world', 'international, not Bulgarian: ' + t + (r ? ' → ' + r.scope : '')); }
// …but Bulgarian referees abroad, Bulgaria's national team and Bulgarian clubs against foreign ones stay Bulgarian
for (const t of [
  'Финландия вкара седем гола на Сан Марино в мач на Георги Кабаков',
  'Кабаков свири зрелище с девет гола',
  'Българинът Александър Ангелов ще ръководи мача в испанската трета дивизия между Реал Хаен и Реал Сарагоса',
  'Исландия унижи България пред празни трибуни на "Колежа"! Скандална дузпа и автогол предизвикаха разгром',
  'Левски отнесе тежко наказание от УЕФА за сблъсъците по трибуните срещу Ягелония',
  'Рилски спортист се пребори за точка срещу Хебър с късна дузпа на Божилов',
]) { const r = N.analyze(t, '', bgQ); ok(!!r && (r.scope === 'bg' || r.divs.includes('eur')), 'Bulgarian: ' + t + (r ? ' → ' + r.scope + ' ' + r.divs : ' → left out')); }
ok(!(N.analyze('Българинът Александър Ангелов ще ръководи мача в испанската трета дивизия', '', bgQ) || { divs: [] }).divs.includes('d3'),
  '"испанската трета дивизия" is not Трета лига');
ok(!(N.analyze('Сърбин ще ръководи последния мач на България в Лигата на нациите', '', bgQ) || { divs: [] }).divs.includes('eur'), "Bulgaria's national team stays in World only (as before)");
// "the match with <country>" in a Bulgarian paper is Bulgaria's own match: World, national teams
for (const t of ['Обявиха съдията за мача с Исландия', 'Съдията на мача срещу Испания е италианец']) {
  const r = N.analyze(t, '', bgQ); ok(!!r && r.scope === 'world' && r.comps.includes('nat'), "Bulgaria's match: " + t + (r ? ' → ' + r.scope + ' ' + r.comps : ' → left out'));
}
for (const t of ['Ирландия загуби срещу Исландия след грешка на съдията', 'Холанд с хеттрик в мача с Исландия, съдията отмени гол'])
  ok(!N.analyze(t, '', bgQ), 'two foreign sides, not Bulgaria: ' + t);
// a former Bulgarian club's player abroad is not Bulgarian football; a referee's surname after another first name is someone else
for (const t of ['Ексзвезда на Лудогорец остава наказан за Ман Юн и Арсенал', 'Сериозно наказание за бивш нападател на Лудогорец',
  'Десетки изпратиха Константин Тренчев в последния му път, малцина от ранните му съратници в СДС ...'])
  ok(!N.analyze(t, '', bgQ), 'not Bulgarian football: ' + t);
for (const t of ['Бивш нападател на ЦСКА вече е съдия', 'Съдията Тренчев отмени гол', 'Станимир Тренчев ще свири дербито', 'УЕФА засили Кабаков към Финландия'])
  ok((N.analyze(t, '', bgQ) || {}).scope === 'bg', 'Bulgarian: ' + t);
// not football
for (const t of ['Карате клуб „Добруджа“ вече има трима съдии', '23-годишен благоевградчанин остава в ареста за кражба на златни накити в Кюстендил'])
  ok(!N.analyze(t, '', bgQ), 'not football: ' + t);
console.log(fails ? fails + ' FAILED' : 'all passed');
