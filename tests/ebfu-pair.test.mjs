// Pairing ebfu.net's video archive with our matches (public/index.html: ebfuPair). ebfu.net names the clubs its own way
// ("Локо Пд", "ФК СЕПТЕМВРИ-1923", "Пирин Бл U18"); the cards here are copied from the real archive (November 2026),
// our matches from the database. Runs the page's own code. node tests/ebfu-pair.test.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('not found: ' + a); return html.slice(i, j); };
const src = `
const BG_MONTHS = ['Яну', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
function sofiaParts(iso){ const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(iso)).map(x => [x.type, x.value])); return { d: Number(p.day), m: BG_MONTHS[Number(p.month) - 1], time: p.hour + ':' + p.minute }; }
const noTime = m => /час — неуточнен/.test(m.note || '');
${cut('const EBFU_ABBR', 'const ebfuBy =')}
return { ebfuPair, ebfuNameFit };`;
const { ebfuPair, ebfuNameFit } = new Function(src)();

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// ours: [id, home, away, score, kickoff (UTC)]; cards: [home, away, score, day.month, time, uploaded by]
const M = rows => rows.map(([id, home_name, away_name, sc, kickoff]) => ({ id, home_name, away_name, kickoff, status: sc ? 'finished' : 'scheduled',
  home_score: sc ? +sc.split(':')[0] : null, away_score: sc ? +sc.split(':')[1] : null }));
const C = rows => rows.map(([home, away, sc, dm, time, by = 'home']) => ({ home, away, score: sc ? sc.split('-').map(Number) : null,
  when: { d: +dm.split('.')[0], mo: +dm.split('.')[1], time }, videos: by ? by.split('+').map((b, i) => ({ url: `https://ebfu.net/videoFile.php?stream_token=${home.length}-${i}`, by: b })) : [] }));
function check(name, ours, cards, want){
  const p = ebfuPair(ours, cards), got = Object.fromEntries(ours.map(m => [m.id, p.has(m.id) ? cards.findIndex(c => c.home === p.get(m.id).home && c.away === p.get(m.id).away) : -1]));
  const bad = Object.entries(want).filter(([id, i]) => got[id] !== i);
  ok(!bad.length, `${name}: ${p.size} of ${ours.length} paired` + (bad.length ? ' — wrong: ' + bad.map(([id, i]) => `${id} → ${got[id]} (want ${i})`).join(', ') : ''));
  return p;
}

