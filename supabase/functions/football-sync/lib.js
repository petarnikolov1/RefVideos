// Parsing and video matching for the football-sync Edge Function (plain JS so it can be tested with Node).

export const SEASON = '2026/27';
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/* ───────────── helpers ───────────── */
const num = v => (v === '' || v == null || v === '$undefined' || Number.isNaN(Number(v))) ? null : Number(v);
const stripTags = s => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Bulgarian local time → UTC ISO (EEST +3 from the last Sunday of March to the last Sunday of October, else EET +2)
export function sofiaToUtc(y, mo, d, h, mi) {
  const lastSun = (yy, m) => { const dt = new Date(Date.UTC(yy, m + 1, 0)); return dt.getUTCDate() - dt.getUTCDay(); };
  const t = Date.UTC(y, mo - 1, d, h, mi);
  const start = Date.UTC(y, 2, lastSun(y, 2), 1, 0), end = Date.UTC(y, 9, lastSun(y, 9), 1, 0);   // switch moments in UTC
  const off = (t - 3 * 3600e3 >= start && t - 3 * 3600e3 < end) ? 3 : 2;
  return new Date(t - off * 3600e3).toISOString();
}
// "28/07 18:30" in season 2026/27 → UTC ISO (July–December = 2026, January–June = 2027)
export function seasonDate(text) {
  const m = String(text).match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mo = Number(m[2]);
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : (mo >= 7 ? 2026 : 2027);
  return sofiaToUtc(y, mo, Number(m[1]), Number(m[4]), Number(m[5]));
}

/* ───────────── efbetleague.com (Next.js page; data travels in self.__next_f.push chunks) ───────────── */
export function decodeRsc(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) { try { out += JSON.parse(m[1]); } catch { /* skip */ } }
  return out;
}
// the JSON value after "key": (array or object), found with bracket counting that respects strings
export function jsonAfter(text, key, from = 0) {
  const i = text.indexOf(`"${key}":`, from);
  if (i < 0) return null;
  let j = i + key.length + 3;
  while (text[j] === ' ') j++;
  const open = text[j], close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return { value: undefined, end: j };          // not a list/object here: the caller can look further
  let depth = 0, inStr = false;
  for (let k = j; k < text.length; k++) {
    const c = text[k];
    if (inStr) { if (c === '\\') k++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) { try { return { value: JSON.parse(text.slice(j, k + 1)), end: k + 1 }; } catch { return { value: undefined, end: k + 1 }; } }
  }
  return null;
}
const efbetStatus = t => { t = String(t || '').toUpperCase(); return t === 'FINISHED' ? 'finished' : /LIVE|PROGRESS|HALF|PERIOD/.test(t) ? 'live' : /POSTPON|CANCEL|ABANDON|SUSPEND|INTERRUPT/.test(t) ? 'postponed' : 'scheduled'; };
const assetLogo = c => (c && c.assets && c.assets.logo && c.assets.logo !== '$undefined') ? c.assets.logo : (c && c.logo && c.logo !== '$undefined' ? c.logo : null);

export function parseEfbetMatches(html) {
  const rsc = decodeRsc(html);
  let rounds = null, from = 0;
  for (let tries = 0; tries < 10 && !rounds; tries++) {   // the first "rounds" list that actually holds matches
    const hit = jsonAfter(rsc, 'rounds', from);
    if (!hit) break;
    if (Array.isArray(hit.value) && hit.value.some(r => r && Array.isArray(r.matches) && r.matches.length)) rounds = hit.value;
    from = hit.end;
  }
  const out = [];
  for (const r of rounds || []) for (const m of r.matches || []) {
    if (!m || !m.competitorOne || !m.competitorTwo) continue;
    const status = efbetStatus(m.status && m.status.type);
    const played = status === 'finished' || status === 'live';
    const sc = m.score || {}, ht = (sc.breakdown && sc.breakdown.halfTime) || {};
    const fid = String(m.id || m.fansUnitedMatchId);
    out.push({
      id: 'efbet:' + fid.replace(/:/g, '-'), league: 'efbet', season: SEASON,
      round: num(m.round && m.round.name) ?? num(r.name),
      kickoff: String((m.timing && m.timing.kickoffTime) || '').replace(/^\$D/, '') || null,
      status,
      home_name: m.competitorOne.name, away_name: m.competitorTwo.name,
      home_logo: assetLogo(m.competitorOne), away_logo: assetLogo(m.competitorTwo),
      home_score: played ? num(sc.competitorOne) : null, away_score: played ? num(sc.competitorTwo) : null,
      ht_home: played ? num(ht.competitorOne) : null, ht_away: played ? num(ht.competitorTwo) : null,
      source_url: 'https://efbetleague.com/match/' + fid.replace(/:/g, '-'),
    });
  }
  return out;
}

