// Every match of the Bulgarian leagues searched on its own: "<home> <away>" on Google News around its kickoff.
// The refereeing searches (news.js) only keep headlines about refereeing, so a match's own coverage — the report, the
// preview, the coaches after the match — was never found ("Рилски спортист надигра Хебър, но взе само точка с късен
// гол", Sportal; "Рилски спортист и Хебър не успяха да се победят в Самоков", Gong). These searches find it:
//  · an article about refereeing is saved as before (kind 'ref', it shows in the news feed), now linked to its match;
//  · any other article that is about the match is saved as the match's coverage (kind 'match'), shown only under the
//    match on Results — never in the refereeing feed.
// An article is about a match when its headline names both teams, or one of them (and no other club) within a few days
// of the match and this is that team's nearest match, or names no club but the venue ("след равния в Самоков").
// Plain JS so it runs in the Supabase Edge Function and can be tested with Node (matches.test.mjs).
import * as N from './news.js';

export const MATCH_LEAGUES = ['efbet', 'mrbit', 'sw3'];
export const LEAGUE_DIV = { efbet: 'd1', mrbit: 'd2', sw3: 'd3' };
// the European cups count when a club's nearest match is worked out ("Левски" two days after a Europa League game)
const EURO_LEAGUES = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];
export const ALL_LEAGUES = [...MATCH_LEAGUES, ...EURO_LEAGUES];
// each played match is searched this many hours after its kickoff: the report and first reactions, the next day, the
// rulings two days on, and once more after five days (a match never searched yet is searched once, with the whole window)
export const SEARCH_AT_H = [3, 20, 48, 120];
const H = 3600e3, DAY = 864e5;
// the articles a search looks at: from three days before the kickoff (previews, appointments) to a week after
export const WINDOW = [-3 * DAY, 7 * DAY];

// the leagues' team names (efbetleague.com, mr-bit.bg, bulgarian-football.com, ESPN) → news.js CLUBS
const TEAM_KEY = {
  'Арда Кърджали': 'arda', 'Ботев Враца': 'botvr', 'Ботев Пловдив': 'botpd', 'Дунав Русе': 'dunav', 'Левски София': 'levski',
  'Локомотив Пловдив': 'lokpd', 'Лудогорец': 'ludo', 'Локомотив София 1929': 'loksf', 'Локомотив София': 'loksf', 'Септември София': 'septemvri',
  'Славия София': 'slavia', 'Спартак Варна': 'spartakvn', 'ЦСКА 1948': 'cska48', 'ЦСКА София': 'cska', 'Черно море Варна': 'chm', 'Черно море': 'chm',
  'Берое': 'beroe', 'Вихрен': 'vihren', 'Добруджа': 'dobrudzha', 'Етър Велико Търново': 'etar', 'Етър': 'etar', 'Локомотив Г. Оряховица': 'lokgo',
  'Лудогорец II': 'ludo2', 'Марек': 'marek', 'Монтана': 'montana', 'Несебър': 'nesebar', 'Пирин Благоевград': 'pirin', 'Пирин': 'pirin',
  'Рилски Спортист': 'rilski', 'Спартак Плевен': 'spartakpl', 'Спортист Своге': 'sportist', 'Фратрия': 'fratria', 'Хебър 1918': 'hebar', 'Хебър': 'hebar',
  'ЦСКА София II': 'cska2', 'ЦСКА II': 'cska2', 'Черноморец 1919 Бургас': 'chernomorets', 'Черноморец': 'chernomorets', 'Янтра 2019': 'yantra', 'Янтра': 'yantra',
  'Беласица': 'belasitsa', 'Миньор': 'minyor', 'Струмска слава 1927': 'strumska', 'Сливнишки герой': 'slivnishki',
  'Пирин 1941 (Разлог)': 'pirinrz', 'Септември (Симитли)': 'septsim', 'Ботев 1937 (Ихтиман)': 'botih', 'Балкан 1929 (Ботевград)': 'balkan',
  'Банско тийм (Банско)': 'bansko', 'Етрополе (Етрополе)': 'etropole', 'Кюстендил (Кюстендил)': 'kyustendil',
  'ОФК Костинброд 2012 (Костинброд)': 'kostinbrod', 'Оборище (Панагюрище)': 'oborishte',
  'Levski Sofia': 'levski', 'CSKA Sofia': 'cska', 'Ludogorets Razgrad': 'ludo', 'Ludogorets': 'ludo', 'CSKA 1948 Sofia': 'cska48', 'CSKA 1948': 'cska48',
  'Lokomotiv Plovdiv': 'lokpd', 'Cherno More Varna': 'chm', 'Arda Kardzhali': 'arda', 'Botev Plovdiv': 'botpd', 'Slavia Sofia': 'slavia',
};
// how the search names a club (Google News): the word the media use, or the full name where one word says too little
const SEARCH_AS = { chm: '"Черно море"', rilski: '"Рилски спортист"', strumska: '"Струмска слава"', slivnishki: '"Сливнишки герой"',
  cska48: '"ЦСКА 1948"', lokpd: '(Локомотив OR Локо)', loksf: '(Локомотив OR Локо)', lokgo: '(Локомотив OR Локо)' };

