// ЦСКА and ЦСКА 1948 are two clubs, and a club's youth and reserve teams are not its first team: in the search box, in a
// story's tags and in the story → match links. Runs the page's own code, taken from public/index.html.
// node tests/teams.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('not found: ' + a); return html.slice(i, j); };
let mn = cut('function matchNewsIndex(){', '  const byMatch = new Map(), byStory = new Map();')
  .replace('function matchNewsIndex(){', 'function makeIndex(MATCHES){')
  .replace(/const ckey = [^\n]*\n\s*if \(MN_CACHE\.key === ckey\) return MN_CACHE;\n/, '')
  .replace(/const vis = new Set\(\[[^\n]*\n/, "const vis = new Set(Object.keys(LEAGUES));\n").replace('MIDX.matches', 'MATCHES');
const src = [
  cut('const CS = list =>', '// which tab an article belongs to'),
  "const teamName = n => String(n || '').replace(/^(?:ПФК|ФК)\\s+/, '').replace(/\\s+\\([^)]*\\)$/, '');",
  "const LEAGUES = { efbet: 'efbet Лига', mrbit: 'Mr Bit Втора лига', sw3: 'Трета лига Югозапад' }; const EURO_LG = []; const norm = s => (s || '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();",
  cut('// a youth headline is about the clubs', '// the international media are shown in English only'),
  cut('const CLUB_RX_I =', 'function filteredStories(){'),
  cut('const TEAM_KEY = {', 'let MN_CACHE').replace(/\nconst EURO_LG = [^\n]*/, ''),
  mn + '  return { hitsOf };\n}',
  'export { makeIndex, parseQuery, clubsOfText, youthArt, clubLabel };',
].join('\n');
const dir = mkdtempSync(join(tmpdir(), 'teams-'));
writeFileSync(join(dir, 'page.mjs'), src);
const P = await import(join(dir, 'page.mjs'));

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const keys = q => P.parseQuery(q).keys.join(',');

// the search box
ok(keys('ЦСКА') === 'cska' && keys('цска') === 'cska', 'search "ЦСКА" / "цска" → ЦСКА София');
ok(keys('цска 1948') === 'cska48' && keys('ЦСКА-1948') === 'cska48', 'search "цска 1948" → ЦСКА 1948 only');
ok(keys('цска ii') === 'cska2' && keys('Лудогорец 2') === 'ludo2', 'search "цска ii" → ЦСКА II');
ok(keys('цска u17') === 'cska~y' && keys('юношите на левски') === 'levski~y', 'search "цска u17" → ЦСКА\'s youth team');
ok(keys('левски ii') === 'levski~r', 'search "левски ii" → Левски II');
ok(keys('ЦСКА дузпа') === 'cska' && P.parseQuery('ЦСКА дузпа').text === 'дузпа', 'a club and a word: the word is looked for as text');
ok(keys('Гидженов') === '' && P.parseQuery('Гидженов').text === 'гидженов', 'no club: plain text');

// what a story is about
const art = (title, clubs) => P.youthArt({ title, clubs, scope: 'bg', divs: ['d1'] });
const y = art('Червен картон и скандал в мача ЦСКА U17 - Левски U17', ['cska', 'levski']);
ok(y.youth && y.clubs.join() === 'cska~y,levski~y' && y.divs.join() === 'youth', 'a U17 headline: the youth teams, division Юноши');
ok(art('Ужасяващ инцидент в Елитната група до 18 години: вратар удари съдия', ['lokgo']).clubs.join() === 'lokgo~y', '"до 18 години" is youth');
ok(art('Скандал при юношите на Левски', ['levski']).clubs.join() === 'levski~y', '"юношите на Левски" is youth');
ok(art('Червен картон за Левски II срещу Беласица', ['levski', 'belasitsa']).clubs.join() === 'levski~r,belasitsa', '"Левски II" is the reserve team');
ok(art('Левски 2:1 Славия след спорна дузпа', ['levski', 'slavia']).clubs.join() === 'levski,slavia', 'a score is not a reserve team');
ok(art('Левски II и Левски с наказания', ['levski']).clubs.join() === 'levski', 'both named: the first team stays');
ok(art('Червен картон обърна дербито при дублиращите отбори: Ботев Пловдив изпусна Локомотив Пловдив', ['botpd', 'lokpd']).clubs.join() === 'botpd~r,lokpd~r', '"при дублиращите отбори": the reserve teams');
ok(P.clubLabel('cska~y') === 'ЦСКА София (юноши)' && P.clubLabel('levski~r') === 'Левски II' && P.clubLabel('cska48') === 'ЦСКА 1948', 'labels');
ok([...P.clubsOfText('ЦСКА 1948 – ЦСКА 2:3')].sort().join() === 'cska,cska48', 'a video of the derby names both clubs');

// story → match links (real fixtures and headlines of October–November 2026)
const M = [['efbet:534524', 1791738000, 'ЦСКА 1948', 'ЦСКА София'], ['efbet:534553', 1792771200, 'ЦСКА 1948', 'Ботев Пловдив'],
  ['efbet:534530', 1793035800, 'ЦСКА София', 'Лудогорец'], ['efbet:534542', 1794069000, 'Лудогорец', 'ЦСКА 1948'],
  ['efbet:534543', 1794150000, 'Левски София', 'ЦСКА София'], ['efbet:534532', 1794139200, 'Спартак Варна', 'Арда Кърджали'],
  ['efbet:534507', 1789906500, 'Спартак Варна', 'ПФК Локомотив София 1929'], ['efbet:534559', 1793977200, 'Септември София', 'ПФК Локомотив София 1929']]
  .map(([id, t, home_name, away_name]) => ({ id, league: 'efbet', kickoff: new Date(t * 1000).toISOString(), home_name, away_name, status: 'finished' }));
const { hitsOf } = P.makeIndex(M);
const link = (t, title, cats) => { const h = hitsOf(title, { bg: true, world: false, eur: false, comps: [], cats, t0: t * 1000 }); return h ? [...h.keys()].join(',') : ''; };
ok(link(1794076140, 'С човек по-малко ЦСКА 1948 направи светкавичен обрат, но Лудогорец се спаси в последната минута', ['red']) === 'efbet:534542', 'ЦСКА 1948 → Лудогорец – ЦСКА 1948');
ok(link(1792566000, 'Венцислав Митрев ще ръководи ЦСКА 1948 – Ботев (Пловдив)', ['committee']) === 'efbet:534553', 'ЦСКА 1948 – Ботев → its own match');
{ const g = link(1794170000, 'Шеф на ЦСКА изригна срещу съдийството след 3:0 над Левски', ['dispute']); ok(g === 'efbet:534543', 'ЦСКА → Левски – ЦСКА → ' + g); }
ok(link(1791442800, 'Гидженов ще свири Черно море - "Левски", Любомиров получи ЦСКА 1948 - ЦСКА', ['committee']) === 'efbet:534524', 'ЦСКА 1948 – ЦСКА → the derby');
ok(link(1794160000, 'Червен картон и скандал в мача ЦСКА U17 - Левски U17', ['red']) === '', 'ЦСКА U17 – Левски U17 → not the first teams\' derby');
ok(link(1794100000, 'Юношите на ЦСКА 1948 до 17 години с обрат срещу Лудогорец, съдията изгони двама', ['red']) === '', 'ЦСКА 1948\'s youth team → not Лудогорец – ЦСКА 1948');
ok(link(1794200000, 'Спартак (Варна) победи Локомотив (София) с човек по-малко при U15', ['red']) === '', 'U15 → no first-team match');
ok(link(1794160000, 'Червен картон за Левски II срещу Беласица', ['red']) === '', 'Левски II → not Левски\'s match');

ok(link(1794160000, 'Червен картон обърна дербито при дублиращите отбори: Левски изпусна ЦСКА', ['red']) === '', 'the reserves\' derby → not the first teams\' derby');
// the committee rules on a match a week or two later: a headline naming both teams still goes to their match
ok(link(1794150000 + 12 * 86400, 'Съдийската комисия: ЦСКА трябваше да получи дузпа срещу Левски', ['penalty', 'committee']) === 'efbet:534543', 'a ruling 12 days later on Левски – ЦСКА → that match');
ok(link(1794150000 + 20 * 86400, 'Съдийската комисия: ЦСКА трябваше да получи дузпа срещу Левски', ['penalty', 'committee']) === '', '…but not three weeks later');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