export function parseEfbetStandings(html) {
  const rsc = decodeRsc(html);
  let stages = [], from = 0;
  for (let tries = 0; tries < 10 && !stages.length; tries++) {
    const hit = jsonAfter(rsc, 'allStageStandings', from);
    if (!hit) break;
    if (Array.isArray(hit.value)) stages = hit.value;
    from = hit.end;
  }
  const st = stages.find(s => s && s.standings && Array.isArray(s.standings.entries) && s.standings.entries.length);
  if (!st) return [];
  return st.standings.entries.map(e => {
    const s = e.stats || {};
    const form = ((e.form && e.form.results) || []).map(x => String(x.result || '').charAt(0).toUpperCase()).filter(x => /[WDL]/.test(x)).reverse().join('');   // oldest → newest
    return { rank: num(e.rank), team_name: e.competitor && e.competitor.name, logo: assetLogo(e.competitor),
      played: num(s.played), won: num(s.won), drawn: num(s.drawn), lost: num(s.lost),
      goals_for: num(s.goalsFor), goals_against: num(s.goalsAgainst), points: num(s.points), form };
  }).filter(r => r.team_name);
}

/* ───────────── mr-bit.bg/vtora-liga (plain HTML) ───────────── */
const MRBIT = 'https://mr-bit.bg';
const logoUrl = src => src ? new URL(src, MRBIT).toString() : null;
const slugOf = (src, name) => ((String(src || '').match(/\/ids\/([\w-]+)\.\w+$/) || [])[1]) || normName(name).replace(/\s+/g, '-');

