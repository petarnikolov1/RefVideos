// ebfu.js — reading ebfu.net, the Bulgarian Football Union's electronic championship (БФС Електронно първенство).
//
// https://ebfu.net/teams/ is a PHP form: posting curDate=YYYY-MM-DD lists that day's matches, each with a hidden
// showMatchBtn code (e.g. "9a682"); posting showMatchBtn remembers the match in the PHP session and sends the browser to
// showTeamList.php, the match sheet: the competition and round, the stadium, the refereeing team (referee, assistants,
// fourth official, VAR, AVAR, the BFU delegate, the referee observer, each with their town), and each team's starting
// eleven (shirt number, the goalkeeper and the captain marked), the substitutes and the head coach. Clubs fill the
// teams in about an hour or two before kick-off.
//
// Plain functions, no network: the Edge Function fetches, this reads (and is tested in sheets.test.mjs).

export const BASE = 'https://ebfu.net/teams/';
// the competitions read, by ebfu's label: efbet Лига, Втора лига (ВПФЛ) and the Third League South-West (В ЮЗ)
export const LEAGUES = { 'efbet Лига': 'efbet', 'ВПФЛ': 'mrbit', 'В ЮЗ': 'sw3' };
// the refereeing roles, as the site's other referee data writes them (football_officials.crew: { r, n })
export const ROLES = {
  'главен съдия': 'ГС', 'асистент съдия 1': 'АС1', 'асистент съдия 2': 'АС2', 'четвърти съдия': '4-ТИ', 'вар': 'ВАР', 'авар': 'АВАР',
  'делегат': 'ДЕЛЕГАТ', 'съдийски наблюдател': 'СН', 'наблюдател': 'СН', 'делегат/наблюдател': 'ДН',
};
// "БФС Делегат/Наблюдател" (the Third League's one person for both) → 'делегат/наблюдател'
const roleKey = s => s.toLowerCase().replace(/^бфс\s+/, '').replace(/\s*[\/-]\s*/g, '/').replace(/\s+/g, ' ').trim();
// a name written in capitals ("ДАНИЕЛ АЛЕКСАНДРЕ МОРАЛЕС") in the usual case ("Даниел Александре Моралес")
export const nameCase = s => /[a-zа-я]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, p, ch) => p + ch.toUpperCase());

// the page without comments, scripts and styles, with only the attributes that say what a thing is, on one line
export function compact(html){
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>/g, (m, tag, attrs, sl) =>
      '<' + tag + (attrs.match(/\s(?:class|id|name|value|src|colspan|rowspan|onclick)="[^"]*"/g) || []).join('') + sl + '>')
    .replace(/\s+/g, ' ').replace(/> </g, '><');
}
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" };
export const text = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? (e[0] === '#' ? String.fromCharCode(Number(e.slice(1)) || 32) : m))
  .replace(/\s+/g, ' ').trim();
const town = s => text(s).replace(/^(?:гр|с|к-с)\.\s*/i, '').trim();

// a day's matches: [{ id, label, league, time: 'HH:MM', home, homeTown, away, awayTown, venue }] (league: ours, or null)
export function parseList(html){
  const c = compact(html), out = [];
  const re = /<div class="teamName">([^<]*)<\/div><div class="teamCity">([^<]*)<\/td><td><div class="teamCity">([^<]*)<\/div><div class="teamName">([^<]*)<\/div><\/td><td><div class="teamName">([^<]*)<\/div><div class="teamCity">([^<]*)<\/td>([\s\S]*?)name="showMatchBtn" value="([0-9a-fA-F]+)"/g;
  for (const m of c.matchAll(re)) {
    const label = text(m[3]), venue = (m[7].match(/colspan="3" class="teamCity">([^<]*)</) || [])[1];
    out.push({ id: m[8], label, league: LEAGUES[label] || null, time: text(m[4]), home: text(m[1]), homeTown: town(m[2]),
      away: text(m[5]), awayTown: town(m[6]), venue: text(venue || '') });
  }
  return out;
}

// a player row's text: "Иван Георгиев Андонов - ВРАТАР", "Анатолий Енчев Господинов - КАПИТАН - ВРАТАР"
export function player(n, s){
  const parts = text(s).split(/\s+-\s+/), flags = parts.slice(1).join(' ').toUpperCase();
  const p = { n: text(n) || null, name: nameCase(parts[0]) };
  if (/ВРАТАР/.test(flags)) p.gk = true;
  if (/КАПИТАН/.test(flags)) p.cap = true;
  return p;
}
// "Никола Антонов Попов - гр.София" → { n: 'Никола Антонов Попов', town: 'София' }
function person(s){
  const t = text(s), m = t.match(/^(.*?)\s+-\s+((?:гр|с)\..*)$/i);
  return m ? { n: nameCase(m[1].trim()), town: town(m[2]) } : { n: nameCase(t) };
}

