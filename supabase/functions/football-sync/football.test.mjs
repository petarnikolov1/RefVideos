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
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