const CS = p => new RegExp('(?<![\\p{L}\\p{N}])(?:' + p + ')(?![\\p{L}])', 'u');
const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blank = s => ' '.repeat(s.length);
export const teamName = n => String(n || '').replace(/^(?:ПФК|ФК)\s+/, '').replace(/\s+\([^)]*\)\s*$/, '').trim();
const CLUB = Object.fromEntries(N.CLUBS.map(c => [c.k, c]));
// "Ботев – Дунав": a club's first word alone, loosely (as the page does). Not when that word is itself a club ("ЦСКА")
const looseWord = c => { const w = c.label.split(' ')[0];
  return c.label.includes(' ') && !N.CLUBS.some(o => o.re.test(w)) ? CS(w === 'Локомотив' ? 'Локо(?:мотив)?' : w) : null; };

// one team of a match: its club key, how a headline names it (strict, loose), how it is searched, its town
export function team(name){
  const k = TEAM_KEY[name] || TEAM_KEY[teamName(name)];
  if (k && CLUB[k]) {
    const c = CLUB[k];
    return { k, club: true, re: c.re, loose: looseWord(c), q: SEARCH_AS[k] || c.label.split(' ')[0],
      town: String(N.OWN_TOWN[k] || '').split('|')[0].replace(/\\/g, ''), reserve: /2$/.test(k) };
  }
  // a team the club list doesn't have (the Third League's reserve teams, "Национал (София)"): by its own name
  const town = (String(name).match(/\(([^)]+)\)\s*$/) || [])[1] || '';
  const n = teamName(name), r = n.match(/^(.*?)\s+(II|III)$/);
  if (!n || /^[A-Za-z]/.test(n)) return null;                        // a foreign club (ESPN's names)
  const base = (r ? r[1] : n).replace(/\s+\d{4}$/, '');
  const pat = escRx(base) + '(?:\\s*\\d{4})?' + (r ? `\\s*(?:${r[2]}|${r[2] === 'II' ? 2 : 3})(?![\\p{L}\\p{N}])` : '');
  return { k: 'x:' + n, club: false, re: CS(pat), loose: null, q: `"${base}"`, town, reserve: !!r };
}

