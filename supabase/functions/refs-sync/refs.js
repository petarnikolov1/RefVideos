// Referee appointments, the Third League (South-West) results and table, and its disciplinary decisions.
// Plain JS so it runs in the Edge Function and can be tested with Node.
//   appointments: bfunion.bg (Съдийска комисия) for efbet Лига and Втора лига, bfu-tournaments.com for the Third League
//   Third League results and table: bulgarian-football.com
//   Third League punishments: the PDF attached to bfu-tournaments.com's "Наказания" posts

export const SEASON = '2026/27';
export const SEASON_START = '2026-07-01';
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export const BFU_LIST = 'https://bfunion.bg/%D0%A1%D1%8A%D0%B4%D0%B8%D0%B9%D1%81%D0%BA%D0%B0-%D0%BA%D0%BE%D0%BC%D0%B8%D1%81%D0%B8%D1%8F';
export const BFUT_LIST = 'https://bfu-tournaments.com/leagues/third-sw/news';
export const SW3_PAGE = 'https://bulgarian-football.com/yugozapadna-treta-liga.html';

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
const ROMAN = { I: 1, V: 5, X: 10, L: 50 };
export const roman = s => { let n = 0; const a = String(s).toUpperCase().split('').map(c => ROMAN[c] || 0); a.forEach((v, i) => { n += v < (a[i + 1] || 0) ? -v : v; }); return n; };

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
export const ALIAS = { 'армията': 'цска', 'централен': 'цска' };
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
export const titleCase = s => String(s).toLowerCase().replace(/(^|[\s(\-–/"„])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Ii|Iii)\b/g, x => x.toUpperCase());

/* ───────── listing pages ───────── */
// bfunion.bg: <h6><a href="https://bfunion.bg/news/52230/9">СЪДИЙСКИ НАЗНАЧЕНИЯ EFBET ЛИГА - XIII КРЪГ СЕЗОН 2026/27</a></h6> <p class="sm">04 Ноември 2026 18:29</p>
export function parseBfuList(html) {
  const out = [];
  for (const m of String(html).matchAll(/<h6>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h6>\s*<div class="infoItem__content-bottom">\s*<p class="sm">([^<]*)<\/p>/g)) {
    const d = parseDate(clean(m[3]).replace(/^(\d+)\s+(\p{L}+)\s+(\d{4})/u, (x, a, b, c) => `${a} ${b.toLowerCase()} ${c} г.,`));
    out.push({ url: m[1], title: clean(m[2]), posted: d ? d.iso : null });
  }
  return out;
}
// bfu-tournaments.com: <a wire:navigate href="https://bfu-tournaments.com/news/…"> … <h5 class="text-base"> Title</h5> … <time …> 6 ноември 2026 0:00 </time>
export function parseBfutList(html) {
  const out = [], h = String(html);
  for (const m of h.matchAll(/<a wire:navigate href="(https:\/\/bfu-tournaments\.com\/news\/[^"]+)"[\s\S]*?<h5 class="text-base">([\s\S]*?)<\/h5>[\s\S]*?<time[^>]*>([\s\S]*?)<\/time>/g)) {
    const t = clean(m[3]), d = t.match(/(\d{1,2})\s+(\p{L}+)\s+(\d{4})/u);
    out.push({ url: m[1], title: clean(m[2]), posted: d ? parseDate(`${d[1]} ${d[2].toLowerCase()} ${d[3]} г.`)?.iso ?? null : null });
  }
  return out;
}
// which league and round an appointments post is for (null: not an appointments post of this season)
export function appointmentPost(title) {
  const t = String(title);
  if (!/съдийски\s+на[а-я]{4,8}ния/i.test(t)) return null;   // also the misspelt "Съдийски нанзачения 7 кръг"
  if (/купа|cup|суперкупа|женск|юнош|дюф|футзал|plus|elite|елит/i.test(t)) return null;
  if (/сезон\s*20\d\d/i.test(t) && !/сезон\s*2026\s*[/-]\s*(?:20)?27/i.test(t)) return null;
  const league = /efbet/i.test(t) ? 'efbet' : /mr\.?\s*bit|втора/i.test(t) ? 'mrbit' : /трета|югозапад/i.test(t) ? 'sw3' : null;
  if (!league) return null;
  const r = t.match(/\b([IVXL]+)\s+КРЪГ/i) || t.match(/(\d+)\s*(?:-?(?:ти|ви|ри|ми))?\s+кръг/i);
  return { league, round: r ? (/^\d+$/.test(r[1]) ? +r[1] : roman(r[1])) : null };
}
export const punishmentPost = title => {
  const t = String(title), r = t.match(/(\d+)\s*кръг/i);
  return /наказания/i.test(t) && /трета|юзг/i.test(t) ? { round: r ? +r[1] : null, postponed: /отложен/i.test(t) } : null;
};

/* ───────── an appointments post ───────── */
// the post as a list of text cells (table cells, paragraphs)
// (bfu-tournaments.com writes them as lines with " | " between the cells, and "II" as "||": "ПФК Славия ||", "ПФК Славия || - ФК Кюстендил")
export function cells(html) {
  return decode(String(html).replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/([\p{L}\d])\s*\|\|\|(?=\s*(?:<|$|[-–]\s))/gu, '$1 III').replace(/([\p{L}\d])\s*\|\|(?=\s*(?:<|$|[-–]\s))/gu, '$1 II')
    .replace(/<[^>]+>|\|/g, '\u0001'))
    .split('\u0001').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const ROLE = /^(ГС|АС\s*1|АС\s*2|4\s*-?\s*ТИ|ВАР|АВАР|СН|ДН|ДЕЛЕГАТ|НАБЛЮДАТЕЛ|РЕЗЕРВЕН)\s*:?\s*(.*)$/i;
// { round, items: [{ date, fixture, crew: [{ r, n }] }] }
export function parseAppointments(html) {
  let c = cells(html);
  const start = c.findIndex(x => /^Срещи от/i.test(x));
  if (start >= 0) c = c.slice(start);
  const end = c.findIndex(x => /запазва правото/i.test(x));
  if (end >= 0) c = c.slice(0, end);
  const head = c[0] && c[0].match(/Срещи от\s+(\d+)\s*кръг/i);
  const items = [];
  let date = null, cur = null, role = null;
  for (const x of c) {
    const d = RX_DATE.test(x) && /^\d{1,2}\s/.test(x) ? parseDate(x) : null;
    if (d) { date = d; cur = null; role = null; continue; }
    const rm = x.match(ROLE);
    if (rm && cur) {
      const r = rm[1].toUpperCase().replace(/\s+/g, '').replace(/^4-?ТИ$/, '4-ТИ');
      if (rm[2]) { cur.crew.push({ r, n: tidyName(rm[2]) }); role = null; } else role = r;
      continue;
    }
    if (role && cur) { if (x !== '-' && !/^&?nbsp;?$/.test(x)) cur.crew.push({ r: role, n: tidyName(x) }); role = null; continue; }
    if (date && !cur && /\s[-–]\s/.test(x)) { cur = { date, fixture: x, crew: [] }; items.push(cur); continue; }
  }
  return { round: head ? +head[1] : null, items: items.filter(i => i.crew.length) };
}
const tidyName = s => String(s).replace(/[*.]+$/, '').replace(/\s+/g, ' ').trim();

// each appointment → the match it is for: both clubs' names must fit, the same day and time and round count too
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

/* ───────── Third League South-West: results and table (bulgarian-football.com) ───────── */
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya' };
const slug = s => tokens(String(s).replace(/\([^)]*\)/g, ' ')).join('-').replace(/[а-я]/g, c => TR[c] ?? c);
const keyOf = s => tokens(String(s).replace(/\([^)]*\)/g, ' ')).join(' ');
export function parseSw3(html) {
  const h = String(html).replace(/\s+/g, ' ');
  // the table: "1. <a …>Миньор (Перник)</a> 16 12 3 1 35:7 39"
  const tStart = h.indexOf('class="standings-'), tEnd = tStart >= 0 ? h.indexOf('</div>', tStart) : -1;
  const table = [];
  if (tStart >= 0) for (const m of h.slice(tStart, tEnd).matchAll(/(\d+)\.\s*<a[^>]*>([^<]+)<\/a>\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+):(\d+)\s+(-?\d+)/g))
    table.push({ rank: +m[1], team_name: clean(m[2]), played: +m[3], won: +m[4], drawn: +m[5], lost: +m[6], goals_for: +m[7], goals_against: +m[8], points: +m[9] });
  const canon = new Map(table.map(t => [keyOf(t.team_name), t.team_name]));
  const name = s => canon.get(keyOf(s)) || clean(s);
  // the rounds: <a id="k8r1"></a><strong>I кръг</strong> <u>1 август 2026 г., събота, 18:00 ч:</u> <strong>Home - Away 1:3 (0:3) </strong>
  const lStart = h.indexOf('id="k8r1"'), lEnd = h.indexOf('id="grid-v"');
  const body = lStart >= 0 ? h.slice(lStart - 6, lEnd > lStart ? lEnd : undefined) : '';
  const byPair = new Map();
  let round = 0, over = 0, date = null, venue = '';
  const tokensRx = /<a id="k8r(\d+)"><\/a>|<u>([^<]*)<\/u>|<em>([^<]*)<\/em>|<strong>([\s\S]*?)<\/strong>/g;
  for (const m of body.matchAll(tokensRx)) {
    if (m[1]) { round = +m[1]; over = 0; date = null; venue = ''; continue; }
    if (m[2] != null) { date = parseDate(m[2]); venue = ''; continue; }
    if (m[3] != null) { venue = clean(m[3]).replace(/:$/, ''); continue; }
    const s = clean(m[4]);
    const ov = s.match(/^([IVXL]+)\s+кръг\s*-\s*отложен/i);
    if (ov) { over = roman(ov[1]); date = null; continue; }
    if (/^[IVXL]+\s+кръг$/i.test(s)) continue;
    // "Home (Town) - Away (Town) 2:1 (2:0)" · "… отложен" · "… - " (not played yet)
    const mm = s.match(/^(.+?\))\s+-\s+(.+?\))\s*(.*)$/) || s.match(/^(.+?)\s+-\s+(.+?)\s+(\d+:\d+.*|отложен.*|-|)$/);
    if (!mm) continue;
    const home = name(mm[1]), away = name(mm[2]), rest = mm[3].trim();
    const sc = rest.match(/^(\d+):(\d+)(?:\s*\((\d+):(\d+)\))?/);
    const e = { round: over || round, home, away, date, venue, score: sc ? [+sc[1], +sc[2]] : null, ht: sc && sc[3] != null ? [+sc[3], +sc[4]] : null,
      postponed: /отложен/i.test(rest), note: /сл\.|служебн/i.test(rest) ? 'служебен резултат' : '' };
    const k = home + '|' + away, old = byPair.get(k);
    // a postponed match is listed again under its new date (and again in a later round's "отложени мачове"):
    // the entry with a score, else the one with the latest date, else the postponement; the round stays the first one
    if (!old) { byPair.set(k, e); continue; }
    const better = (e.score && !old.score) || (!old.score && e.date && (!old.date || old.postponed || e.date.iso > old.date.iso) && !e.postponed);
    if (better) byPair.set(k, { ...e, round: old.round });
  }
  const now = Date.now();
  const matches = [...byPair.values()].map(e => {
    const status = e.score ? 'finished' : e.postponed && (!e.date || Date.parse(e.date.iso) < now) ? 'postponed' : 'scheduled';
    return { id: `sw3:${SEASON.replace('/', '-')}:${slug(e.home)}:${slug(e.away)}`, league: 'sw3', season: SEASON, round: e.round,
      kickoff: e.date ? (e.date.time ? e.date.iso : sofiaUtc(e.date.y, e.date.mo, e.date.d, 12, 0).toISOString()) : null, status,
      home_name: e.home, away_name: e.away, home_score: e.score ? e.score[0] : null, away_score: e.score ? e.score[1] : null,
      ht_home: e.ht ? e.ht[0] : null, ht_away: e.ht ? e.ht[1] : null, source_url: SW3_PAGE,
      note: [e.date && !e.date.time ? 'час — неуточнен' : '', e.venue ? e.venue : '', e.note].filter(Boolean).join(' · ') || null };
  });
  return { table, matches };
}