export function parseMrbit(html) {
  const games = new Map();   // round|home|away → match
  const keyOf = (round, hs, as) => `${round}|${hs}|${as}`;
  const put = (round, hName, hSrc, aName, aSrc, patch) => {
    const hs = slugOf(hSrc, hName), as = slugOf(aSrc, aName), k = keyOf(round, hs, as);
    const g = games.get(k) || { id: `mrbit:2026-27:${round}:${hs}:${as}`, league: 'mrbit', season: SEASON, round,
      kickoff: null, status: 'scheduled', home_name: hName.trim(), away_name: aName.trim(), home_logo: logoUrl(hSrc), away_logo: logoUrl(aSrc),
      home_score: null, away_score: null, ht_home: null, ht_away: null, source_url: 'https://mr-bit.bg/vtora-liga/' };
    for (const [key, v] of Object.entries(patch)) if (v != null) g[key] = v;
    games.set(k, g);
  };
  // position → round, for a list of markers
  const roundAt = (markers, pos) => { let r = null; for (const m of markers) { if (m.pos <= pos) r = m.round; else break; } return r; };

  // 1. played rounds: <div class="swiper-slide" data-round-label="Кръг - 2"> … result-match-row …
  const labels = [...html.matchAll(/data-round-label="[^"]*?(\d+)"/g)].map(m => ({ pos: m.index, round: Number(m[1]) }));
  const ROW = /<a class="result-match-row"[\s\S]*?result-match-date">([\s\S]*?)<\/span>[\s\S]*?result-team-home">\s*<img[^>]*?data-src="([^"]*)"[\s\S]*?result-team-name">([^<]*)<\/span>\s*<span class="result-team-score">([^<]*)<\/span>[\s\S]*?result-team-away">\s*<img[^>]*?data-src="([^"]*)"[\s\S]*?result-team-name">([^<]*)<\/span>\s*<span class="result-team-score">([^<]*)<\/span>/g;
  for (const m of html.matchAll(ROW)) {
    const round = roundAt(labels, m.index);
    if (!round) continue;
    const hs = num(stripTags(m[4])), as = num(stripTags(m[7]));
    put(round, m[3], m[2], m[6], m[5], { kickoff: seasonDate(stripTags(m[1])), home_score: hs, away_score: as, status: hs != null && as != null ? 'finished' : null });
  }
  // 2. season schedule: <section class="fixtures-slide" data-fixtures-slide="0"> (0 = round 1) … fixture-match …
  const slides = [...html.matchAll(/data-fixtures-slide="(\d+)"/g)].map(m => ({ pos: m.index, round: Number(m[1]) + 1 }));
  const FIX = /<a class="fixture-match"[\s\S]*?fixture-home">\s*<img[^>]*?data-src="([^"]*)"[\s\S]*?<span>([^<]*)<\/span>[\s\S]*?fixture-score">([\s\S]*?)<\/div>[\s\S]*?fixture-away">\s*<img[^>]*?data-src="([^"]*)"[\s\S]*?<span>([^<]*)<\/span>/g;
  for (const m of html.matchAll(FIX)) {
    const round = roundAt(slides, m.index);
    if (!round) continue;
    const cell = stripTags(m[3]);
    const sc = cell.match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
    put(round, m[2], m[1], m[5], m[4], sc ? { home_score: Number(sc[1]), away_score: Number(sc[2]), status: 'finished' } : { kickoff: seasonDate(cell) });
  }
  // 3. upcoming match cards: <div class="match-round">Кръг - 15</div><div class="match-date">… 08/11 14:30</div> … two teams
  const CARD = /<a class="match-card"[\s\S]*?match-round">[^<]*?(\d+)<\/div>\s*<div class="match-date">([\s\S]*?)<\/div>[\s\S]*?<img[^>]*?data-src="([^"]*)"[^>]*>([^<]*)<\/div>\s*<div>\s*<img[^>]*?data-src="([^"]*)"[^>]*>([^<]*)<\/div>/g;
  for (const m of html.matchAll(CARD)) put(Number(m[1]), m[4], m[3], m[6], m[5], { kickoff: seasonDate(stripTags(m[2])) });
  return [...games.values()].filter(g => g.home_name && g.away_name);
}

export function parseMrbitStandings(html, matches) {
  const rows = [];
  const ROW = /<tr>\s*<td class="pos">(\d+)<\/td>\s*<td class="team">[\s\S]*?<img[^>]*?data-src="([^"]*)"[\s\S]*?<span>([^<]*)<\/span>[\s\S]*?<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td class="form">[\s\S]*?<\/td>\s*<td class="pts">(\d+)<\/td>/g;
  for (const m of html.matchAll(ROW)) rows.push({ rank: Number(m[1]), logo: logoUrl(m[2]), team_name: m[3].trim(), played: Number(m[4]), won: Number(m[5]), drawn: Number(m[6]), lost: Number(m[7]), points: Number(m[8]) });
  // goals and form from the results (the sponsor's table has neither)
  const done = (matches || []).filter(g => g.status === 'finished').sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
  for (const r of rows) {
    let gf = 0, ga = 0; const form = [];
    for (const g of done) {
      if (g.home_name === r.team_name) { gf += g.home_score; ga += g.away_score; form.push(g.home_score > g.away_score ? 'W' : g.home_score < g.away_score ? 'L' : 'D'); }
      else if (g.away_name === r.team_name) { gf += g.away_score; ga += g.home_score; form.push(g.away_score > g.home_score ? 'W' : g.away_score < g.home_score ? 'L' : 'D'); }
    }
    Object.assign(r, { goals_for: gf, goals_against: ga, form: form.slice(-5).join('') });
  }
  return rows;
}

/* ───────────── YouTube ───────────── */
const toSec = t => { const p = String(t || '').split(':').map(Number); if (p.some(Number.isNaN) || !p.length) return 0; return p.reduce((a, b) => a * 60 + b, 0); };
const runs = o => o ? (o.simpleText || (o.runs || []).map(r => r.text).join('')) : '';
export function parseYouTube(html) {
  const m = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*/);
  const vids = [];
  if (m) {
    const start = m.index + m[0].length, end = html.indexOf(';</script>', start);
    let data = null;
    try { data = JSON.parse(html.slice(start, end)); } catch { /* fall through */ }
    const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; } if (o.videoRenderer) { vids.push(o.videoRenderer); return; } for (const k in o) walk(o[k]); };
    walk(data);
  }
  return vids.map(v => ({ id: v.videoId, title: runs(v.title), channel: runs(v.longBylineText || v.ownerText || v.shortBylineText),
    length: (v.lengthText && v.lengthText.simpleText) || '', seconds: toSec(v.lengthText && v.lengthText.simpleText),
    published: runs(v.publishedTimeText) })).filter(v => v.id);
}
// lower bound of a YouTube "преди 3 м." age, in days
export function ageDays(pub) {
  const s = String(pub || '').toLowerCase(), n = Number((s.match(/(\d+)/) || [])[1] || 1);
  if (/сек|мин|час|ч\.|second|minute|hour/.test(s)) return 0;
  if (/ден|дни|day/.test(s)) return n;
  if (/седм|week/.test(s)) return 7 * n;
  if (/мес|м\.|month/.test(s)) return 30 * n;
  if (/год|г\.|year/.test(s)) return 365 * n;
  return 0;
}

