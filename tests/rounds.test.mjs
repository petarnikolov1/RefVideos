// The news a day at a time and a round at a time: the day headings of the feed, the rounds of the competitions
// ("efbet Лига · Кръг 14") and which round a story is about. Runs the page's own code, taken from public/index.html.
// node tests/rounds.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('not found: ' + a); return html.slice(i, j); };
const src = [
  "const DAY = 864e5; const DUP = new Map(); const esc = s => String(s);",
  "const storyCard = s => `<card ${s.key}>`;",
  "const LEAGUES = { efbet: 'efbet Лига', mrbit: 'Mr Bit Втора лига', sw3: 'Трета лига Югозапад' };",
  cut('const BG_DAYS =', 'const bgDate ='),
  cut('// World competitions on the Results page', '// a short fingerprint'),
  cut('// The feed a day at a time', '// The round filter'),
  cut("/* ── the competitions' rounds, for the news ── */", 'let RIDX'),
  cut('// the round a headline names', 'function storyRounds'),
  cut('// a tile shows the round', 'function renderRoundPick'),
  'export { roundNos, buildRounds, roundsOfStory, dayHead, withDays, dayNo, tileLabel };',
].join('\n');
const dir = mkdtempSync(join(tmpdir(), 'rounds-'));
writeFileSync(join(dir, 'page.mjs'), src);
const P = await import(join(dir, 'page.mjs'));

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// the round a headline names
for (const [t, want] of [
  ['Съдийската комисия: грешки в мачовете от 14-ия кръг', [14]], ['Наряд за 14-и кръг на efbet Лига', [14]], ['Ясни са съдиите за 1-вия кръг', [1]],
  ['Скандал в 7-мия кръг на Втора лига', [7]], ['14-ият кръг започва с дерби', [14]], ['Гидженов свири 3-тия кръг', [3]],
  ['Кръг 14: всички спорни моменти', [14]], ['кръг №5 в Трета лига', [5]], ['Левски 2:1 ЦСКА след спорна дузпа', []],
  ['Остават 3 кръга до края', []], ['1/8-финал за Купата', []], ['Кръг 2-1 за домакините', []],
]) ok(eq(P.roundNos(t), want), `round named: "${t}" → [${want}]`);

// the rounds: their own numbers in the Bulgarian leagues; days of most of the matches (a match postponed by weeks doesn't count)
const T = s => new Date(s).toISOString();
let id = 0;
const m = (league, round, kickoff, home_name = 'A' + id, away_name = 'B' + id) => ({ id: 'm' + (++id), league, round, kickoff: kickoff && T(kickoff), home_name, away_name });
const M = [
  ...['2026-09-18T17:00Z', '2026-09-19T15:00Z', '2026-09-20T15:00Z', '2026-09-21T17:00Z', '2026-12-03T16:30Z'].map(k => m('efbet', 10, k)),
  ...['2026-10-30T15:00Z', '2026-10-31T15:00Z', '2026-11-01T15:00Z', '2026-11-02T17:30Z'].map(k => m('efbet', 14, k)),   // round 14 was played before 13
  ...['2026-11-06T15:00Z', '2026-11-07T15:00Z', '2026-11-08T15:00Z'].map(k => m('efbet', 13, k)),
  m('efbet', 15, null), m('mrbit', 14, '2026-10-29T16:00Z'),
];
const R = P.buildRounds(M, []);
const ef = R.byLg.get('efbet');
ok(ef && eq(ef.rounds.map(r => r.no), [10, 13, 14]), 'efbet Лига: rounds by their own number (a round without kickoff times is left out)');
ok(R.byId.get('efbet|14').label === 'Кръг 14' && R.byId.get('efbet|14').when === '30 Окт – 2 Ное', 'efbet Кръг 14: "30 Окт – 2 Ное"');
ok(R.byId.get('efbet|13').when === '6–8 Ное', 'efbet Кръг 13: "6–8 Ное"');
ok(R.byId.get('efbet|10').when === '18–21 Сеп' && R.byId.get('efbet|10').ms.length === 5, 'Кръг 10: the match postponed to December keeps the round\'s days 18–21 Sep');
ok(R.byMatch.get(M[0].id).id === 'efbet|10' && R.byId.get('mrbit|14').lg === 'mrbit', 'every match → its round; Втора лига\'s round 14 is its own');

