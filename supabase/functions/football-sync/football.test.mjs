// node football.test.mjs — the efbetleague.com parser on the page's real layout (November 2026: teams listed once,
// matches naming them only by id)
import * as L from './lib.js';
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

const team = (id, name, logo) => ({ id, name, sport: 'FOOTBALL', threeLetterCode: 'XXX', gender: 'MALE',
  country: { id: 'cnt:1224', name: 'България', code: 'BG', flag: 'https://flagcdn.com/bg.svg' }, assets: { logo }, metadata: { branding: { primaryColor: '#ffffff' } } });
const match = (id, round, kickoff, one, two, status, s1, s2, h1, h2) => ({ id, sport: 'FOOTBALL', status: { type: status, code: status.toLowerCase(), name: status },
  timing: { kickoffTime: '$D' + kickoff, currentMinute: 0 }, score: status === 'FINISHED' ? { competitorOne: String(s1), competitorTwo: String(s2),
    breakdown: { total: { competitorOne: String(s1), competitorTwo: String(s2) }, halfTime: { competitorOne: String(h1), competitorTwo: String(h2) } } } : '$undefined',
  round: { id: 'rnd:' + round, key: String(round), name: String(round), type: 'LEAGUE' }, metadata: { stageId: 'fb:stg:151715' },
  fansUnitedMatchId: id, competitorOne: { id: one }, competitorTwo: { id: two } });
const teams = [team('fb:t:82', 'Левски София', 'https://football.fansunitedassets.com/team/53498d40.png'),
  team('fb:t:817', 'ЦСКА София', 'https://football.fansunitedassets.com/team/8b6470dc.png'),
  team('fb:t:834', 'Лудогорец', 'https://sport.fansunitedassets.com/teams/220b13da.webp'),
  team('fb:t:820147', 'ЦСКА 1948', 'https://football.fansunitedassets.com/team/f92ecffd.png')];
const rounds = [{ id: 'rnd:507', name: '13', stageId: 'fb:stg:151715', stageRoundCount: 26, isKnockout: false, status: '$undefined', matches: [
  match('fb:m:534543', 13, '2026-11-08T15:00:00.000Z', 'fb:t:82', 'fb:t:817', 'FINISHED', 0, 3, 0, 1),
  match('fb:m:534542', 13, '2026-11-07T16:30:00.000Z', 'fb:t:834', 'fb:t:820147', 'FINISHED', 2, 2, 1, 0),
  match('fb:m:534999', 13, '2026-11-07T16:30:00.000Z', 'fb:t:834', 'fb:t:999', 'NOT_STARTED')] }];
// as the page sends it: the RSC text in self.__next_f.push chunks, the team list in one chunk and the rounds in a later one
const rsc1 = '1f:["$","div",null,{"competition":{"teams":' + JSON.stringify(teams) + '},"entityType":"competition"}]\n';
const rsc2 = '2a:["$","main",null,{"promos":[],"rounds":' + JSON.stringify(rounds) + '}]\n';
const html = `<script>self.__next_f.push([1,${JSON.stringify(rsc1)}])</script><script>self.__next_f.push([1,${JSON.stringify(rsc2)}])</script>`;

const t = L.efbetTeams(L.decodeRsc(html));
ok(t.size === 4 && t.get('fb:t:821') === undefined && t.get('fb:t:817').name === 'ЦСКА София' && /8b6470dc/.test(t.get('fb:t:817').logo), 'the team list: id → name and logo');
const ms = L.parseEfbetMatches(html);
const lc = ms.find(m => m.id === 'efbet:fb-m-534543');
ok(lc && lc.home_name === 'Левски София' && lc.away_name === 'ЦСКА София' && lc.home_score === 0 && lc.away_score === 3 && lc.ht_away === 1 && lc.round === 13
  && lc.status === 'finished' && /53498d40/.test(lc.home_logo) && lc.kickoff === '2026-11-08T15:00:00.000Z', 'round 13 Левски – ЦСКА 0:3: names, logos, score, half time');
ok(ms.find(m => m.id === 'efbet:fb-m-534542')?.away_name === 'ЦСКА 1948', 'Лудогорец – ЦСКА 1948');
ok(ms.length === 2 && ms.every(m => m.home_name && m.away_name), 'a match with a team the page does not name is left out (no nameless rows)');
// the old layout (names inside the match) still works
const old = [{ name: '1', matches: [{ ...match('fb:m:1', 1, '2026-07-17T16:00:00.000Z', 'fb:t:821', 'fb:t:820147', 'FINISHED', 2, 2, 2, 0),
  competitorOne: { id: 'fb:t:821', name: 'Спартак Варна', assets: { logo: 'https://x/a.png' } }, competitorTwo: { id: 'fb:t:820147', name: 'ЦСКА 1948', logo: 'https://x/b.png' } }] }];
