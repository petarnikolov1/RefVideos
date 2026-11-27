// node stats.test.mjs — bulgarian-football.com's match statistics read as events, and each match found among ours
import * as R from './stats.js';
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

// bulgarian-football.com's statistics: what happened in each match, minute by minute (a test page made of four of
// the real matches of efbet Лига's 15th round, their event lines as they were)
{
  const { readFileSync } = await import('node:fs');
  const st = R.parseBfcStats(readFileSync(new URL('./fixtures/stats-a15.html', import.meta.url), 'utf8'));
  ok(st.length === 4 && st.map(m => m.no).join() === '2,5,6,7' && st[0].home === 'Славия' && st[0].away === 'Арда' && st[0].score.join() === '1,1'
    && st[0].date.iso === '2026-11-21T12:45:00.000Z' && st[0].codes.join() === 'сла,арда', 'the matches, their teams, score, time and team codes');
  const [sl, lev, bot, lud] = st, k = m => m.events.map(e => e.k).join(' ');
  ok(k(sl) === 'void var r y y sub goal sub sub var y pen y', 'every kind of event (a new captain left out): ' + k(sl));
  ok(sl.stop.join() === '2,4' && lud.stop.join() === '7,5', 'each half\'s added time');
  const red = sl.events[2], var1 = sl.events[1], voided = sl.events[0];
  ok(red.k === 'r' && red.side === 'a' && red.p === 'Набил Макни' && red.n === '70' && red.v === 1 && red.why === 'много груба игра' && red.min === '7', 'a red card after VAR, for the away team');
  ok(var1.k === 'var' && var1.min === '5-6' && var1.m === 5 && var1.what === 'чк' && var1.first === 'груба игра и жк' && var1.final === 'много груба игра и чк', 'a VAR review: its minutes, the first decision and the final one');
  ok(voided.k === 'void' && voided.what === 'жк' && voided.p === 'Набил Макни', 'the yellow card cancelled after VAR');
  const pen = sl.events[11], g = sl.events[6], ht = sl.events[5];
  ok(pen.k === 'pen' && pen.side === 'h' && pen.p === 'Йоан Борносузов' && pen.s === '1-1' && pen.v === 1, 'a penalty after VAR: the scorer without "ДУЗПА"');
  ok(g.k === 'goal' && g.side === 'a' && g.p === 'Лъчезар Котев' && g.p2 === 'Виктор Попов' && g.how === 'десен/игра', 'a goal: its side from the score, the scorer and the assist');
  ok(ht.k === 'sub' && ht.h === 0 && ht.min === 'пвр' && ht.p === 'Преслав Бачев' && ht.p2 === 'Антонио Вутов' && ht.side === 'a', 'a substitution in the break: who on, who off');
  ok(lev.events[0].k === 'og' && lev.events[0].side === 'h' && lev.events[0].p === 'Раян Бидунга', 'an own goal counts for the other side');
  ok(lev.events[3].inj === 1 && lev.events[3].h === 2, 'a substitution for an injury');
  ok(bot.events.at(-1).k === 'yr' && bot.events.at(-1).p === 'Сантиаго Годой', 'a second yellow card');
  ok(lud.events[1].min === '45+6' && lud.events[1].m === 45 && lud.events[1].x === 6 && lud.events[1].h === 1, 'a goal in the first half\'s added time');
  ok(lud.events[2].n === 'МК' && lud.events[2].p === 'Младен Кашчелан' && lud.events[2].side === 'h', 'a coach\'s card');
  ok(R.statsUrl('b', 17) === 'https://bulgarian-football.com/archive/2026-2027/stats/b-17.html', 'the round\'s page address');
  // each block → our match: the clubs as the statistics write them ("Левски (Сф)", "ЦСКА", "ФК ЦСКА 1948"), the day, the round
  const ours = [['efbet:fb-m-534555', '2026-11-21T12:45:00Z', 'Славия София', 'Арда Кърджали'], ['efbet:fb-m-534552', '2026-11-22T13:30:00Z', 'Левски София', 'ПФК Локомотив София 1929'],
    ['efbet:fb-m-534558', '2026-11-22T16:00:00Z', 'Ботев Пловдив', 'ЦСКА София'], ['efbet:fb-m-534546', '2026-11-23T16:00:00Z', 'Лудогорец', 'Дунав Русе'],
    ['efbet:fb-m-534544', '2026-11-22T11:00:00Z', 'Ботев Враца', 'ЦСКА 1948']].map(([id, kickoff, home_name, away_name]) => ({ id, kickoff, home_name, away_name, round: 15 }));
  const pa = R.assign(st.map(m => ({ ...m, fixture: m.home + ' - ' + m.away })), ours, 15);
  ok(pa.assigned.length === 4 && pa.assigned.sort((x, y) => x.item.no - y.item.no).map(x => x.match.id.slice(-3)).join() === '555,552,558,546', 'each match found: ' + pa.assigned.map(x => x.item.fixture + ' → ' + x.match.home_name).join('; '));
}
// a Second League match written without its formations: the team codes from the events and the line-ups
{
  const { readFileSync } = await import('node:fs');
  const [ch, fr] = R.parseBfcStats(readFileSync(new URL('./fixtures/stats-b2.html', import.meta.url), 'utf8'));
  ok(ch.codes.join() === 'чмц,бер', 'the codes worked out from who is in which line-up: ' + ch.codes.join());
  ok(ch.events.filter(e => e.k === 'y').map(e => e.side).join('') === 'ahhhh' && ch.events.find(e => e.k === 'sub' && e.p === 'Джулиано Бертино').side === 'a', 'so every card and substitution has its side');
  ok(fr.codes.join() === 'фра,рил' && fr.events[0].p === 'Станислав Дюлгеров' && fr.events[0].k === 'goal', 'a goal from a direct free kick: the scorer without "ПРЯК СВОБОДЕН"');
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