// the First League, ЦСКА and ЦСКА 1948 in the same round
{
  const ours = M([['a', 'ЦСКА 1948', 'Спартак Варна', '6:1', '2026-10-30T15:00:00Z'], ['b', 'ПФК Локомотив София 1929', 'Ботев Пловдив', '2:5', '2026-10-30T17:30:00Z'],
    ['c', 'Локомотив Пловдив', 'Лудогорец', '0:3', '2026-10-31T12:00:00Z'], ['d', 'Дунав Русе', 'Левски София', '0:1', '2026-10-31T14:30:00Z'],
    ['e', 'ЦСКА София', 'Славия София', '0:0', '2026-10-31T17:30:00Z'], ['f', 'Черно море Варна', 'Ботев Враца', '1:0', '2026-11-02T16:30:00Z'],
    ['g', 'Арда Кърджали', 'Септември София', '2:1', '2026-11-02T17:30:00Z']]);
  const cards = C([['Арда', 'Септември Сф', '2-1', '2.11', '19:30'], ['ФК ЦСКА 1948', 'Спартак Вн', '6-1', '30.10', '17:00'], ['Локомотив Сф', 'Ботев Пловдив', '2-5', '30.10', '19:30'],
    ['Локо Пд', 'Лудогорец', '0-3', '31.10', '14:00'], ['Дунав Русе', 'Левски', '0-1', '31.10', '16:30', 'home+away'], ['ПФК ЦСКА', 'Славия', '0-0', '31.10', '19:30'],
    ['Черно море', 'Ботев Вр', '1-0', '2.11', '18:30']]);
  const p = check('efbet Лига, 14 кръг', ours, cards, { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 0 });
  ok(p.get('d').videos.map(v => v.by).join('+') === 'home+away', 'both clubs\' recordings of one match');
}
// the Third League North-East: the clubs' names differ the most here, and every match starts at the same time
{
  const ours = M([['a', 'Фратрия II (Бенковски, обл.Варна)', 'Черноморец (Балчик)', '2:5'], ['b', 'Бенковски (Исперих)', 'Ботев (Нови пазар)', '3:0'],
    ['c', 'Волов Шумен 2007 (Шумен)', 'Светкавица 2014 (Търговище)', '4:1'], ['d', 'Девня 2005 (Девня)', 'Аксаково (Аксаково)', '1:1'],
    ['e', 'Септември (Драгоево)', 'Лудогорец 1945 III (Разград)', '0:0'], ['f', 'Устрем Д (Дончево)', 'Черноломец 1919 (Попово)', '2:1'],
    ['g', 'Септември 98 (Тервел)', 'Олимпик (Варна)', '1:2'], ['h', 'Доростол Силистра (Силистра)', 'Черно море II (Варна)', '1:1']].map(r => [...r, '2026-11-14T12:00:00Z']));
  const cards = C([['ФК Волов-Шумен-2007', 'ФК Светкавица - 2014', '4-1'], ['ФК Бенковски Исперих', 'ФК Ботев НП', '3-0'], ['ФК Септември 98', 'ФК ОЛИМПИК', '1-2'],
    ['ФК ДЕВНЯ', 'ФК АКСАКОВО', '1-1'], ['ОФК Доростол 1902', 'Черно море II', '1-1', '14.11', '14:00', ''], ['ФК Фратрия II', 'Черноморец Бч', '2-5'],
    ['ФК Устрем', 'Черноломец – 1919', '2-1', '14.11', '14:00', ''], ['ФК СЕПТЕМВРИ-1923', 'Лудогорец III', '0-0', '14.11', '14:00', '']].map(r => [r[0], r[1], r[2], r[3] || '14.11', r[4] || '14:00', r[5] ?? 'home']));
  const p = check('В СИ, 14 кръг', ours, cards, { a: 5, b: 1, c: 0, d: 3, e: 7, f: 6, g: 2, h: 4 });
  ok(p.get('h').videos.length === 0 && p.get('b').videos.length === 1, 'a match whose video is not uploaded yet is still paired, with no video');
}
// the youth U18: Ботев Пловдив and УФК Ботев София, three Локомотив clubs, "Национал" without its age group
{
  const ours = M([['a', 'Пирин 22 (Благоевград)', 'Дунав от Русе (Русе)', '5:2', '2026-11-07T08:30:00Z'], ['b', 'Септември (София)', 'Миньор (Перник)', '2:1', '2026-11-07T09:00:00Z'],
    ['c', 'Локомотив София 1929 (София)', 'Янтра 2019 (Габрово)', '3:1', '2026-11-07T10:00:00Z'], ['d', 'Берое (Стара Загора)', 'Арда 1924 (Кърджали)', '2:1', '2026-11-07T11:00:00Z'],
    ['e', 'Нефтохимик 1962 (Бургас)', 'Национал (София)', '1:2', '2026-11-07T11:00:00Z'], ['f', 'Ботев (Пловдив)', 'УФК Ботев (София)', '4:1', '2026-11-07T11:00:00Z'],
    ['g', 'Хебър 1918 (Пазарджик)', 'Локомотив 1926 (Пловдив)', '0:3', '2026-11-07T11:30:00Z'], ['h', 'Локомотив (Горна Оряховица)', 'Славия 1913 (София)', '1:3', '2026-11-08T11:00:00Z']]);
  const cards = C([['Пирин Бл U18', 'Дунав U18', '5-2', '7.11', '10:30'], ['Септември Сф U18', 'Миньор U18', '2-1', '7.11', '11:00'], ['Локомотив Сф U18', 'Янтра U18', '3-1', '7.11', '12:00'],
    ['Берое U18', 'Арда U18', '2-1', '7.11', '13:00'], ['Ботев Пд U18', 'УФК Ботев София U18', '4-1', '7.11', '13:00'], ['ФК Нефтохимик 1962 U18', 'Национал', '1-2', '7.11', '13:00'],
    ['Хебър U18', 'Локомотив Пд U18', '0-3', '7.11', '13:30', ''], ['Локо ГО U18', 'Славия U18', '1-3', '8.11', '13:00']]);
  check('U18, 11 кръг', ours, cards, { a: 0, b: 1, c: 2, d: 3, e: 5, f: 4, g: 6, h: 7 });
}
// a card with the clubs the other way round: the home club's recording is our away club's
{
  const ours = M([['a', 'Секирово (кв.Секирово, Раковски)', 'Спартак 1947 (Пловдив)', '2:4', '2026-11-07T12:30:00Z'], ['b', 'Марица (Милево)', 'Созопол (Созопол)', '1:0', '2026-11-07T12:30:00Z']]);
  const cards = C([['Спартак Пд', 'ФК Секирово', '4-2', '7.11', '14:30'], ['ФК Марица - Милево', 'Созопол', '1-0', '7.11', '14:30']]);
  const p = check('В ЮИ, the clubs the other way round', ours, cards, { a: 0, b: 1 });
  ok(p.get('a').videos[0].by === 'away' && p.get('b').videos[0].by === 'home', 'the uploader follows our home and away');
}
// a match that isn't in the archive's round (postponed) gets no card, and a card of other clubs isn't forced on it
{
  const ours = M([['a', 'Септември II (София)', 'Струмска слава 1927 (Радомир)', null, '2026-10-31T12:00:00Z'], ['b', 'Левски II (София)', 'Ботев 1937 (Ихтиман)', '3:1', '2026-10-31T12:00:00Z']]);
  const cards = C([['ПФК Левски II', 'ОФК Ботев 1937', '3-1', '31.10', '14:00'], ['ФК Сливнишки герой', 'ФК Септември', '3-1', '31.10', '14:00']]);
  check('В ЮЗ, a postponed match', ours, cards, { a: -1, b: 0 });
}
// the wide layout gives no day or score, only the videos' titles: the clubs' full names, every reading of "A - B - C"
{
  const ours = M([['a', 'Септември София', 'ПФК Локомотив София 1929', '1:0', '2026-11-06T15:00:00Z'], ['b', 'Светкавица 2014 (Търговище)', 'Бенковски (Исперих)', '1:1', '2026-11-21T12:00:00Z'],
    ['c', 'Ботев Пловдив', 'ЦСКА София', '3:3', '2026-11-08T17:00:00Z'], ['d', 'Локомотив Пловдив', 'Ботев Враца', '2:0', '2026-11-07T12:00:00Z']]);
  const t = (teams, n = 1) => ({ home: teams, away: '', alts: [...teams.matchAll(/\s[-–]\s/g)].map(m => [teams.slice(0, m.index), teams.slice(m.index + m[0].length)]), when: null, score: null,
    videos: Array.from({ length: n }, (_, i) => ({ url: 'u' + i, by: i ? 'away' : 'home' })) });
  const cards = [t('ПФК Септември Сф - ФУТБОЛЕН КЛУБ ЛОКОМОТИВ СОФИЯ 1929 ЕАД'), t('ФК Светкавица - 2014 - ФК Бенковски Исперих', 2), t('ПФК Локомотив Пловдив - ПФК Ботев Враца')];
  check('the wide layout, from the titles only', ours, cards, { a: 0, b: 1, c: -1, d: 2 });
}
ok(ebfuNameFit('Банско тийм (Банско)', 'ФК Банско Тиим') === 1 && ebfuNameFit('Локомотив Г. Оряховица', 'Локо ГО') > 0.6 && ebfuNameFit('Черно море (Варна)', 'Черноморец 1919 U16') < 0.5,
  'names: й and и, the towns\' short forms, Черно море is not Черноморец');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
