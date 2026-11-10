// The league tables as they stand right now: the source's table, plus the matches finished since the source last
// updated it, plus the matches being played (at their current score: a draw is a point each). A plain script: the page
// loads it as window.LiveTable, the tests require() it.
(function (root) {
  'use strict';

  // Tie-breaks when teams are level on points. 'h2h': the matches between them first (points, goal difference, goals,
  // away goals when two teams are level), then all matches — Bulgaria (BFU), LaLiga, Serie A, the Nations League,
  // the qualifiers. 'gd': goal difference and goals first — Premier League, Bundesliga, Ligue 1, the UEFA league phase.
  // A tie still left goes by the source's own order (it knows fair play, drawing of lots and the rest).
  const H2H = /^(?:efbet|mrbit|sw3|esp\.1|ita\.1|uefa\.nations)$|qual|caf\./;
  const rulesOf = lg => (H2H.test(String(lg || '')) ? 'h2h' : 'gd');

  // a match of another stage (qualifying, play-off, knockout) doesn't count towards the table
  const OTHER_STAGE = /qualif|prelim|play-?off|knockout|round-of|final|semi|quarter|relegation|promotion/i;
  const counts = m => !m.round_name || !OTHER_STAGE.test(m.round_name);
  const scored = m => m.home_score != null && m.away_score != null;
  const t = m => Date.parse(m.kickoff) || 0;
  const cmp = (a, b) => t(a) - t(b) || String(a.id).localeCompare(String(b.id));

  function build(rows, matches, opts) {
    opts = opts || {};
    const src = (rows || []).map(r => Object.assign({}, r));
    const out = { rows: src, live: 0, caught: 0, changed: false };
    if (!src.length) return out;
    const byTeam = new Map(src.map(r => [r.team_name, r]));
    const sameTable = m => { const h = byTeam.get(m.home_name), a = byTeam.get(m.away_name); return h && a && (h.grp || '') === (a.grp || ''); };
    const ms = (matches || []).filter(m => counts(m) && sameTable(m) && (m.status === 'finished' ? scored(m) : m.status === 'live'));
    const done = ms.filter(m => m.status === 'finished').sort(cmp), now = ms.filter(m => m.status === 'live').sort(cmp);

    // each team's matches in the order they were played; those past the source's count are new to the table
    const seq = new Map();
    for (const m of done.concat(now)) for (const n of [m.home_name, m.away_name]) { if (!seq.has(n)) seq.set(n, []); seq.get(n).push(m); }
    for (const r of src) {
      const list = seq.get(r.team_name) || [], from = r.played == null ? list.length : r.played;
      r.official_rank = r.rank;
      for (const m of list.slice(from)) {
        const home = m.home_name === r.team_name, gf = (home ? m.home_score : m.away_score) ?? 0, ga = (home ? m.away_score : m.home_score) ?? 0;
        const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D', pts = res === 'W' ? 3 : res === 'D' ? 1 : 0;
        r.played = (r.played || 0) + 1;
        r.won = (r.won || 0) + (res === 'W'); r.drawn = (r.drawn || 0) + (res === 'D'); r.lost = (r.lost || 0) + (res === 'L');
        r.goals_for = (r.goals_for || 0) + gf; r.goals_against = (r.goals_against || 0) + ga; r.points = (r.points || 0) + pts;
        if (m.status === 'live') {
          r.live = { gf, ga, pts, opponent: home ? m.away_name : m.home_name, home };
          out.live++;
        } else {
          if (r.form != null) r.form = (String(r.form) + res).slice(-5);
          out.caught++;
        }
        r.changed = true;
        out.changed = true;
      }
    }
    if (!out.changed) return out;

    // the order again, group by group; a group (or a tie) nobody in has changed keeps the source's order
    const groups = new Map();
    for (const r of src) { const g = r.grp || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
    out.rows = [];
    for (const [, g] of groups) out.rows.push(...(g.some(r => r.changed) ? order(g, done.concat(now), opts.league) : g.sort((a, b) => orank(a) - orank(b))));
    return out;
  }
  const orank = r => (r.official_rank ?? r.rank ?? 999);
  const gd = r => (r.goals_for || 0) - (r.goals_against || 0);

  // one table's rows in order (rank set to the place), by points and then the competition's tie-breaks
  function order(g, matches, league) {
    const rules = rulesOf(league);
    g = g.slice().sort((a, b) => (b.points || 0) - (a.points || 0) || orank(a) - orank(b));
    for (let i = 0; i < g.length;) {
      let j = i + 1;
      while (j < g.length && (g[j].points || 0) === (g[i].points || 0)) j++;
      if (j - i > 1 && g.slice(i, j).some(r => r.changed)) g.splice(i, j - i, ...breakTie(g.slice(i, j), matches, rules));
      i = j;
    }
    g.forEach((r, k) => { r.rank = k + 1; });
    return g;
  }
  function breakTie(tie, matches, rules) {
    const names = new Set(tie.map(r => r.team_name));
    const mini = new Map(tie.map(r => [r.team_name, { p: 0, gf: 0, ga: 0, away: 0, hosted: new Set(), visited: new Set() }]));
    if (rules === 'h2h') for (const m of matches) {
      if (!names.has(m.home_name) || !names.has(m.away_name)) continue;
      const h = mini.get(m.home_name), a = mini.get(m.away_name), hs = m.home_score ?? 0, as = m.away_score ?? 0;
      h.gf += hs; h.ga += as; a.gf += as; a.ga += hs; a.away += as;
      h.hosted.add(m.away_name); a.visited.add(m.home_name);
      if (hs > as) h.p += 3; else if (hs < as) a.p += 3; else { h.p++; a.p++; }
    }
    // away goals only between two teams that have played each other at home and away
    const both = tie.length === 2 && mini.get(tie[0].team_name).hosted.has(tie[1].team_name) && mini.get(tie[0].team_name).visited.has(tie[1].team_name);
    const keys = r => {
      const x = mini.get(r.team_name);
      return rules === 'h2h' ? [x.p, x.gf - x.ga, x.gf, both ? x.away : 0, gd(r), r.goals_for || 0] : [gd(r), r.goals_for || 0];
    };
    return tie.slice().sort((a, b) => { const ka = keys(a), kb = keys(b); for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return kb[k] - ka[k]; return orank(a) - orank(b); });
  }

  const api = { build, order, rulesOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LiveTable = api;
})(typeof window !== 'undefined' ? window : globalThis);