// the match sheet: { home, away, stadium, competition, officials: [{ r, role, n, town }],
//   teams: [{ name, coach, xi: [{ n, name, gk?, cap? }], subs: [...] }] } — teams empty until the clubs fill them in.
// Two layouts: the plain one (white headers: the competition, each team, "Резерви"), and a newer one some clubs use
// (Лудогорец's and Левски's home matches): the elevens side by side, a tactics picture, the substitutes side by side,
// then "ГЛАВЕН ТРЕНЬОР:" and the referees in capitals, the captain and the goalkeeper marked C and GK.
export function parseSheet(html){
  const c = compact(html);
  if (/<tr class="teamPlayer">/.test(c)) return parseSheetB(c);
  const heads = [...c.matchAll(/<span class="robotoBlackB24">([^<]*)<\/span><br><span class="robotoBlackB20">([^<]*)<\/span>/g)].map(m => ({ name: text(m[1]), town: town(m[2]) }));
  const stadium = text((c.match(/Стадион:\s*<span[^>]*>([^<]*)</) || [])[1] || '');
  const competition = text((c.match(/ПЪРВЕНСТВО:\s*<\/span>([^<]*)</) || [])[1] || '');
  const officials = [];
  for (const m of c.matchAll(/<tr><td class="robotoBlack20"><span>([^<]*)<\/span><\/td><td class="robotoBlackB20"><span>([^<]*)<\/span><\/td><\/tr>/g)) {
    const role = text(m[1]), p = person(m[2]);
    if (!p.n) continue;
    officials.push({ r: ROLES[roleKey(role)] || role, role, n: p.n, ...(p.town ? { town: p.town } : {}) });
  }
  // the white headers split the rest: the competition, then each team's name, its substitutes ("Резерви"), the next team…
  const parts = c.split(/<td colspan="2" class="robotoWhiteB20">/).slice(1);
  const teams = [];
  let cur = null;
  for (const part of parts) {
    const head = text(part.slice(0, part.indexOf('</td>')));
    if (/ПЪРВЕНСТВО/i.test(head)) continue;
    const rows = [...part.matchAll(/<tr class="robotoBlackB20"><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map(m => player(m[1], m[2])).filter(p => p.name);
    if (/^Резерви$/i.test(head)) { if (cur) cur.subs.push(...rows); }
    else { cur = { name: head, coach: null, xi: rows, subs: [] }; teams.push(cur); }
    const coach = part.match(/Главен [Тт]реньор:\s*<\/span><span class="robotoBlackB20">([^<]*)</);
    if (coach && cur) cur.coach = nameCase(text(coach[1])) || null;
  }
  return { home: heads[0] || null, away: heads[1] || null, stadium, competition, officials, teams };
}

// "ГЛАВЕН СЪДИЯ" → "Главен съдия"
const sentence = s => { s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
function parseSheetB(c){
  const heads = [...c.matchAll(/<span class="robotoBlackB24">([^<]*)<\/span><br><span class="robotoBlackB20">([^<]*)<\/span>/g)].map(m => ({ name: text(m[1]), town: town(m[2]) }));
  const liga = c.match(/class="liga">[\s\S]*?<br>([^<]*)<br><span class="liga400">([^<]*)<\/span>/) || [];
  // the tables of players, in order: the home eleven, the away eleven, the home substitutes, the away substitutes
  const tables = [...c.matchAll(/<table><tbody>((?:(?!<table>)[\s\S])*?)<\/tbody><\/table>/g)].map(m => m[1]).filter(t => /<tr class="teamPlayer">/.test(t))
    .map(t => [...t.matchAll(/<tr class="teamPlayer"><td><span>([^<]*)<\/span><\/td><td>([\s\S]*?)<\/td><\/tr>/g)].map(m => {
      const flags = [...m[2].matchAll(/<span class="teamFunc">([^<]*)<\/span>/g)].map(f => f[1].trim().toUpperCase());
      const p = { n: text(m[1]) || null, name: nameCase(text(m[2].replace(/<span class="teamFunc">[^<]*<\/span>/g, ''))) };
      if (flags.includes('GK')) p.gk = true;
      if (flags.includes('C')) p.cap = true;
      return p;
    }).filter(p => p.name));
  const coaches = [...c.matchAll(/class="bfuOfficial">\s*ГЛАВЕН ТРЕНЬОР:\s*<br><span class="teamPlayer">([^<]*)</g)].map(m => nameCase(text(m[1])) || null);
  const officials = [];
  for (const m of c.matchAll(/<td class="bfuOfficial">([^<:]+):\s*<br><span class="teamPlayer">([\s\S]*?)<\/span><\/td>/g)) {
    const role = text(m[1]);
    if (/ТРЕНЬОР/i.test(role)) continue;
    const people = m[2].split(/<br\s*\/?>/).map(person).filter(p => p.n);
    people.forEach((p, i) => {
      const many = /^асистент съдии$/i.test(role), key = many ? `асистент съдия ${i + 1}` : roleKey(role);
      officials.push({ r: ROLES[key] || role, role: many ? `Асистент съдия ${i + 1}` : sentence(role), n: p.n, ...(p.town ? { town: p.town } : {}) });
    });
  }
  const teams = tables.length >= 2 ? [0, 1].map(i => ({ name: (heads[i] || {}).name || '', coach: coaches[i] || null, xi: tables[i] || [], subs: tables[i + 2] || [] })) : [];
  return { home: heads[0] || null, away: heads[1] || null, stadium: text(liga[2] || ''), competition: text(liga[1] || ''), officials, teams };
}
// nothing on the page that a sheet has: not a sheet this reader knows (saved as an error, not as an empty sheet)
export const readable = s => !!(s && (s.home || s.officials.length || s.teams.length));

/* ───────────── pairing ebfu's matches with ours ───────────── */
// what tells clubs apart: their names without "ПФК", "Футболен клуб", "Сдружение", "АД"…, and their towns
const GENERIC = new Set(('пфк фк офк сфк пфc обфк футболен футболна клуб професионален професионален сдружение общински обединен ' +
  'ад еад оод ооод спортен спортна асоциация гр град тийм').split(' '));
const LATIN = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
export function tokens(...names){
  const s = names.join(' ').toLowerCase()
    .replace(/\|\|\|/g, ' iii ').replace(/\|\|/g, ' ii ')                              // "ПФК Славия ||"
    .replace(/\S+/g, w => /[а-яё]/.test(w) ? w.replace(/[a-z]/g, ch => LATIN[ch] || ch) : w)   // "Kюстендил", with a Latin K
    .replace(/[^0-9a-zа-яёѝ]+/g, ' ');
  return s.split(' ').filter(t => t && !GENERIC.has(t) && (t.length >= 3 || /^i{2,3}$/.test(t) || /^\d{4}$/.test(t)));
}
const reserve = ts => ts.find(t => /^i{2,3}$/.test(t)) || '';
function near(a, b){
  if (a === b) return 3;
  if (/^\d/.test(a) || /^\d/.test(b)) return 0;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && l.startsWith(s)) return 2;                       // "спортист" / "спортисти", "сф" too short
  if (s.length >= 5 && l.length - s.length <= 1) {                      // one letter different: "тийм" / "тиим" is generic anyway
    let i = 0, j = 0, d = 0;
    while (i < s.length && j < l.length && d <= 1) { if (s[i] === l[j]) { i++; j++; } else { d++; if (s.length === l.length) i++; j++; } }
    if (d + (s.length - i) + (l.length - j) <= 1) return 2;
  }
  return 0;
}
// how well one of our team names fits one of ebfu's: shared words count, a reserve team only fits a reserve team
// the initials of a name's words: "ФК Централен Спортен Клуб на Армията 1948" → "фцска" (ЦСКА written out)
const initials = s => String(s).toLowerCase().split(/[^a-zа-яё]+/).filter(w => w && !/^(на|и|за|от|в)$/.test(w)).map(w => w[0]).join('');
export function teamScore(ours, theirs){
  const a = tokens(ours), b = tokens(...[].concat(theirs)), ini = initials([].concat(theirs)[0] || '');
  if (reserve(a) !== reserve(b)) return -10;
  let score = 0;
  for (const t of a) {
    if (/^i{2,3}$/.test(t)) continue;
    let best = 0;
    for (const u of b) best = Math.max(best, /^\d{4}$/.test(t) ? (t === u ? 1 : 0) : near(t, u));
    if (!best && /^[а-я]{3,4}$/.test(t) && ini.includes(t)) best = 3;        // an abbreviation of the written-out name
    score += best;
  }
  // both give a year, different ones: another club ("Славия 1913" is not a "… 1924")
  const ya = a.filter(t => /^\d{4}$/.test(t)), yb = b.filter(t => /^\d{4}$/.test(t));
  if (ya.length && yb.length && !ya.some(y => yb.includes(y))) score -= 2;
  return score;
}
// our matches of one day ([{ id, league, kickoff, home_name, away_name }]) with ebfu's list of that day:
// Map(our id → ebfu match). Same league; both teams must fit; the best fits first, each ebfu match used once.
export function pair(ours, theirs, tz = 'Europe/Sofia'){
  const hm = iso => new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const cand = [];
  for (const m of ours) for (const e of theirs) {
    if (e.league !== m.league) continue;
    const h = teamScore(m.home_name, [e.home, e.homeTown]), a = teamScore(m.away_name, [e.away, e.awayTown]);
    if (h < 2 || a < 2) continue;
    const t = m.kickoff ? hm(m.kickoff) : '', dt = t && e.time ? Math.abs(mins(t) - mins(e.time)) : 0;
    cand.push({ m, e, s: h + a - (dt > 120 ? 2 : 0) - dt / 1000 });
  }
  cand.sort((x, y) => y.s - x.s);
  const out = new Map(), used = new Set();
  for (const c of cand) if (!out.has(c.m.id) && !used.has(c.e.id)) { out.set(c.m.id, c.e); used.add(c.e.id); }
  return out;
}
const mins = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

// a sheet is complete when both teams have their eleven
export const complete = s => !!(s && s.teams && s.teams.length >= 2 && s.teams.every(t => t.xi.length >= 11));