/* ───────────── team names in titles ───────────── */
export const normName = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[іІ]/g, 'i').replace(/(?<![\p{L}])(?:пфк|фк|пфц)(?![\p{L}])/gu, ' ')
  .replace(/[^\p{L}\p{N}:\-–]+/gu, ' ').replace(/\s+/g, ' ').trim();
const CITY = { 'варна': ['варна', 'вн'], 'пловдив': ['пловдив', 'пд'], 'враца': ['враца', 'вр'], 'софия': ['софия', 'сф'], 'плевен': ['плевен', 'пл'],
  'благоевград': ['благоевград', 'бл'], 'бургас': ['бургас', 'бс'], 'русе': ['русе'], 'кърджали': ['кърджали'], 'своге': ['своге'], 'добрич': ['добрич'],
  'оряховица': ['оряховица', 'го', 'г оряховица', 'горна оряховица'], 'търново': ['търново', 'вт', 'велико търново'] };
const TWO_WORD = new Set(['черно', 'рилски', 'струмска', 'сливнишки']);
const SHORT_FORM = { 'локомотив': 'локо' };              // "Локо Пд", "Локо Сф"
const MONTH_LIKE = new Set(['септември']);               // also the month: only counts when written with a capital С
export function teamAliases(teams) {
  const info = teams.map(name => {
    const n = normName(name);
    let tokens = n.split(' ');
    const reserve = tokens.some(t => t === 'ii' || t === '2' || t === 'u21');
    tokens = tokens.filter(t => !(t === 'ii' || t === '2' || t === 'u21'));
    const nb = TWO_WORD.has(tokens[0]) && tokens[1] ? 2 : 1;
    return { name, n, base: tokens.slice(0, nb).join(' '), rest: tokens.slice(nb), reserve };
  });
  return info.map(t => {
    const suffixes = t.reserve ? [' ii', ' 2', ' u21'] : [''];
    const set = new Set([t.n]);
    const dist = [];
    for (const r of t.rest) { if (CITY[r]) dist.push(...CITY[r]); else if (/^\d{4}$/.test(r)) dist.push(r); else if (r === 'г' || r === 'г.') continue; else dist.push(r); }
    const bases = [t.base].concat(SHORT_FORM[t.base] ? [SHORT_FORM[t.base]] : []);
    for (const b of bases) for (const d of dist) for (const s of suffixes) set.add(`${b} ${d}${s}`);
    const sharing = info.filter(o => o !== t && o.base === t.base && o.reserve === t.reserve);
    // plain base: when no other team shares it, or when this team is "the" club and the other carries a year (ЦСКА vs ЦСКА 1948)
    const plainOk = !sharing.length || (t.rest.every(r => r === 'софия') && sharing.every(o => o.rest.some(r => /^\d{4}$/.test(r))));
    if (plainOk) for (const s of suffixes) set.add(t.base + s);
    if (t.reserve) for (const s of suffixes) set.add(t.base + ' ' + t.rest.filter(r => CITY[r]).map(r => CITY[r][0]).join(' ') + s);
    return { name: t.name, aliases: [...set].map(a => a.replace(/\s+/g, ' ').trim()).filter(Boolean) };
  });
}
// teams mentioned in a title, longest alias wins where aliases overlap
export function mentions(title, aliasList) {
  const t = normName(title).replace(/[()]/g, ' ').replace(/\s+/g, ' ');
  const hits = [];
  for (const { name, aliases } of aliasList) for (const a of aliases) {
    const al = a.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (MONTH_LIKE.has(al) && !new RegExp(al.charAt(0).toUpperCase() + al.slice(1), 'u').test(String(title))) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of t.matchAll(re)) hits.push({ name, pos: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => (b.end - b.pos) - (a.end - a.pos));
  const kept = [];
  for (const h of hits) if (!kept.some(k => h.pos < k.end && k.pos < h.end)) kept.push(h);
  return kept.sort((a, b) => a.pos - b.pos);
}
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20, xxi: 21, xxii: 22, xxiii: 23, xxiv: 24, xxv: 25, xxvi: 26, xxvii: 27, xxviii: 28, xxix: 29, xxx: 30 };
function roundIn(title) {
  const t = String(title).toLowerCase();
  const m = t.match(/(?<![\p{L}\p{N}])(\d{1,2})(?:-?(?:ви|ри|ти|ми|и))?\s*кръг/u) || t.match(/кръг\s*[-–]?\s*(\d{1,2})(?!\d)/);
  if (m) return Number(m[1]);
  const r = t.match(/(?<![\p{L}])([ivx]{1,6})\s*кръг/u) || t.match(/кръг\s*[-–]?\s*([ivx]{1,6})(?![\p{L}])/u);
  return r && ROMAN[r[1]] ? ROMAN[r[1]] : null;
}
function seasonIn(title) {
  const m = String(title).match(/(20\d\d)\s*[\/-]\s*(\d{2,4})(?!\d)/);
  return m ? `${m[1]}/${m[2].slice(-2)}` : null;
}
const scoresIn = title => [...String(title).matchAll(/(?<![\d\/])(\d{1,2})\s*(?::|\s[-–]\s)\s*(\d{1,2})(?![\d\/])/g)].map(m => [Number(m[1]), Number(m[2])]);
const NOT_A_REPORT = /анализ|студио|пресконференц|интервю|изявлен|коментар|подкаст|предаване|преди мача|преди кръга|обзор на кръга|прогноз|гол за |голът|головете|спасяван|треньор|след мача|загрявк|тренировк|пълен мач|full match|live|на живо|дерби на седмицата/i;
const translit = s => s.replace(/[а-я]/g, c => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya' })[c] || c).replace(/tssk/g, 'csk');
export function channelRank(channel, match) {
  const c = String(channel || '').toLowerCase();
  if (/gong/.test(c)) return 3;
  if (/професионална футболна лига|bpfl|efbet/.test(c)) return 2;
  if (/diema|диема|nova|нова|max ?sport|макс спорт|sportal|blitz|блиц|bnt|бнт|a1 |ринг|ring|topsport|dsport|telenews/.test(c)) return 1;
  for (const team of [match.home_name, match.away_name]) {
    const base = normName(team).split(' ').filter(t => !/^\d{4}$/.test(t) && t !== 'ii')[0] || '';
    if (base.length >= 4 && (c.includes(base) || c.includes(translit(base)) || c.includes(translit(base).replace(/iya$/, 'ia')))) return 1;
  }
  return 0;
}

// choose the short and the long report for a match from search results.
// short/long are the best picks; shorts/longs are all acceptable ones, best first (the caller keeps Gong's);
// all = every video of this match from any channel (for "other reports"), best channels first
export function pickVideos(match, vids, aliasList, now = Date.now()) {
  const days = (now - Date.parse(match.kickoff)) / 864e5;
  const cands = [], seen = new Set();
  for (const v of vids) {
    if (!v.seconds || seen.has(v.id) || NOT_A_REPORT.test(v.title)) continue;
    if (ageDays(v.published) > days + 1.5) continue;                              // older than the match
    const ms = mentions(v.title, aliasList);
    const h = ms.find(x => x.name === match.home_name), a = ms.find(x => x.name === match.away_name);
    if (!h || !a || h.pos > a.pos) continue;                                       // both teams, home first
    if (ms.some(x => x.name !== match.home_name && x.name !== match.away_name)) continue;
    const rd = roundIn(v.title); if (rd && rd !== match.round) continue;
    const sn = seasonIn(v.title); if (sn && sn !== SEASON) continue;
    const scores = scoresIn(v.title);
    const scoreOk = scores.some(([x, y]) => x === match.home_score && y === match.away_score);
    const roundOk = rd === match.round;
    // a wrong score rules a video out, unless its round is this match's (Gong sometimes mistypes the score)
    if (scores.length && !scoreOk && !roundOk) continue;
    const ident = scoreOk || roundOk;                                              // surely this match
    const ch = channelRank(v.channel, match);
    if (!ch && !ident) continue;                                                   // unknown channels: only with score or round
    seen.add(v.id);
    cands.push({ v, scoreOk, ident, ch, ext: /разширен|пълен репортаж|extended/i.test(v.title), rep: /репортаж|highlights|обзор/i.test(v.title) });
  }
  const pack = c => c && { id: c.v.id, title: c.v.title.slice(0, 200), channel: c.v.channel.slice(0, 80), length: c.v.length, seconds: c.v.seconds };
  // short report: under 12 minutes and not called "разширен" (Gong's 2nd-league reports run ~9 minutes);
  // extended: "разширен" in the title, or 12 minutes and longer
  const isLong = c => (c.ext && c.v.seconds >= 300) || c.v.seconds >= 720;
  const shorts = cands.filter(c => c.ch && c.ident && c.v.seconds >= 100 && !isLong(c))
    .sort((a, b) => b.ch - a.ch || (b.rep - a.rep) || (b.scoreOk - a.scoreOk) || a.v.seconds - b.v.seconds);
  // a long video without the score/round or "разширен" in its title is only taken from Gong/the league, and only
  // at the usual extended-report length (Gong sometimes gives its ~20-minute reports a headline instead)
  const headline = c => c.ch >= 2 && c.v.seconds >= 900 && c.v.seconds <= 1500;
  const longs = cands.filter(c => c.ch && isLong(c) && c.v.seconds <= 3600 && (c.ident || c.ext || headline(c)))
    .sort((a, b) => (b.ext - a.ext) || b.ch - a.ch || (b.scoreOk - a.scoreOk));
  const all = cands.filter(c => c.v.seconds >= 30 && c.v.seconds <= 3600 && (c.ident || headline(c)))
    .sort((a, b) => b.ch - a.ch || (b.ident - a.ident));
  return { short: pack(shorts[0]), long: pack(longs[0]), shorts: shorts.slice(0, 6).map(pack), longs: longs.slice(0, 6).map(pack), all: all.slice(0, 15).map(pack) };
}

// the short way a team is written in report titles, for searching: "Левски София" → "Левски",
// "ЦСКА 1948" stays, "ПФК Локомотив София 1929" → "Локомотив София" (another Локомотив is in the league)
export function queryNames(teams) {
  const info = teams.map(name => {
    const words = String(name).replace(/^(?:ПФК|ФК)\s+/u, '').split(/\s+/).filter(Boolean);
    const reserve = words.some(w => /^(?:II|2|U21)$/i.test(w));
    const ws = words.filter(w => !/^(?:II|2|U21)$/i.test(w));
    const nb = TWO_WORD.has((ws[0] || '').toLowerCase()) && ws[1] ? 2 : 1;
    return { name, base: ws.slice(0, nb).join(' '), rest: ws.slice(nb), reserve };
  });
  const out = new Map();
  for (const t of info) {
    const sharing = info.filter(o => o !== t && o.base.toLowerCase() === t.base.toLowerCase() && o.reserve === t.reserve);
    const year = t.rest.find(w => /^\d{4}$/.test(w)), place = t.rest.filter(w => !/^\d{4}$/.test(w) && !/^г\.?$/i.test(w));
    let q = t.base;
    if (sharing.length) {
      const othersHaveYear = sharing.every(o => o.rest.some(w => /^\d{4}$/.test(w)));
      if (!year && place.every(w => /^софия$/i.test(w)) && othersHaveYear) q = t.base;   // ЦСКА (vs ЦСКА 1948)
      else if (place.length) q = [t.base, ...place].join(' ');                              // Локомотив София, Ботев Пловдив
      else if (year) q = `${t.base} ${year}`;                                               // ЦСКА 1948
    }
    out.set(t.name, q + (t.reserve ? ' II' : ''));
  }
  return out;
}

// search words for a team: no ПФК/ФК, no founding years (except where they tell two clubs apart)
export function searchName(name) {
  return String(name).replace(/(?<![\p{L}])(?:ПФК|ФК)\s+/gu, '').replace(/\s+(?:1929|1918|1919|1945|2019|1914|1912)(?!\d)/g, '').trim();
}
