// stats-sync's reading of bulgarian-football.com's match statistics. Plain JS so it runs in the Edge Function and can be
// tested with Node (node stats.test.mjs). The date and club-name helpers are the same as refs-sync/refs.js's.

export const SEASON = '2026/27';
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—' };
export const decode = s => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m));
const clean = s => decode(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Sofia wall-clock time → UTC (EET +2, EEST +3 from the last Sunday of March to the last Sunday of October, 01:00 UTC)
export function sofiaUtc(y, mo, d, h = 12, mi = 0) {
  const lastSun = m => { const t = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, t.getUTCDate() - t.getUTCDay(), 1); };
  const t = Date.UTC(y, mo, d, h, mi) - 2 * 3600e3;
  return new Date(t >= lastSun(2) - 3600e3 && t < lastSun(9) ? t - 3600e3 : t);
}
// "8 ноември 2026 г., неделя, 17:00 ч." / "1 август 2026 г., събота, 18:00 ч" / "14 ноември 2026 г."
const RX_DATE = /(\d{1,2})\s+(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\s+(\d{4})\s*г\.?(?:,\s*[а-я]+)?(?:,\s*(\d{1,2})[:.](\d{2}))?/i;
export function parseDate(s) {
  const m = String(s).match(RX_DATE);
  if (!m) return null;
  const y = +m[3], mo = MONTHS.indexOf(m[2].toLowerCase()), d = +m[1], hasTime = m[4] != null;
  return { y, mo, d, time: hasTime ? `${m[4].padStart(2, '0')}:${m[5]}` : null,
    iso: sofiaUtc(y, mo, d, hasTime ? +m[4] : 12, hasTime ? +m[5] : 0).toISOString(), day: `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}
/* ───────── names ───────── */
// Latin letters that look Cyrillic ("ПФK", "Kюстендил") are read as Cyrillic
const LOOK = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
const STOP = new Set(['пфк', 'фк', 'офк', 'сфк', 'фск', 'ск', 'сдружение', 'общински', 'футболен', 'клуб', 'професионален', 'ад', 'еад', 'оод', 'еоод',
  'на', 'тийм', 'тиим', 'team']);
export function tokens(s) {
  const t = String(s).toLowerCase().replace(/[a-z]/g, (c, i, all) => /[а-я]/.test(all[i - 1] || '') || /[а-я]/.test(all[i + 1] || '') ? (LOOK[c] || c) : c);
  return t.replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w && !STOP.has(w));
}
const RESERVE = w => w === 'ii' || w === 'iii' || w === '2' || w === '3';
const same = (a, b) => a === b || (!/^\d+$/.test(a) && !/^\d+$/.test(b) && a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))));
// how well a club name (as the league writes it, "Пирин 1941 (Разлог)") fits a piece of text written another way
// ("ФК Пирин Разлог 1941", "ПИРИН 1941 РЗ."): the share of its name's words found, a little more for its town
export const ALIAS = { 'армията': 'цска', 'централен': 'цска',
  // the towns' short forms ("Левски (Сф)", "Черноморец (Бс)")
  'сф': 'софия', 'пд': 'пловдив', 'вн': 'варна', 'вр': 'враца', 'бс': 'бургас', 'гб': 'габрово', 'пк': 'перник', 'бл': 'благоевград', 'сз': 'загора', 'пл': 'плевен', 'вт': 'търново', 'рз': 'разград' };
export function fit(team, text) {
  const town = (String(team).match(/\(([^)]*)\)/) || [])[1] || '';
  const main = tokens(String(team).replace(/\([^)]*\)/g, ' ')), tw = tokens(town);
  const words = tokens(text).map(w => ALIAS[w] || w);
  if (!main.length || !words.length) return 0;
  let hit = main.filter(t => words.some(w => same(t, w))).length / main.length;
  if (!hit) return 0;
  if (tw.some(t => words.some(w => same(t, w)))) hit += 0.25;
  // a reserve team ("ЦСКА II", "Левски II") is not the first team, and the other way round
  if (main.some(RESERVE) !== words.some(RESERVE)) hit *= 0.3;
  return hit;
}
// "ПФК Левски - ПРОФЕСИОНАЛЕН ФУТБОЛЕН КЛУБ ЦСКА ЕАД": names can contain " - " too ("ОФК Вихрен - Сандански"),
// so every split is tried and the best one counts
export function fitFixture(home, away, fixture) {
  const parts = String(fixture).split(/\s+[-–—]\s+/);
  let best = 0;
  for (let i = 1; i < parts.length; i++) {
    const h = fit(home, parts.slice(0, i).join(' ')), a = fit(away, parts.slice(i).join(' '));
    if (h > 0 && a > 0) best = Math.max(best, h + a);
  }
  return best;
}
// each match's statistics → our match: both clubs' names must fit, the same day and time and round count too
export function assign(items, matches, round) {
  const pairs = [];
  for (const [i, it] of items.entries()) for (const m of matches) {
    const local = m.kickoff ? new Date(m.kickoff) : null;
    const sameRound = round != null && m.round === round;
    const day = local && it.date ? Math.abs(Date.parse(it.date.iso) - local.getTime()) : Infinity;
    if (!sameRound && day > 2 * 864e5) continue;
    const f = fitFixture(m.home_name, m.away_name, it.fixture);
    if (!f) continue;
    pairs.push({ i, m, s: f + (sameRound ? 0.5 : 0) + (day < 10 * 60e3 ? 1 : day < 864e5 ? 0.5 : 0) });
  }
  pairs.sort((a, b) => b.s - a.s);
  const usedI = new Set(), usedM = new Set(), out = [];
  for (const p of pairs) {
    if (usedI.has(p.i) || usedM.has(p.m.id) || p.s < 1) continue;
    usedI.add(p.i); usedM.add(p.m.id);
    out.push({ item: items[p.i], match: p.m, score: Math.round(p.s * 100) / 100 });
  }
  return { assigned: out, unmatched: items.filter((_, i) => !usedI.has(i)).map(x => x.fixture) };
}

/* ───────── what happened in a match: bulgarian-football.com's statistics (First and Second League) ─────────
   One page per round (archive/<season>/stats/a-<round>.html for the First League, b-<round>.html for the Second),
   one block per match: <h3><a id="N"></a>Славия 1-1 Арда</h3><pre class="stats"> … събития: one line per event …</pre>
     жк - 31 - 27.Умаро Балде сла (груба игра)            yellow card: minute, number.name, team code, (why)
     чк - 86 - 9.Сантиаго Годой цска (втори жълти картон)  red card (a second yellow says so)
     см - 56 - '1 9.Йоан Борносузов на 19.Емилиян Гогев сла   substitution: who comes on "на" who goes off
     0-1 - 51 - 80.Лъчезар Котев (десен/игра/6.Виктор Попов/подаване)   a goal: the score after it (АВТОГОЛ, ДУЗПА)
     вар - 88-90 - ситуация за чк сеп/първ.решение: …/вар решение: …   a VAR review, from its start to its end
     отм - 5 - 70.Набил Макни арда (груба игра) /отменен след вар жк/   an event cancelled after VAR
     ид - missed penalty, съд / пс - a new referee / assistant, спр / пдн / прк - stopped / resumed / abandoned
     + 2 мин.   the half's added time;  пвр - in the half-time break;  кр - after the end
   The team codes ("сла", "арда") are the ones of the "схеми:" lines, home first. */
export const STATS_PAGES = [['efbet', 'a'], ['mrbit', 'b']];
export const statsUrl = (letter, round, season = SEASON) => { const y = +String(season).slice(0, 4); return `https://bulgarian-football.com/archive/${y}-${y + 1}/stats/${letter}-${round}.html`; };
const EV_KIND = { 'жк': 'y', 'чк': 'r', 'см': 'sub', 'вар': 'var', 'отм': 'void', 'ид': 'miss', 'съд': 'ref', 'пс': 'ref', 'спр': 'stop', 'пдн': 'go', 'прк': 'end', 'нбс': 'left' };
// "45+6" → { m: 45, x: 6, h: 1 }; "пвр" → the break; "88-90+1" (a VAR review) → its start
export function statsMinute(s) {
  const t = String(s).trim();
  if (t === 'пвр') return { min: 'пвр', m: 45, x: 0, h: 0 };
  if (t === 'кр') return { min: 'кр', m: 120, x: 0, h: 9 };
  const m = t.match(/^(\d{1,3})(?:\+(\d{1,2}))?/);
  if (!m) return { min: t, m: null, x: 0, h: null };
  const base = +m[1], x = m[2] ? +m[2] : 0;
  return { min: t, m: base, x, h: base <= 45 ? 1 : base <= 90 ? 2 : 3 };
}
// "9.Сантиаго Годой" / "МК.Младен Кашчелан (тр)" → { n: '9', p: 'Сантиаго Годой' }
const person = s => { const m = String(s).trim().match(/^(?:(\d{1,3}|[A-ZА-Я]{1,3})\.)?\s*(.+?)(?:\s+\((?:вр|тр|пом\.?\s*тр|к)\))?$/u); return m ? { n: m[1] || '', p: m[2].trim() } : { n: '', p: String(s).trim() }; };
export function parseStatsEvent(line, codes, score) {
  const L = line.replace(/\s+/g, ' ').trim(), m = L.match(/^(\S+) - (\S+) - (.*)$/);
  if (!m) return null;
  const [, code, minute, rest0] = m, at = statsMinute(minute), rest = rest0.replace(/\s*->.*$/, '').trim();
  const side = c => c === codes[0] ? 'h' : c === codes[1] ? 'a' : '';
  // the words before the team's code are the person, the ones after it what was written about it
  const split = text => {
    const w = text.split(' '), i = w.findIndex((x, j) => j > 0 && (x === codes[0] || x === codes[1]));
    if (i < 0) return { who: text, side: '', after: '' };
    return { who: w.slice(0, i).join(' '), side: side(w[i]), after: w.slice(i + 1).join(' ') };
  };
  const why = s => ((s.match(/\(([^)]*)\)/) || [])[1] || '').trim();
  const ev = { ...at };
  if (/^\d+-\d+$/.test(code)) {   // a goal: whose it is follows from the score
    const [h, a] = code.split('-').map(Number), side0 = h > score[0] ? 'h' : a > score[1] ? 'a' : '';
    score[0] = h; score[1] = a;
    const own = /АВТОГОЛ/.test(rest), pen = /ДУЗПА/.test(rest);
    // (after the name, in capitals, how it was scored: "АВТОГОЛ", "ДУЗПА", "ПРЯК СВОБОДЕН")
    const who = person(rest.replace(/\s*[(/][\s\S]*$/, '').replace(/(?:\s+[А-ЯA-Z]{3,})+$/u, ''));
    const assist = (rest.match(/\/(\d{1,3}\.[^/()]+?)\/подаване/) || [])[1];
    return { ...ev, k: own ? 'og' : pen ? 'pen' : 'goal', s: code, side: side0, ...who, ...(assist ? { p2: person(assist).p } : {}), ...(/\/вар\//.test(rest) ? { v: 1 } : {}), how: why(rest.replace(/^[^(]*?(?=\()/, '')).split('/').slice(0, 2).join('/') };
  }
  const k = EV_KIND[code];
  if (!k || code === 'к') return null;   // (a new captain isn't shown)
  if (k === 'sub') {
    const body = rest.replace(/^'\d\s*/, ''), [inn, out = ''] = body.split(/ на /);
    const s = split(out);
    return { ...ev, k, side: s.side, ...person(inn), p2: person(s.who).p, ...(/контузия/.test(s.after) ? { inj: 1 } : {}) };
  }
  if (k === 'var') {
    const v = rest.match(/ситуация за (.+?) (\S+)\/първ\.?\s*решение:\s*([^/]*)\/вар решение:\s*(.*)$/);
    return v ? { ...ev, k, what: v[1], side: side(v[2]), first: v[3].trim(), final: v[4].trim() } : { ...ev, k, txt: rest };
  }
  if (k === 'void') {
    const s = split(rest.replace(/\s*\/отменен[^/]*\/\s*/, ' ').trim());
    return { ...ev, k, what: (rest.match(/отменен след вар (\S+?)\/?$/) || rest.match(/отменен\S*\s+след\s+\S+\s+(\S+)\//) || [])[1] || '', side: s.side, ...person(s.who.replace(/\s*\([\s\S]*$/, '')) };
  }
  if (k === 'y' || k === 'r' || k === 'miss' || k === 'left') {
    const s = split(rest);
    return { ...ev, k: k === 'r' && /втори жълт/.test(s.after) ? 'yr' : k, side: s.side, ...person(s.who), ...(why(s.after) ? { why: why(s.after) } : {}), ...(/\/вар\//.test(s.after) ? { v: 1 } : {}) };
  }
  return { ...ev, k, txt: rest };
}
// A match written without its formations ("схеми:", often the Second League's) has no list of the team codes: they are
// worked out from the events instead — the code after a player's name, and whose line-up the player is in.
const TEAM_LINE = /^([\p{L}.\- ]{2,16}):\s+\d{1,3}\./u, NOT_TEAM = /^(?:резерви|капитани|треньор|схеми|съдия|място|време|екипи)$/;
export function guessCodes(lines, ei) {
  const end = ei >= 0 ? ei : lines.length, labels = [];
  for (let i = 0; i < end; i++) { const m = lines[i].match(TEAM_LINE); if (m && !NOT_TEAM.test(m[1].trim())) labels.push(i); }
  if (labels.length < 2) return ['', ''];
  const roster = [lines.slice(labels[0], labels[1]).join(' '), lines.slice(labels[1], end).join(' ')];
  const votes = new Map();
  for (const l of lines.slice(end + 1)) {
    const m = l.match(/^(жк|чк|см|ид|отм|нбс) - \S+ - (.*)$/);
    if (!m) continue;
    const seg = (m[1] === 'см' ? m[2].split(' на ').slice(1).join(' на ') : m[2]).replace(/\s*(?:->|\(|\/|\s-\s)[\s\S]*$/, '').trim().split(' ');
    const code = seg.pop(), name = seg.join(' ').replace(/^(?:\d{1,3}|[A-ZА-Я]{1,3})\./, '').trim();
    if (!/^[а-яa-z0-9]{2,5}$/.test(code || '') || !name) continue;
    const v = votes.get(code) || [0, 0];
    if (roster[0].includes(name)) v[0]++;
    if (roster[1].includes(name)) v[1]++;
    votes.set(code, v);
  }
  const by = side => [...votes.entries()].sort((a, b) => (b[1][side] - b[1][1 - side]) - (a[1][side] - a[1][1 - side]))[0];
  const h = by(0), a = by(1);
  return h && a && h[0] !== a[0] && h[1][0] > h[1][1] && a[1][1] > a[1][0] ? [h[0], a[0]] : ['', ''];
}
export function parseBfcStats(html) {
  const out = [], h = String(html);
  for (const part of h.split(/<h3>\s*<a id="(?=\d)/).slice(1)) {
    const no = +part.match(/^(\d+)/)[1];
    const head = clean((part.match(/^\d+"\s*><\/a>([\s\S]*?)<\/h3>/) || [])[1] || '');
    const hm = head.match(/^(.+?)\s+(\d+)\s*[-:]\s*(\d+)\s+(.+)$/);
    const pre = (part.match(/<pre class="stats">([\s\S]*?)<\/pre>/) || [])[1] || '';
    if (!hm || !pre) continue;
    const lines = pre.split(/\r?\n/).map(l => clean(l.replace(/<!--[\s\S]*?-->/g, '')));
    const val = k => (lines.find(l => l.startsWith(k + ':')) || '').slice(k.length + 1).trim();
    const date = parseDate(val('време'));
    const si = lines.findIndex(l => l.startsWith('схеми:'));
    const ei = lines.findIndex(l => l.startsWith('събития:')), events = [], stop = [];
    let codes = si >= 0 ? [lines[si].replace(/^схеми:\s*/, ''), lines[si + 1] || ''].map(l => (l.match(/^(\S+?):/) || [])[1] || '') : ['', ''];
    if (!codes[0] || !codes[1]) codes = guessCodes(lines, ei);
    const score = [0, 0];
    let second = false;
    if (ei >= 0) for (const l of lines.slice(ei + 1)) {
      if (/^съкращения/.test(l)) break;
      if (!l) continue;
      const plus = l.match(/^\+\s*(\d+)\s*мин/);
      if (plus) { stop[second || stop.length ? 1 : 0] = +plus[1]; second = true; continue; }
      if (/^-{3,}$/.test(l)) { second = true; continue; }
      const ev = parseStatsEvent(l, codes, score);
      if (!ev) continue;
      if (ev.h === 2 || ev.h === 0) second = true;
      events.push(ev);
    }
    out.push({ no, home: hm[1].trim(), away: hm[4].trim(), score: [+hm[2], +hm[3]], date, venue: val('място').replace(/\s*,?\s*~.*$/, ''), codes, stop, events });
  }
  return out;
}