const oldMs = L.parseEfbetMatches(`<script>self.__next_f.push([1,${JSON.stringify('2:{"rounds":' + JSON.stringify(old) + '}')}])</script>`);
ok(oldMs.length === 1 && oldMs[0].home_name === 'Спартак Варна' && oldMs[0].home_logo === 'https://x/a.png' && oldMs[0].away_logo === 'https://x/b.png', 'the older layout with names in the match');
// Втора лига: mr-bit.bg's table lags behind its results — goals and form only from the matches it counts
{
  const tr = (pos, slug, name, p, w, d, l, pts) => `<tr><td class="pos">${pos}</td><td class="team"><a href="#"><img data-src="/static/teams-logos/ids/${slug}.png" alt=""><span>${name}</span></a></td>` +
    `<td>${p}</td><td>${w}</td><td>${d}</td><td>${l}</td><td class="form"></td><td class="pts">${pts}</td></tr>`;
  const html = '<table class="standing-table"><tbody>' + tr(1, 'vihren-5025', 'Вихрен', 1, 1, 0, 0, 3) + tr(2, 'beroe-857', 'Берое', 1, 0, 0, 1, 0) + '</tbody></table>';
  const ms = [{ home_name: 'Вихрен', away_name: 'Берое', home_score: 2, away_score: 0, status: 'finished', kickoff: '2026-08-01T15:00:00Z' },
    { home_name: 'Берое', away_name: 'Вихрен', home_score: 3, away_score: 1, status: 'finished', kickoff: '2026-08-08T15:00:00Z' }];
  const t = L.parseMrbitStandings(html, ms);
  ok(t.length === 2 && t[0].goals_for === 2 && t[0].goals_against === 0 && t[0].form === 'W' && t[1].goals_for === 0 && t[1].form === 'L',
    'a table one round behind: goals and form of the one match it counts, not of both');
}
// referee clips: the YouTube results of "Левски ЦСКА съдия" two days after the derby (10 Nov 2026), and a few made-up titles
{
  const EF = ['ЦСКА София', 'Левски София', 'Лудогорец', 'ЦСКА 1948', 'Ботев Пловдив', 'Арда Кърджали', 'Спартак Варна', 'Славия София',
    'Черно море Варна', 'Дунав Русе', 'Локомотив Пловдив', 'Септември София', 'Ботев Враца', 'ПФК Локомотив София 1929'];
  const al = L.teamAliases(EF);
  const m = { id: 'x', league: 'efbet', round: 13, kickoff: '2026-11-08T17:30:00Z', home_name: 'Левски София', away_name: 'ЦСКА София', home_score: 0, away_score: 3 };
  const V = (id, title, channel, length, published) => ({ id, title, channel, length, seconds: length.split(':').reduce((a, b) => a * 60 + Number(b), 0), published });
  const real = [
    V('a1', 'БУТОНКИТЕ: Катастрофален Левски!', 'dsportbg', '24:32', 'преди 1 ден'),
    V('a2', 'Mелета и много ЕКШЪН на ЦСКА - Левски от 1985г до днес', 'CSKA Sofia Life', '8:15', 'преди 5 дни'),
    V('a3', 'Левски - ЦСКА 1:0, неотсъдени дузпи и първа титла за Лудогорец.', 'Академия Спорт', '3:47', 'преди 10 м.'),
    V('a4', 'Този мач НЕ Е ЗА ЕКСПЕРИМЕНТИ! ЛЕВСКИ 0:3 ЦСКА-София #КраенРезултат', 'Трибуна ЛЕВСКИ', '1:34:32', 'Предавано поточно преди 1 ден'),
    V('a5', 'Бостанджиев, Боримиров, Костадинов и Божинов след мача срещу ЦСКА', 'ЛЕВСКИ ТВ / LEVSKI TV', '3:16', 'преди 1 ден'),
    V('a6', '🔴🔵 ЕДНО ДЕРБИ, ДВА СЕКТОРА, ДВЕ РАЗЛИЧНИ ЕМОЦИИ! ЦСКА ПОБЕДИ ЛЕВСКИ С 3:0!🔥', 'След 90-тата', '20:28', 'преди 1 ден'),
    V('a7', 'ЦСКА преподава на Левски: Жан-Филип Гбамен с трети гол', 'Gong.bg', '1:37', 'преди 1 ден'),
    V('a8', 'ЦСКА вкара Левски в размисли след разгрома в дербито', 'dsportbg', '43:38', 'преди 19 ч'),
    V('a9', 'Левски - ЦСКА 0:3 /разширен репортаж, 13 кръг/', 'Gong.bg', '20:09', 'преди 1 ден'),
    V('a10', 'Грозни сцени на дербито Левски – ЦСКА', 'Gong.bg', '5:27', 'преди 1 г.'),
    V('a11', 'БЯХ на Левски - ЦСКА , ПОЛУДЯХ... 😡', 'KingRobi-TV', '9:21', 'преди 1 ден'),
  ];
  const made = [
    V('b1', 'Скандал! Съдията отмени гол на Левски срещу ЦСКА', 'Gong.bg', '2:10', 'преди 1 ден'),
    V('b2', 'Дузпа или не? Спорният момент в Левски - ЦСКА 0:3', 'Някой канал', '1:05', 'преди 1 ден'),
    V('b3', 'Червените обърнаха Левски', 'Gong.bg', '1:00', 'преди 1 ден'),
    V('b4', 'Съдията ощети Левски срещу Ботев Пловдив', 'Gong.bg', '1:00', 'преди 1 ден'),
    V('b5', 'Треньорът на ЦСКА: Съдийството беше добро', 'Фен канал', '2:00', 'преди 1 ден'),
    V('b6', 'Левски протестира заради ВАР', 'Gong.bg', '1:30', 'преди 3 седм.'),
  ];
  const got = L.pickRefClips(m, [...real, ...made], al, new Set(['a9']), Date.parse('2026-11-10T12:00:00Z'));
  // Спартак Варна – Арда 3:2 and Ботев Пловдив – Дунав 1:1 ("<home> <away> съдия" two and three days after)
  const m2 = { id: 'y', league: 'efbet', round: 13, kickoff: '2026-11-08T12:30:00Z', home_name: 'Спартак Варна', away_name: 'Арда Кърджали', home_score: 3, away_score: 2 };
  const m3 = { id: 'z', league: 'efbet', round: 14, kickoff: '2026-11-06T17:00:00Z', home_name: 'Ботев Пловдив', away_name: 'Дунав Русе', home_score: 1, away_score: 1 };
  const at = Date.parse('2026-11-10T17:00:00Z');
  const g2 = L.pickRefClips(m2, [
    V('c1', 'Александър Тунчев след поражението на „Арда“ от „Спартак“ във Варна – анализ и коментар', 'Naroden Sport Rumen Genov', '2:09', 'преди 2 дни'),
    V('c2', 'Дани Моралес започна с победа начело на „Спартак“ Варна! Успешен дебют срещу „Арда“', 'Naroden Sport Rumen Genov', '5:15', 'преди 2 дни'),
    V('c3', 'Спартак Пловдив 1:2 Арда: Пловдивският тим отпадна злощастно', 'Истински футбол', '4:44', 'преди 3 седм.'),
    V('c4', '„Спартак“ (Варна) – „Арда“ (Кърджали): Начало на двубоя', 'Naroden Sport Rumen Genov', '2:37', 'преди 2 дни'),
  ], al, new Set(), at).map(v => v.id).join(',');
  ok(g2 === 'c1', 'a coach after the match on a smaller channel, naming both teams; not news clips or another Спартак → ' + g2);
  const g3 = L.pickRefClips(m3, [
    V('d1', 'Генчев: Най-много ме е яд за изравнителния гол на Дунав', 'Gong.bg', '2:03', 'преди 3 дни'),
    V('d2', 'Много лесно изгубени точки!!! Ботев Пловдив - Дунав Русе 1-1 реакция', ' Stefan Zombori', '10:35', 'преди 3 дни'),
    V('d3', 'Botev Plovdiv vs Dunav Ruse - Bulgarian First League - Live Score', 'NetAndGoal', '2:53:44', 'Предавано поточно преди 3 дни'),
  ], al, new Set(), at).map(v => v.id).join(',');
  ok(g3 === 'd1', 'a quote headline ("Генчев: …") is an interview; a fan\'s reaction video and a stream are not → ' + g3);
  const ids = got.map(v => v.id).join(',');
  ok(ids === 'b1,b2,a8,a5', 'referee clips: refereeing words first, then the interviews; not the reports, goals, streams, old clips, other matches → ' + ids);
  ok(got[0].kind === 'ref' && got[2].kind === 'talk', 'referee clips are marked ref / talk');
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
