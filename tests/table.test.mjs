// Tests for public/table.js (the live league table). Run: node tests/table.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../public/table.js');

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const row = (rank, team_name, played, won, drawn, lost, goals_for, goals_against, points, extra) =>
  ({ rank, team_name, played, won, drawn, lost, goals_for, goals_against, points, ...extra });
const match = (home_name, away_name, home_score, away_score, kickoff, status = 'finished', extra) =>
  ({ id: `${home_name}-${away_name}-${kickoff}`, home_name, away_name, home_score, away_score, kickoff: new Date(kickoff * 1000).toISOString(), status, ...extra });
const line = r => `${r.rank}. ${r.team_name} ${r.played} ${r.won}-${r.drawn}-${r.lost} ${r.goals_for}:${r.goals_against} ${r.points}`;

// 1. a match being played: a draw is a point each, and the order follows
{
  // round 1 played (in the source's table too), round 2 being played
  const rows = [row(1, 'А', 1, 1, 0, 0, 3, 0, 3), row(2, 'В', 1, 1, 0, 0, 2, 0, 3), row(3, 'Б', 1, 1, 0, 0, 1, 0, 3), row(4, 'Г', 1, 0, 0, 1, 0, 3, 0)];
  const played = [match('А', 'Г', 3, 0, 1000), match('В', 'Б', 2, 0, 1000)].map((m, i) => i ? { ...m, home_name: 'Б', away_name: 'В', home_score: 1, away_score: 0 } : m);
  rows[1] = row(2, 'Б', 1, 1, 0, 0, 1, 0, 3); rows[2] = row(3, 'В', 1, 0, 0, 1, 0, 1, 0);
  const live = [match('Б', 'Г', 1, 1, 2000, 'live'), match('А', 'В', 0, 2, 2000, 'live')];
  const t = T.build(rows, played.concat(live), { league: 'efbet' }), by = Object.fromEntries(t.rows.map(r => [r.team_name, r]));
  ok(by['Б'].points === 4 && by['Г'].points === 1 && by['Б'].played === 2 && by['Б'].drawn === 1 && by['Б'].live && by['Б'].live.pts === 1,
    'a live draw: both teams one point more, one match more');
  ok(t.rows.map(r => r.team_name).join('') === 'БВАГ' && by['Б'].rank === 1 && by['В'].points === 3 && by['В'].live.gf === 2 && by['А'].live.ga === 2,
    'the leader loses live and drops to third, behind В who is beating it: ' + t.rows.map(line).join(' | '));
  ok(t.live > 0 && t.caught === 0 && rows[0].points === 3 && !rows[0].live, 'the source rows are not changed');
}

// 2. nothing new: the source's table as it is, in its order
{
  const rows = [row(1, 'А', 1, 1, 0, 0, 2, 0, 3), row(2, 'Б', 1, 0, 0, 1, 0, 2, 0)];
  const t = T.build(rows, [match('А', 'Б', 2, 0, 1000)], { league: 'eng.1' });
  ok(!t.changed && t.rows.map(line).join(' | ') === '1. А 1 1-0-0 2:0 3 | 2. Б 1 0-0-1 0:2 0', 'a table that already has every result stays as it is');
}

// 3. a match the source has already counted while ours still says "live" is not counted twice
{
  const rows = [row(1, 'А', 2, 2, 0, 0, 4, 0, 6), row(2, 'Б', 2, 0, 0, 2, 0, 4, 0)];
  const t = T.build(rows, [match('А', 'Б', 2, 0, 1000), match('Б', 'А', 0, 2, 2000, 'live')], { league: 'eng.1' });
  ok(!t.changed && t.rows[0].points === 6, 'a just-finished match is not added on top of the source');
}

// 4. matches of another stage or between teams of two groups don't count
{
  const rows = [row(1, 'А', 0, 0, 0, 0, 0, 0, 0, { grp: 'Група A' }), row(2, 'Б', 0, 0, 0, 0, 0, 0, 0, { grp: 'Група A' }), row(1, 'В', 0, 0, 0, 0, 0, 0, 0, { grp: 'Група B' })];
  const ms = [match('А', 'Б', 1, 0, 1000, 'finished', { round_name: 'preliminary-round' }), match('А', 'В', 3, 0, 1000, 'live'), match('Б', 'А', 2, 2, 3000, 'live', { round_name: 'group-stage' })];
  const t = T.build(rows, ms, { league: 'caf.nations_qual' }), by = Object.fromEntries(t.rows.map(r => [r.team_name, r]));
  ok(by['А'].points === 1 && by['Б'].points === 1 && by['В'].points === 0 && by['А'].played === 1, 'qualifying-round and cross-group matches are left out');
  ok(t.rows.map(r => r.grp).join(',') === 'Група A,Група A,Група B' && by['В'].rank === 1, 'each group is ordered on its own');
}

// 5. finished matches the source hasn't counted yet are added (in the order they were played), with the form
{
  const rows = [row(1, 'А', 1, 1, 0, 0, 1, 0, 3, { form: 'W' }), row(2, 'Б', 1, 0, 0, 1, 0, 1, 0, { form: 'L' })];
  const t = T.build(rows, [match('А', 'Б', 1, 0, 1000), match('Б', 'А', 3, 0, 2000)], { league: 'mrbit' });
  ok(t.caught === 2 && t.rows.map(line).join(' | ') === '1. Б 2 1-0-1 3:1 3 | 2. А 2 1-0-1 1:3 3' && t.rows[0].form === 'LW',
    'the newer result is added and the teams re-ordered: ' + t.rows.map(line).join(' | '));
}