/* ───────── Third League punishments (the attached PDF, as lines in reading order) ───────── */
// "ЛАЗАР ЕРИНИН | ПИРИН 1941 РЗ. | 5 | 1 среща" under "ЗА ПОЛУЧЕН ЖЪЛТ КАРТОН"; "ТОНИ БРАТАНОВ | ЕТРОПОЛЕ ЕТР. | 22(2), в) | 1 среща" under
// "ЗА ПОЛУЧЕН ЧЕРВЕН КАРТОН"; "- ДК наказва …" paragraphs are fines and bans for clubs and staff
export function parsePunishments(lines, teams = []) {
  const players = [], decisions = [];
  let section = '', para = null;
  const flush = () => { if (para) { decisions.push({ section: section || 'report', text: para.replace(/\s+/g, ' ').trim() }); para = null; } };
  for (const raw of lines) {
    const l = String(raw).replace(/^\d+:\s*/, '').trim();
    if (!l || /^--- end of page/.test(l)) continue;
    if (/ЖЪЛТ КАРТОН/i.test(l) && /^ЗА ПОЛУЧЕН/i.test(l)) { flush(); section = 'yellow'; continue; }
    if (/ЧЕРВЕН КАРТОН/i.test(l) && /^ЗА ПОЛУЧЕН/i.test(l)) { flush(); section = 'red'; continue; }
    if (/^ПО ДОКЛАД/i.test(l)) { flush(); section = 'report'; continue; }
    if (/^(ЗС на БФС|ДИСЦИПЛИНАРНА КОМИСИЯ|НАКАЗАНИЯ ТРЕТА)/i.test(l) || /^ИМЕ\s*\|/i.test(l)) { flush(); continue; }
    const c = l.split(/\s*\|\s*/);
    if (c.length >= 3 && /сре(щ|щи)|мач/i.test(c[c.length - 1]) && /^[\p{Lu}\s.'-]+$/u.test(c[0])) {
      flush();
      const club = c[1], best = teams.map(t => [t, fit(t, club)]).sort((a, b) => b[1] - a[1])[0];
      players.push({ name: titleCase(c[0]), club: titleCase(club), team: best && best[1] >= 0.5 ? best[0] : null,
        reason: section === 'red' ? 'red' : section === 'yellow' ? 'yellow' : 'report', detail: c.length > 3 ? c[2] : '', ban: c[c.length - 1] });
      continue;
    }
    if (/^-\s*ДК\s/.test(l)) { flush(); para = l.replace(/^-\s*/, ''); continue; }
    if (para) para += ' ' + l;
  }
  flush();
  return { players, decisions };
}
// the PDF linked from a bfu-tournaments.com post
export const docLink = html => { const m = String(html).match(/href="(\/news_docs\/[^"]+\.pdf)"/i); return m ? 'https://bfu-tournaments.com' + m[1] : null; };