// everything a run needs about the season's matches: each match's two teams, every team's matches, the towns
export function context(rows){
  const teams = new Map(), byTeam = new Map(), towns = new Map();
  const tm = n => { if (!teams.has(n)) teams.set(n, team(n)); return teams.get(n); };
  const matches = [];
  for (const r of rows) {
    if (!r.kickoff || !ALL_LEAGUES.includes(r.league)) continue;
    const m = { ...r, id: String(r.id), _t: Date.parse(r.kickoff), _h: tm(r.home_name), _a: tm(r.away_name) };
    if (!isFinite(m._t)) continue;
    matches.push(m);
    for (const t of [m._h, m._a]) if (t) { if (!byTeam.has(t.k)) byTeam.set(t.k, []); byTeam.get(t.k).push(m); }
  }
  matches.sort((a, b) => a._t - b._t);
  // a town says which match only when one team of the leagues plays there ("в Самоков"; not "в София")
  for (const t of new Map([...teams.values()].filter(Boolean).map(t => [t.k, t])).values()) if (t.town) towns.set(t.town, (towns.get(t.town) || 0) + 1);
  for (const m of matches) {
    const T = m._h && m._h.town;
    m._venue = T && towns.get(T) === 1 ? new RegExp(`(?<![\\p{L}])(?:в|във|от|край)\\s+${escRx(T)}(?![\\p{L}])`, 'u') : null;
  }
  const nearest = (k, t) => { let best = null, d = Infinity;
    for (const m of byTeam.get(k) || []) { const x = Math.abs(t - m._t); if (x < d) { d = x; best = m; } }
    return best; };
  return { matches, byTeam, nearest };
}

// the Google News search for one match
export const searchQuery = m => `${m._h.q} ${m._a.q}`;
export const searchUrl = m => N.googleUrl(searchQuery(m), m._t + WINDOW[0], m._t + WINDOW[1]);

// the played matches due for a search, newest first (seen: match id → when it was last searched)
export function due(ctx, seen, now = Date.now()){
  const out = [];
  for (const m of ctx.matches) {
    if (!MATCH_LEAGUES.includes(m.league) || !m._h || !m._a || !/^(?:finished|live)$/.test(m.status || '')) continue;
    let at = -1;
    for (const h of SEARCH_AT_H) if (m._t + h * H <= now) at = m._t + h * H;
    if (at >= 0 && (Number(seen[m.id]) || 0) < at) out.push(m);
  }
  return out.sort((a, b) => b._t - a._t);
}

// a club's youth or reserve teams are not its first team ("ЦСКА U17 – Левски U17", "юношите на…", "дублиращите отбори")
const RX_YOUTH = /(?<![\p{L}\p{N}])(?:[UУ]\s?-?(?:1[0-9]|2[0-3])(?![\p{N}])|до\s?(?:1[0-9]|2[0-3])\s?(?:г\.|год\p{L}*)|юнош\p{L}*|девойк\p{L}*|детск\p{L}*|подрастващ\p{L}*|(?:младша|старша) възраст|младежк\p{L}*\s+(?:лига|отбор|национал\p{L}*|първенство|шампионат))/iu;
const RX_RESERVES = /(?<![\p{L}])дублиращ\p{L}*/iu;
const RX_WOMEN = /(?<![\p{L}])(?:жени(?:те)?|дами(?:те)?|женск\p{L}*)(?![\p{L}])/iu;

// which match a headline is about (published at t), or null. Scores: both teams named 10+, one team 5+, the venue 3;
// two matches with the same score: neither
export function whichMatch(title, t, ctx){
  title = String(title || '');
  if (RX_YOUTH.test(title) || N.RX.cup.test(title) || RX_WOMEN.test(title)) return null;
  const txt = N.teamText(title), strict = new Set(N.clubsIn(title));
  // the loose names are looked for where no club is named in full ("Локомотив София" is not also a loose "Локо")
  let unnamed = txt;
  for (const c of N.CLUBS) unnamed = unnamed.replace(new RegExp(c.re.source, 'gu'), blank);
  const has = T => !T ? 0 : (T.club ? strict.has(T.k) : T.re.test(txt)) ? 2 : T.loose && T.loose.test(unnamed) ? 1 : 0;
  let best = null, top = 0, tie = false;
  for (const m of ctx.matches) {
    const dt = t - m._t;
    if (dt > 6 * DAY) continue;
    if (dt < -3 * DAY) break;
    if (!MATCH_LEAGUES.includes(m.league) || !m._h || !m._a) continue;
    const sh = has(m._h), sa = has(m._a);
    // any other club named: another match, or a round-up of the round
    let rest = txt;
    for (const [T, s] of [[m._h, sh], [m._a, sa]]) if (s) rest = rest.replace(new RegExp((s === 2 ? T.re : T.loose).source, 'gu'), blank);
    if (N.clubsIn(rest).length) continue;
    // ("Левски II" is not Левски: clubsIn leaves out a club named only as its reserve team)
    let score = 0;
    if (sh && sa) score = 10 + sh + sa;
    else if (sh || sa) {
      const T = sh ? m._h : m._a;
      if (dt >= -2 * DAY && dt <= 3 * DAY && ctx.nearest(T.k, t) === m) score = 5 + (sh || sa);
    } else if (m._venue && dt >= -H && dt <= 3 * DAY && m._venue.test(title)) score = 3;
    if (!score) continue;
    if (score > top) { best = m; top = score; tie = false; }
    else if (score === top && best !== m) tie = true;
  }
  return tie ? null : best;
}