// 6. Bulgarian tie-breaks: the matches between the level teams first. The Third League South-West on 10 Nov 2026,
//    17 points: bulgarian-football.com ranks Кюстендил, Ботев 1937, Левски II, ЦСКА III, Етрополе (goal difference alone wouldn't)
{
  const level = [row(12, 'Кюстендил', 15, 4, 5, 6, 16, 20, 17), row(13, 'Ботев 1937', 15, 5, 2, 8, 17, 20, 17), row(14, 'Левски II', 15, 4, 5, 6, 18, 21, 17),
    row(15, 'ЦСКА III', 15, 3, 8, 4, 12, 12, 17), row(16, 'Етрополе', 16, 5, 2, 9, 18, 35, 17)].map(r => ({ ...r, changed: true }));
  const between = [match('Кюстендил', 'Ботев 1937', 1, 0, 1), match('Кюстендил', 'Левски II', 2, 2, 2), match('ЦСКА III', 'Кюстендил', 1, 1, 3), match('Кюстендил', 'Етрополе', 3, 1, 4),
    match('Ботев 1937', 'ЦСКА III', 2, 1, 5), match('Етрополе', 'Ботев 1937', 1, 4, 6), match('Левски II', 'ЦСКА III', 0, 0, 7), match('Етрополе', 'Левски II', 1, 3, 8), match('ЦСКА III', 'Етрополе', 0, 0, 9)];
  const shuffled = [level[4], level[2], level[0], level[3], level[1]].map(r => ({ ...r, rank: 99 - r.rank }));
  const got = T.order(shuffled, between, 'sw3').map(r => r.team_name).join(', ');
  ok(got === 'Кюстендил, Ботев 1937, Левски II, ЦСКА III, Етрополе', 'five teams level on points, ranked by the matches between them: ' + got);
  const gdOnly = T.order(shuffled, between, 'eng.1').map(r => r.team_name).join(', ');
  ok(gdOnly === 'ЦСКА III, Левски II, Ботев 1937, Кюстендил, Етрополе', 'a goal-difference league ranks the same five by goal difference: ' + gdOnly);
}

// 7. Втора лига on 10 Nov 2026: mr-bit.bg's table was stuck after round 13 while rounds 14 and 15 had been played
{
  const fx = JSON.parse(readFileSync(new URL('./fixtures/mrbit-2026-11-10.json', import.meta.url), 'utf8'));
  const ms = fx.matches.map(([h, a, hs, as, ts]) => match(h, a, hs, as, ts));
  ok(ms.length === 133, 'the fixture has the 133 finished matches');
  // goals and form for the games the source's table counts (what football-sync saves): each team's first N matches
  const rows = fx.table.map(([rank, team, p, w, d, l, pts]) => {
    const mine = ms.filter(m => m.home_name === team || m.away_name === team).sort((x, y) => Date.parse(x.kickoff) - Date.parse(y.kickoff)).slice(0, p);
    let gf = 0, ga = 0;
    for (const m of mine) { const h = m.home_name === team; gf += h ? m.home_score : m.away_score; ga += h ? m.away_score : m.home_score; }
    return row(rank, team, p, w, d, l, gf, ga, pts);
  });
  const t = T.build(rows, ms, { league: 'mrbit' });
  // every team's totals from all 133 results (as counted in the database)
  const want = {
    'ЦСКА София II': '15 9-4-2 32:14 31', 'Вихрен': '15 8-5-2 29:14 29', 'Черноморец 1919 Бургас': '15 8-5-2 27:13 29', 'Фратрия': '14 7-4-3 24:14 25',
    'Янтра 2019': '15 7-3-5 22:17 24', 'Хебър 1918': '15 7-2-6 32:25 23', 'Локомотив Г. Оряховица': '15 6-5-4 14:13 23', 'Лудогорец II': '14 6-4-4 20:14 22',
    'Берое': '15 6-4-5 24:21 22', 'Етър Велико Търново': '14 6-3-5 23:22 21', 'Спартак Плевен': '15 6-3-6 17:26 21', 'Рилски Спортист': '15 5-5-5 16:16 20',
    'Несебър': '15 5-3-7 22:23 18', 'Марек': '15 5-3-7 17:21 18', 'Монтана': '15 4-3-8 19:30 15', 'Спортист Своге': '15 2-6-7 12:21 12',
    'Добруджа': '14 2-4-8 14:27 10', 'Пирин Благоевград': '15 0-2-13 8:41 2' };
  const bad = t.rows.filter(r => `${r.played} ${r.won}-${r.drawn}-${r.lost} ${r.goals_for}:${r.goals_against} ${r.points}` !== want[r.team_name]);
  ok(!bad.length && t.rows.length === 18, 'all 18 teams brought up to date: ' + (bad.map(line).join(' | ') || 'ok'));
  // level on points: Вихрен (one meeting, 1:1, so goal difference) above Черноморец; Хебър above Локомотив ГО (not met: goal difference);
  // Берое above Лудогорец II, Спартак above Етър, Марек above Несебър (each won the match between them)
  const order = t.rows.map(r => r.team_name).join(', ');
  ok(order === 'ЦСКА София II, Вихрен, Черноморец 1919 Бургас, Фратрия, Янтра 2019, Хебър 1918, Локомотив Г. Оряховица, Берое, Лудогорец II, Спартак Плевен, Етър Велико Търново, Рилски Спортист, Марек, Несебър, Монтана, Спортист Своге, Добруджа, Пирин Благоевград',
    'the order, with the matches between level teams deciding: ' + order);
  ok(t.rows.every((r, i) => r.rank === i + 1) && !t.live, 'places 1-18, nothing live');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
