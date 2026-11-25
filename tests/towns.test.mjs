// A club's name that is something else: another town's club of the same name ("„Пирин“ (Рз)" is Пирин Разлог, not
// Пирин Благоевград), a referee's town ("Съдии от Монтана… за мача на „Бдин“ с „Етър II“"), a former club ("бивш нападател
// на ЦСКА"), a reserve team ("дубъла на Левски"); fixtures named in words ("между Кайрат и Левски", "мача на ЦСКА с ОФИ");
// appointments that also complain; Europe and the Super Cup. Real headlines and fixtures of the 2026/27 season.
// Runs the page's own code, taken from public/index.html. node tests/towns.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('not found: ' + a); return html.slice(i, j); };
// (the links' context: mnContext, made from a given match list)
const mn = cut('function mnContext(){', "// one headline's matches, worked out once per match list")
  .replace('function mnContext(){', 'function makeIndex(MATCHES){')
  .replace(/const key = [^\n]*\n\s*if \(MN_CTX\.key === key\) return MN_CTX;\n/, '')
  .replace(/const vis = new Set\(\[[^\n]*\n/, "const vis = new Set(Object.keys(LEAGUES));\n").replace(/MIDX\.matches/g, 'MATCHES')
  .replace('return (MN_CTX = { key, ', 'return ({ ');
const src = [
  cut('const REFEREES =', 'const SITES ='),
  cut('const CS = list =>', '// which tab an article belongs to'),
  "const teamName = n => String(n || '').replace(/^(?:ПФК|ФК)\\s+/, '').replace(/\\s+\\([^)]*\\)$/, '');",
  "const LEAGUES = { efbet: 'efbet Лига', mrbit: 'Mr Bit Втора лига', sw3: 'Трета лига Югозапад' }; const EURO_LG = []; const norm = s => (s || '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();",
  cut('// a youth headline is about the clubs', '// the international media are shown in English only'),
  cut('const CLUB_RX_I =', 'function filteredStories(){'),
  cut('const TEAM_KEY = {', 'let MN_CACHE').replace(/\nconst EURO_LG = [^\n]*/, ''),
  mn,
  'export { makeIndex, clubsOfText, youthArt, teamText };',
].join('\n');
const dir = mkdtempSync(join(tmpdir(), 'towns-'));
writeFileSync(join(dir, 'page.mjs'), src);
const P = await import(join(dir, 'page.mjs'));

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const clubs = t => [...P.clubsOfText(t)].sort().join(',');

// what a headline names
ok(clubs('„Пирин“ (Рз) загуби дънното дерби в мач с двама изгонени') === 'pirinrz', '„Пирин“ (Рз) → Пирин Разлог, not Пирин Благоевград');
ok(clubs('Пирин Бл скочи на съдията') === 'pirin' && clubs('Пирин (Благоевград) с жалба') === 'pirin', 'Пирин Бл, Пирин (Благоевград) → Пирин Благоевград');
ok(clubs('Пирин Гоце Делчев с дузпа в края') === 'piringd' && clubs('Скандал в Пирин 1941') === 'pirinrz', 'Пирин Гоце Делчев, Пирин 1941');
ok(clubs('Септември (Симитли) скочи на рефера') === 'septsim' && clubs('Септември (Сф) с жалба') === 'septemvri', 'Септември (Симитли) is not Септември София');
ok(clubs('Левски (Лом) с червен картон') === '' && clubs('Левски Карлово загуби') === '', 'Левски (Лом), Левски Карлово are not Левски');
ok(clubs('Черноморец (Балчик) поиска дузпа') === '' && clubs('Спортист (Генерал Тошево) недоволен') === '', 'Черноморец (Балчик), Спортист (Генерал Тошево): other clubs');
ok(clubs('„Янтра“ (Полски Тръмбеш): Загубихме след ужасяващо съдийство') === '', '„Янтра“ (Полски Тръмбеш) is not Янтра Габрово');
ok(clubs('"Черно море" се оплака от съдийското срещу "Локо" (Пд)') === 'chm,lokpd' && clubs('„Локомотив“ (Пловдив) с жалба') === 'lokpd', '"Локо" (Пд) and „Локомотив“ (Пловдив): the quotes may stand between');
ok(clubs('Арда Туран за съдиите в Турция') === '' && clubs('Славия Прага с дузпа') === '', 'Арда Туран, Славия Прага are not Арда, Славия');
ok(clubs('Дунав (Русе) скочи на БФС (ВИДЕО)') === 'dunav' && clubs('Ботев (Враца) изригна') === 'botvr', 'a club with its own town, and "(ВИДЕО)", stay');
ok(clubs('Съдии от Монтана и Враца ще ръководят мача на "Бдин" с "Етър II"') === 'etar~r', '"Съдии от Монтана": a referee\'s town (and "Етър II" the reserves)');
ok(clubs('Съдийска бригада от Севлиево за мача в Габрово') === '', '"бригада от Севлиево": a town');
ok(clubs('Ботев Враца скочи на съдийството след загубата от Арда') === 'arda,botvr', '"съдийството след загубата от Арда" is Арда (a lost match, not a referee from Арда)');
ok(clubs('Ботев Враца скочи на ВАР рефера от Лудогорец – ЦСКА') === 'botvr,cska,ludo', '"рефера от Лудогорец – ЦСКА": a match, not a town');
ok(clubs('Главен съдия: Иван Иванов (Монтана), асистенти от Враца') === '' && clubs('Наказаха Мартин Петков (Левски) за два мача') === 'levski', '"Иван Иванов (Монтана)" in an appointment is a town; "Мартин Петков (Левски)" a player\'s club');
ok(clubs('Бивш нападател на ЦСКА вече е съдия') === '' && clubs('Кадър на Лудогорец и Пирин е главен арбитър на Левски – ЦСКА') === 'cska,levski', '"бивш нападател на ЦСКА", "Кадър на Лудогорец и Пирин": not those clubs\' stories');
ok(clubs('Дузпа в добавеното време спря дубъла на Левски') === 'levski~r' && clubs('Кристина Георгиева ще ръководи мач на дубъла на ЦСКА') === 'cska2', '"дубъла на Левски" is Левски II, "дубъла на ЦСКА" ЦСКА II');
ok(clubs('Илиан Илиев изригна: Чист червен картон срещу Сидни - TribunaPlovdiv.bg: Спортни новини, Локомотив Пловдив, Ботев Пловдив') === '', 'the site\'s name after the headline is not part of it');
ok(clubs('БФС наложи глоби след кръга на Купата: Берое 2 132,50€, Миньор 1 583,75€') === 'beroe,minyor' && clubs('ЦСКА 2 загуби с дузпа') === 'cska2',
  '"Берое 2 132,50€" is a fine, not Берое II; "ЦСКА 2" is ЦСКА II');
ok(clubs('Главен съдия на двубоя между „Родопа“ (Смолян) и втория отбор на „Ботев“ (Пловдив)') === 'botev2', '"втория отбор на „Ботев“ (Пловдив)" is Ботев II');
ok(P.youthArt({ title: 'Съдии от Монтана и Враца за мача на "Бдин" с "Павликени"', desc: '', clubs: ['montana'], scope: 'bg', divs: ['d2'] }).clubs.join() === '', 'a saved article\'s clubs are read again: no Монтана');

// story → match links
const M = [
  ['sw3:2026-27:natsional:pirin-1941', 1794657600, 'Национал (София)', 'Пирин 1941 (Разлог)'], ['sw3:2026-27:pirin-1941:etropole', 1794052800, 'Пирин 1941 (Разлог)', 'Етрополе (Етрополе)'],
  ['mrbit:2026-27:16:pirin-blagoevgrad-1428:montana-1424', 1794745800, 'Пирин Благоевград', 'Монтана'],
  ['mrbit:2026-27:9:cska-sofia-ii-1415:montana-1424', 1789308000, 'ЦСКА София II', 'Монтана'],
  ['efbet:fb-m-534512', 1788200100, 'Арда Кърджали', 'Ботев Враца'], ['efbet:fb-m-534510', 1788624000, 'Спартак Варна', 'ЦСКА София'],
  ['efbet:fb-m-534496', 1788113700, 'ЦСКА София', 'Черно море Варна'], ['efbet:fb-m-534491', 1788105600, 'Спартак Варна', 'Лудогорец'],
  ['efbet:fb-m-534543', 1794150000, 'Левски София', 'ЦСКА София'], ['efbet:fb-m-534545', 1793467800, 'ЦСКА София', 'Славия София'],
  ['efbet:fb-m-534534', 1793457000, 'Дунав Русе', 'Левски София'], ['efbet:fb-m-534490', 1787422500, 'Левски София', 'Спартак Варна'],
  ['efbet:fb-m-534483', 1786126500, 'Левски София', 'Локомотив Пловдив'], ['efbet:fb-m-534488', 1785600000, 'Левски София', 'Септември София'],
  ['efbet:fb-m-534531', 1793448000, 'Локомотив Пловдив', 'Лудогорец'], ['efbet:fb-m-534503', 1791642600, 'ПФК Локомотив София 1929', 'Локомотив Пловдив'],
  ['efbet:fb-m-534540', 1793122200, 'Арда Кърджали', 'Левски София'], ['efbet:fb-m-534461', 1786896000, 'ЦСКА София', 'Ботев Враца'],
  ['efbet:fb-m-534495', 1788105600, 'Ботев Пловдив', 'Левски София'], ['efbet:fb-m-534484', 1787587200, 'Ботев Враца', 'Ботев Пловдив'],
  ['efbet:fb-m-534460', 1786904100, 'Локомотив Пловдив', 'Дунав Русе'],
].map(([id, t, home_name, away_name]) => ({ id, league: id.split(':')[0], kickoff: new Date(t * 1000).toISOString(), home_name, away_name }));
const { hitsOf } = P.makeIndex(M);
const D = s => Date.parse(s.includes('T') ? s + ':00Z' : s + 'T07:00:00Z');
const link = (day, title, cats) => { const h = hitsOf(title, { bg: true, world: false, eur: false, comps: [], cats, t0: D(day) }); return h ? [...h.keys()].sort().join(',') : ''; };
ok(link('2026-11-15', '„Пирин“ (Рз) загуби дънното дерби в мач с двама изгонени', ['red']) === 'sw3:2026-27:natsional:pirin-1941', '„Пирин“ (Рз) → Национал – Пирин 1941 (Разлог), not Пирин Благоевград – Монтана');
ok(link('2026-11-12', 'Съдии от Монтана и Враца ще ръководят мача на "Бдин" с "Етър II"', ['committee']) === '', '"Съдии от Монтана… мача на „Бдин“ с „Етър II“" → no match (not Пирин – Монтана)');
ok(link('2026-09-10', 'Съдии от Монтана и Враца за мача на "Бдин" с "Павликени"', ['committee']) === '', '"…мача на „Бдин“ с „Павликени“" → no match (not ЦСКА II – Монтана)');
ok(link('2026-08-05', 'Даниел Зиберт ще ръководи реванша между Кайрат и Левски', ['committee']) === '', '"между Кайрат и Левски" (not on the list) → not Левски\'s league match');
ok(link('2026-08-05', 'Топ рефер свири реванша на Левски с Кайрат', ['committee']) === '', '"реванша на Левски с Кайрат" → not Левски\'s league match');
ok(link('2026-08-15', 'Сърбин свири първия мач на ЦСКА с ОФИ, словак - реванша', ['committee']) === '', '"мача на ЦСКА с ОФИ" → not ЦСКА – Ботев Враца');
ok(link('2026-08-22', 'Ето кой ще ръководи реванша между АЕК и Левски', ['committee']) === '', '"между АЕК и Левски" → not Левски – Спартак');
ok(link('2026-08-05', 'Бивш нападател на ЦСКА вече е съдия', ['other']) === '', '"Бивш нападател на ЦСКА" → no match');
ok(link('2026-10-29', 'Дузпа в добавеното време спря дубъла на Левски', ['penalty']) === '', '"дубъла на Левски" → not Арда – Левски');
ok(link('2026-11-02', '“Янтра” (Полски Тръмбеш): “Загубихме в Левски след ужасяващо съдийство”', ['dispute']) === '', 'a club of another town ("Янтра" (Полски Тръмбеш)): the headline is about a match not on the list');
ok(link('2026-09-02', 'Спартак (Вн) недоволства от назначаването на Гидженов за главен съдия на мача с ЦСКА', ['dispute', 'committee']) === 'efbet:fb-m-534510', 'a complaint about an appointment → the coming Спартак – ЦСКА, not both clubs\' last matches');
ok(link('2026-09-02', 'Във Варна се оплакаха от назначението на съдия за мача срещу ЦСКА', ['dispute']) === 'efbet:fb-m-534510', '"оплакаха от назначението" → the coming match');
ok(link('2026-08-26', 'Тодор Киров ще ръководи Ботев Пловдив - Левски, Драгомир Драганов ще отговаря за ВАР', ['committee', 'var']) === 'efbet:fb-m-534495', '"ще ръководи Ботев Пловдив – Левски, … ВАР" → that match (a VAR word doesn\'t make it a past one)');
ok(link('2026-11-03', 'БФС глоби Дунав с над 7000 евро, санкции и за Левски и ЦСКА', ['discipline']) === 'efbet:fb-m-534534,efbet:fb-m-534545', 'fines for Левски and ЦСКА → their last matches, not the derby still to come');
ok(link('2026-11-06', 'Жандармерията се включва в опазването на реда за Левски - ЦСКА', ['fights']) === 'efbet:fb-m-534543', '"…за Левски – ЦСКА" two days before → the derby');
ok(link('2026-09-01', 'Ботев Враца скочи на съдийството след загубата от Арда', ['dispute']) === 'efbet:fb-m-534512', '"след загубата от Арда" → Арда – Ботев Враца');
ok(link('2026-10-31T15:00', 'Локомотив Пловдив остана с човек по-малко', ['red']) === 'efbet:fb-m-534531', '"Локомотив Пловдив" is not also a loose "Локомотив" for Локомотив София');
ok(link('2026-09-02', 'БФС глоби Ботев Пловдив с почти 3000 евро', ['discipline']) === 'efbet:fb-m-534495', '"Ботев Пловдив" is not also a loose "Ботев" for Ботев Враца');
ok(link('2026-08-13', 'Димитър Димитров ще ръководи мача между „Локо“ и „Дунав“', ['committee']) === 'efbet:fb-m-534460', '"между „Локо“ и „Дунав“" → Локомотив Пловдив – Дунав');
ok(link('2026-09-10', 'БФС с тежко наказание за Левски след Суперкупата', ['discipline']) === '', 'the Super Cup is not a league match');
ok(link('2026-07-31', 'Литовски съдии ще ръководят първите европейски мачове на Левски и ЦСКА', ['committee']) === '', '"европейски мачове" → only European matches');
ok(link('2026-07-30', 'В СНИМКИ: ЦСКА е в третия кръг на ЛЕ след огромна битка и дузпи', ['penalty']) === '', '"ЛЕ" is the Europa League');
ok(link('2026-07-18', 'Швейцарец свири на Лудогорец в Унгария', ['committee']) === '', '"…на Лудогорец в Унгария": a European match');
ok(link('2026-09-04', 'Ботев Враца получи наказание от ФИФА', ['discipline']) === '', 'a FIFA sanction is about no match');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