// outlets that are not news about the match: aggregators, social media, betting sites; and headlines that are betting
// tips or TV listings
const LOW_SRC = /facebook|instagram|tiktok|youtube|vbox7|novini247|topnovini|unknown|букмейкър|bookmaker|betting|bet365|winbet|залози|прогнози/i;
const RX_NOT_NEWS = /прогноз\p{L}*|залог\p{L}*|залагани\p{L}*|коефициент\p{L}*|букмейк\p{L}*|бонус\p{L}*|(?:къде|как) да гледам\p{L}*|по коя телевизия|тв програма|телевизионн\p{L}* програма|стрийм\p{L}*|излъчване на живо/iu;

// one search result → a row for news_articles (or null). m: the match that was searched
export function toRow(raw, m, ctx, now = Date.now()){
  const q = { q: '', ctx: 'bg', div: LEAGUE_DIV[m.league] || null };
  let title = String(raw.title || '').replace(/\s+/g, ' ').trim(), src = String(raw.source || '').trim();
  const i = title.lastIndexOf(' - ');
  if (i > 15) { if (!src) src = title.slice(i + 3).trim(); title = title.slice(0, i).trim(); }
  if (!title) return null;
  let d = raw.date instanceof Date ? raw.date.getTime() : NaN;
  if (!isFinite(d) || d > now + DAY) d = now;
  const match = whichMatch(title, d, ctx);
  // about refereeing: an ordinary news article (the feed), now knowing its match
  const ref = N.toArticle(raw, 'google', q, now);
  if (ref) return { ...ref, kind: 'ref', match_id: match ? match.id : null };
  if (!match) return null;
  if (d < Date.parse(N.SEASON_START + 'T00:00:00Z') || N.notBulgarian(title, src, raw.link)) return null;
  if (LOW_SRC.test(src) || LOW_SRC.test(raw.srcUrl || '') || RX_NOT_NEWS.test(title) || N.RX.otherSport.test(title)) return null;
  if (RX_RESERVES.test(title) && !match._h.reserve && !match._a.reserve) return null;
  let desc = String(raw.desc || '').trim();
  const bare = src && desc.endsWith(src) ? desc.slice(0, -src.length).trim() : desc;
  if (desc && (N.norm(bare).startsWith(N.norm(title).slice(0, 40)) || N.norm(title).startsWith(N.norm(bare)))) desc = '';
  if (desc.length > 300) desc = desc.slice(0, 297) + '…';
  const base = N.norm(title).slice(0, 90);
  if (base.length < 8) return null;
  return { aid: base + '|' + N.norm(src || 'unknown').slice(0, 30), title, link: raw.link || '', descr: desc, src,
    published_at: new Date(d).toISOString(), scope: 'bg', divs: [LEAGUE_DIV[match.league]], comps: [], cats: ['match'], score: 1, hinted: false,
    clubs: [match._h, match._a].filter(T => T.club).map(T => T.k), vh: N.RX.video.test(title), lang: 'bg', kind: 'match', match_id: match.id };
}