// world competitions: rounds worked out from the fixture list (20 clubs, two weekends)
const W = [];
for (const [wk, day] of [[0, '2026-08-15'], [1, '2026-08-22']]) for (let i = 0; i < 10; i++)
  W.push({ id: `e${wk}${i}`, league: 'eng.1', round_name: 'regular-season', note: '', kickoff: T(`${day}T1${i % 6}:00Z`),
    home_name: 'T' + (wk ? i : 2 * i), away_name: 'T' + (wk ? i + 10 : 2 * i + 1) });
const RW = P.buildRounds(W, [{ key: 'eng.1', name: 'Висша лига' }]);
ok(RW.byLg.get('eng.1') && RW.byLg.get('eng.1').rounds.length === 2 && RW.byId.get('eng.1|0').label === 'Кръг 1' && RW.byId.get('eng.1|1').label === 'Кръг 2', 'Висша лига: Кръг 1 and Кръг 2 from the fixture list');

// a round's tile: its number, or a knockout stage's name
ok(P.tileLabel({ label: 'Кръг 14' }) === '14' && P.tileLabel({ label: 'Основна фаза · кръг 3' }) === '3' && P.tileLabel({ label: '1/8-финал' }) === '1/8-финал', 'tiles: "14", "3", "1/8-финал"');

// which round a story is about
const story = (key, arts) => ({ key, arts: arts.map((a, i) => ({ aid: key + i, scope: 'bg', divs: ['d1'], ...a })) });
const R13 = R.byId.get('efbet|13').ms[0], R14 = R.byId.get('efbet|14').ms[0];
const ids = (s, linked) => [...P.roundsOfStory(s, R, linked)].sort();
ok(eq(ids(story('a', [{ title: 'Съдийската комисия: грешки в 14-ия кръг' }]), []), ['efbet|14']), 'a headline naming "14-ия кръг" (efbet Лига) → efbet Кръг 14');
ok(eq(ids(story('b', [{ title: 'Скандал с дузпа в Левски – ЦСКА' }]), [R13]), ['efbet|13']), 'a story linked to a match of round 13 → Кръг 13');
ok(eq(ids(story('c', [{ title: 'Анализ на 14-ия кръг' }]), [R13]), ['efbet|14']), 'the round the headline names wins over the club\'s next match');
ok(eq(ids(story('d', [{ title: 'Скандал в 14-и кръг на Втора лига', divs: ['d2'] }]), []), ['mrbit|14']), '"14-и кръг на Втора лига" → Втора лига\'s round 14, not efbet\'s');
ok(eq(ids(story('e', [{ title: 'Червен картон в 5-ия кръг при юношите', divs: ['youth'] }]), []), []), 'a youth league round is not a league round');
ok(eq(ids(story('f', [{ title: 'VAR controversy in round 14', scope: 'world', divs: [] }]), []), []), 'a World story naming a round: only by its match links');
ok(eq(ids(story('g', [{ title: 'Глоби за Левски' }]), []), []), 'no round named, no match: no round');

// the feed a day at a time
const now = Date.parse('2026-11-13T16:00:00');
const h0 = P.dayHead(Date.parse('2026-11-13T10:00:00'), 3, 7, now), h1 = P.dayHead(Date.parse('2026-11-12T22:00:00'), 1, 1, now), h2 = P.dayHead(Date.parse('2026-11-10T09:00:00'), 2, 5, now);
ok(h0.includes('Днес') && h0.includes('13 ноември') && h0.includes('3 теми · 7 статии'), 'today: "Днес · петък, 13 ноември · 3 теми · 7 статии"');
ok(h1.includes('Вчера') && h1.includes('1 тема · 1 статия'), 'yesterday: "Вчера", and one story is "1 тема"');
ok(h2.includes('Вторник, 10 ноември') && !h2.includes('Днес'), 'older days: "Вторник, 10 ноември"');
ok(P.dayHead(Date.parse('2025-12-30T12:00:00'), 1, 1, now).includes('2025'), 'another year says the year');
const day = (key, d) => ({ key, date: Date.parse(d), arts: [{}, {}] });
const feed = [day('x', '2026-11-13T12:00:00'), day('y', '2026-11-13T09:00:00'), day('z', '2026-11-12T20:00:00')];
const out = P.withDays(feed.slice(0, 2), feed);
ok((out.match(/dayhead/g) || []).length === 1 && out.includes('2 теми · 4 статии') && out.indexOf('dayhead') < out.indexOf('<card x>'), 'a heading where a day starts, counted for the whole day');
ok((P.withDays(feed, feed).match(/dayhead/g) || []).length === 2, 'two days, two headings');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
