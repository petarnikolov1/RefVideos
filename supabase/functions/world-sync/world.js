// World competitions for BG Referee Watch: which competitions, and turning ESPN's public scoreboard and
// standings JSON into rows for public.football_matches / public.football_standings.
// Plain JS so it runs in the Supabase Edge Function and can be tested with Node.

// grp: top5 = the five big leagues, euro = UEFA club competitions, nat = national teams.
// National-team competitions only show on the site while they (or their qualifiers) are being played.
export const COMPS = [
  { key: 'eng.1', name: 'Англия — Висша лига', grp: 'top5', ord: 1 },
  { key: 'esp.1', name: 'Испания — Ла Лига', grp: 'top5', ord: 2 },
  { key: 'ita.1', name: 'Италия — Серия А', grp: 'top5', ord: 3 },
  { key: 'ger.1', name: 'Германия — Бундеслига', grp: 'top5', ord: 4 },
  { key: 'fra.1', name: 'Франция — Лига 1', grp: 'top5', ord: 5 },
  { key: 'uefa.champions', name: 'Шампионска лига', grp: 'euro', ord: 10 },
  { key: 'uefa.europa', name: 'Лига Европа', grp: 'euro', ord: 11 },
  { key: 'uefa.europa.conf', name: 'Лига на конференциите', grp: 'euro', ord: 12 },
  { key: 'fifa.world', name: 'Световно първенство', grp: 'nat', ord: 20 },
  { key: 'uefa.euro', name: 'Европейско първенство', grp: 'nat', ord: 21 },
  { key: 'conmebol.america', name: 'Копа Америка', grp: 'nat', ord: 22 },
  { key: 'caf.nations', name: 'Купа на африканските нации', grp: 'nat', ord: 23 },
  { key: 'uefa.nations', name: 'Лига на нациите', grp: 'nat', ord: 24 },
  { key: 'fifa.worldq.uefa', name: 'Квалификации за СП — Европа', grp: 'nat', ord: 30 },
  { key: 'fifa.worldq.conmebol', name: 'Квалификации за СП — Южна Америка', grp: 'nat', ord: 31 },
  { key: 'fifa.worldq.caf', name: 'Квалификации за СП — Африка', grp: 'nat', ord: 32 },
  { key: 'fifa.worldq.afc', name: 'Квалификации за СП — Азия', grp: 'nat', ord: 33 },
  { key: 'fifa.worldq.concacaf', name: 'Квалификации за СП — КОНКАКАФ', grp: 'nat', ord: 34 },
  { key: 'uefa.euroq', name: 'Квалификации за Евро', grp: 'nat', ord: 35 },
  { key: 'caf.nations_qual', name: 'Квалификации за КАН', grp: 'nat', ord: 36 },
];
export const ACTIVE_DAYS = 42;          // a competition counts as being played with a match within 6 weeks either side

const API = 'https://site.api.espn.com/apis';
export const scoreboardUrl = (key, ym) => `${API}/site/v2/sports/soccer/${key}/scoreboard?dates=${ym}&limit=500`;
export const standingsUrl = key => `${API}/v2/sports/soccer/${key}/standings`;
// "202611" for a month, counted from a date
export const ym = (t, add = 0) => { const d = new Date(t); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1)); return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
export function monthsBetween(from, to) {
  const out = [];
  for (let k = 0; k < 30; k++) { const m = ym(from, k); out.push(m); if (m >= ym(to)) break; }
  return out;
}

/* ───────────── names ───────────── */
const STAGE_BG = [
  [/^league-phase$/, 'Основна фаза'], [/^group-stage$|^group-phase$/, 'Групова фаза'], [/knockout-round-playoff|^playoffs?$|play-?off/, 'Плейоф'],
  [/round-of-64/, '1/32-финал'], [/round-of-32/, '1/16-финал'], [/round-of-16/, '1/8-финал'], [/quarter/, 'Четвъртфинал'], [/semi/, 'Полуфинал'],
  [/3rd|third/, 'Мач за 3-то място'], [/^final$|^finals?$/, 'Финал'],
  [/(\d)(?:st|nd|rd|th)-qualifying/, m => `${m[1]}-ви квалификационен кръг`], [/qualifying|preliminary/, 'Квалификации'],
];
// a stage played as a league / groups (numbered rounds) or as a knockout (one entry per stage)
export const isKnockout = slug => /round-of|final|play-?off|quarter|semi|3rd|third|qualifying|preliminary|knockout/.test(String(slug || ''));
export function stageName(slug) {
  const s = String(slug || '').toLowerCase();
  for (const [re, bg] of STAGE_BG) { const m = s.match(re); if (m) return typeof bg === 'function' ? bg(m) : bg; }
  return '';
}
// "UEFA Nations League, Group C2" → "Група C2"; "UEFA Champions League, League Phase" → "Основна фаза"
export function noteName(alt, slug) {
  const tail = String(alt || '').split(',').slice(1).join(',').trim();
  const g = tail.match(/^(?:League\s+)?Group\s+([A-Z]\d?)$/i) || tail.match(/^Group\s+([A-Z0-9]+)/i);
  if (g) return 'Група ' + g[1].toUpperCase();
  const lg = tail.match(/^League\s+([A-D])$/i);
  if (lg) return 'Дивизия ' + lg[1].toUpperCase();
  return stageName(slug) || '';
}
export const groupName = n => { const m = String(n || '').match(/^(?:League\s+)?Group\s+(\S+)$/i); return m ? 'Група ' + m[1].toUpperCase() : /league phase/i.test(n || '') ? 'Основна фаза' : null; };

/* ───────────── matches ───────────── */
const num = v => (v === '' || v == null || Number.isNaN(Number(v))) ? null : Number(v);
function status(st) {
  const t = (st && st.type) || {}, name = String(t.name || '');
  if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED|ABANDONED|DELAYED/.test(name)) return 'postponed';
  if (t.state === 'in') return 'live';
  if (t.state === 'post') return t.completed === false ? 'postponed' : 'finished';
  return 'scheduled';
}
// one scoreboard answer → { edition, rows }
export function parseScoreboard(key, json) {
  const lg = (json && json.leagues && json.leagues[0]) || {};
  const edition = String((lg.season && (lg.season.displayName || lg.season.year)) || '');
  const rows = [];
  for (const ev of (json && json.events) || []) {
    const c = ev.competitions && ev.competitions[0];
    if (!c || !Array.isArray(c.competitors)) continue;
    const home = c.competitors.find(x => x.homeAway === 'home') || c.competitors[0];
    const away = c.competitors.find(x => x.homeAway === 'away') || c.competitors[1];
    if (!home || !away || !home.team || !away.team) continue;
    const st = status(c.status || ev.status);
    const played = st === 'finished' || st === 'live';
    const slug = (ev.season && ev.season.slug) || '';
    let note = noteName(c.altGameNote, slug);
    const leg = c.notes && c.notes[0] && c.notes[0].headline;
    if (leg && /leg/i.test(leg)) note += (note ? ' · ' : '') + (/1st/i.test(leg) ? 'първи мач' : /2nd/i.test(leg) ? 'реванш' : leg);
    if (played && home.shootoutScore != null && away.shootoutScore != null) note += (note ? ' · ' : '') + `дузпи ${home.shootoutScore}:${away.shootoutScore}`;
    const link = (ev.links || []).find(l => l && l.href) || {};
    rows.push({
      // round 0: ESPN gives no matchday, the page numbers the rounds from the fixture list (each team once per round)
      id: `${key}:${ev.id}`, league: key, season: edition, round: 0, round_name: slug || null, note: note || null,
      kickoff: ev.date ? new Date(ev.date).toISOString() : null, status: st,
      home_name: home.team.displayName || home.team.name, away_name: away.team.displayName || away.team.name,
      home_logo: home.team.logo || null, away_logo: away.team.logo || null,
      home_score: played ? num(home.score) : null, away_score: played ? num(away.score) : null,
      ht_home: null, ht_away: null, source_url: link.href || null,
    });
  }
  return { edition, rows };
}

/* ───────────── standings ───────────── */
export function parseStandings(json) {
  const out = [];
  let edition = '';
  const kids = (json && json.children) || [];
  kids.forEach((g, gi) => {
    const s = g.standings || {};
    edition = edition || String(s.seasonDisplayName || '');
    const grp = kids.length > 1 ? (groupName(g.name) || g.name || null) : null;
    for (const e of s.entries || []) {
      const st = Object.fromEntries((e.stats || []).map(x => [x.name, x.value]));
      const t = e.team || {};
      out.push({ team_name: t.displayName || t.name, logo: (t.logos && t.logos[0] && t.logos[0].href) || null,
        rank: num(st.rank), played: num(st.gamesPlayed), won: num(st.wins), drawn: num(st.ties), lost: num(st.losses),
        goals_for: num(st.pointsFor), goals_against: num(st.pointsAgainst), points: num(st.points), form: null,
        grp, grp_order: kids.length > 1 ? gi : null,
        // what the place leads to, as ESPN writes it: "Champions League", "Relegation playoff", "Qualifies for round of 16"…
        zone: (e.note && String(e.note.description || '').trim()) || null });
    }
  });
  return { edition, rows: out.filter(r => r.team_name) };
}

// is the competition being played: any match within ACTIVE_DAYS of now
export function activity(rows, now = Date.now()) {
  const ts = rows.map(r => Date.parse(r.kickoff)).filter(Number.isFinite);
  if (!ts.length) return { active: false, first: null, last: null };
  const win = ACTIVE_DAYS * 864e5;
  return { active: ts.some(t => Math.abs(t - now) <= win), first: new Date(Math.min(...ts)).toISOString(), last: new Date(Math.max(...ts)).toISOString() };
}
