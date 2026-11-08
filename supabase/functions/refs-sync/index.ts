// refs-sync: referee appointments for every match of efbet Лига, Втора лига and the Third League South-West, the Third
// League's results and table, and its disciplinary decisions (suspended players, fines, staff bans).
//   appointments: bfunion.bg → Съдийска комисия (1st and 2nd League), bfu-tournaments.com → third-sw news (Third League)
//   Third League results and table: bulgarian-football.com · punishments: the PDF attached to bfu-tournaments.com's posts
// Called by pg_cron every 30 minutes with the key stored in the vault as football_sync_key.
// Body (JSON, all optional): { results, officials, discipline (each default true), pages: 1 (listing pages to read),
//   days: 10 (posts newer than this are read again, for late changes), all: false (read every post again), dry, probe: url }
import * as R from './refs.js';
import { getDocumentProxy } from 'npm:unpdf@0.12.1';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...AUTH, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: unknown) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const upsert = async (table: string, conflict: string, rows: any[]) => {
  for (let i = 0; i < rows.length; i += 100)
    await rest(`${table}?on_conflict=${conflict}`, { method: 'POST', body: JSON.stringify(rows.slice(i, i + 100)), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
};
async function fetchBytes(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': R.UA, 'Accept-Language': 'bg-BG,bg;q=0.9' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
const page = async (url: string) => new TextDecoder().decode(await fetchBytes(url));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// the PDF's text as lines in reading order (top to bottom, left to right); a wide gap between pieces becomes " | "
async function pdfLines(buf: Uint8Array) {
  const pdf = await getDocumentProxy(buf), out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const items = ((await (await pdf.getPage(p)).getTextContent()).items as any[]).filter(i => i.str && i.str.trim());
    const rows: { y: number; parts: { x: number; w: number; s: string }[] }[] = [];
    for (const i of items) {
      const x = i.transform[4], y = i.transform[5];
      let r = rows.find(r => Math.abs(r.y - y) < 3);
      if (!r) rows.push(r = { y, parts: [] });
      r.parts.push({ x, w: i.width || 0, s: i.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      let line = '', end = -1e9;
      for (const q of r.parts) { line += end < -1e8 ? q.s : (q.x - end > 12 ? ' | ' : (q.x - end > 1 ? ' ' : '')) + q.s; end = q.x + q.w; }
      out.push(line.replace(/\s+/g, ' ').trim());
    }
  }
  return out;
}
// run a few at a time, stopping before the time limit
async function pool<T>(list: T[], n: number, started: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length && Date.now() - started < 115000) { const x = list[i++]; await fn(x); await sleep(150); } }));
  return i;
}

Deno.serve(async (req) => {
  const started = Date.now();
  const key = req.headers.get('x-sync-key') ?? '';
  if (!key || !(await rpc('football_sync_key_ok', { k: key }).catch(() => false)))
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const dry = !!body.dry, pages = Math.max(1, Math.min(Number(body.pages ?? 1), 8)), days = Number(body.days ?? 10);
  const out: Record<string, any> = { ok: true, dry, at: new Date().toISOString(), mode: 'refs-sync' };

  if (body.probe) {
    const buf = await fetchBytes(String(body.probe)), pdf = buf[0] === 0x25 && buf[1] === 0x50;
    const text = pdf ? (await pdfLines(buf)).join('\n') : new TextDecoder().decode(buf);
    return Response.json({ ...out, pdf, bytes: buf.length, text: text.slice(Number(body.from ?? 0), Number(body.from ?? 0) + Number(body.len ?? 6000)) });
  }

  // 1. the Third League South-West: results, fixtures and table
  let sw3: any = null;
  if (body.results !== false) {
    try {
      sw3 = R.parseSw3(await page(R.SW3_PAGE));
      const by: Record<string, number> = {};
      for (const m of sw3.matches) by[m.status] = (by[m.status] ?? 0) + 1;
      out.sw3 = { matches: sw3.matches.length, byStatus: by, table: sw3.table.length };
      if (dry) out.sw3.sample = sw3.matches.filter((m: any) => m.status === 'finished').slice(-2).concat(sw3.matches.filter((m: any) => m.status !== 'finished').slice(0, 2));
      if (!dry && sw3.matches.length >= 100) await upsert('football_matches', 'id', sw3.matches.map((m: any) => ({ ...m, updated_at: new Date().toISOString() })));
      if (!dry && sw3.table.length >= 10) out.sw3.tableSaved = await rpc('football_replace_standings', { p_league: 'sw3', p_season: R.SEASON, p_rows: sw3.table });
    } catch (e) { out.sw3Error = String((e as Error).message ?? e); }
  }

  // 2. the posts: appointments (all three leagues) and the Third League's punishments
  const posts: any[] = [];
  const since = Date.parse(R.SEASON_START);
  const listErr: string[] = [];
  for (let p = 1; p <= pages; p++) {
    try {
      const list = R.parseBfuList(await page(R.BFU_LIST + (p > 1 ? `?page=${p}` : '')));
      for (const x of list) {
        if (x.posted && Date.parse(x.posted) < since) continue;   // last season's (their titles don't always say which season)
        const a = R.appointmentPost(x.title);
        if (a && a.league !== 'sw3') posts.push({ ...x, kind: 'appointments', ...a });
      }
      if (!list.length || list.every(x => x.posted && Date.parse(x.posted) < since)) break;
    } catch (e) { listErr.push(String((e as Error).message ?? e)); break; }
  }
  for (let p = 1; p <= pages; p++) {
    try {
      const list = R.parseBfutList(await page(R.BFUT_LIST + (p > 1 ? `?page=${p}` : '')));
      for (const x of list) {
        if (x.posted && Date.parse(x.posted) < since) continue;
        const a = R.appointmentPost(x.title), d = R.punishmentPost(x.title);
        if (a && a.league === 'sw3') posts.push({ ...x, kind: 'appointments', ...a });
        else if (d) posts.push({ ...x, kind: 'discipline', ...d });
      }
      if (!list.length || list.every(x => x.posted && Date.parse(x.posted) < since)) break;
    } catch (e) { listErr.push(String((e as Error).message ?? e)); break; }
  }
  out.posts = { found: posts.length, appointments: posts.filter(x => x.kind === 'appointments').length, discipline: posts.filter(x => x.kind === 'discipline').length };
  if (listErr.length) out.listErrors = listErr;

  // which ones to read: new posts, and the last few days' (the committee sometimes changes an appointment)
  const recent = (x: any) => !x.posted || Date.now() - Date.parse(x.posted) < days * 864e5;
  const seenOff = new Set<string>(), seenDis = new Set<string>();
  try {
    for (const r of await rest(`football_officials?select=src_url&season=eq.${encodeURIComponent(R.SEASON)}`)) seenOff.add(r.src_url);
    for (const r of await rest(`football_discipline?select=url&season=eq.${encodeURIComponent(R.SEASON)}`)) seenDis.add(r.url);
  } catch (e) { out.readError = String((e as Error).message ?? e); }
  const todo = posts.filter(x => body.all || recent(x) || !(x.kind === 'appointments' ? seenOff : seenDis).has(x.url))
    .sort((a, b) => String(a.posted).localeCompare(String(b.posted)));   // oldest first: a later post's changes win

  // the fixtures appointments are matched to
  const fixtures: Record<string, any[]> = {};
  const fixturesOf = async (lg: string) => {
    if (fixtures[lg]) return fixtures[lg];
    if (lg === 'sw3' && sw3 && sw3.matches.length) return (fixtures[lg] = sw3.matches);
    return (fixtures[lg] = await rest(`football_matches?select=id,round,kickoff,home_name,away_name&league=eq.${lg}&season=eq.${encodeURIComponent(R.SEASON)}&limit=1000`));
  };
  let teams: string[] = sw3 ? sw3.table.map((t: any) => t.team_name) : [];
  if (!teams.length) try { teams = (await rest(`football_standings?select=team_name&league=eq.sw3&season=eq.${encodeURIComponent(R.SEASON)}`)).map((t: any) => t.team_name); } catch { /* keep empty */ }

  const off: Record<string, any> = out.officials = { posts: 0, matched: 0, unmatched: [] as string[], errors: [] as string[], byLeague: {} as Record<string, number> };
  const dis: Record<string, any> = out.discipline = { posts: 0, players: 0, decisions: 0, errors: [] as string[] };
  const offRows = new Map<string, any>(), disRows: any[] = [];
  const read = todo.filter(x => (x.kind === 'appointments' ? body.officials !== false : body.discipline !== false));
  // appointments are read in order (a later post replaces an earlier one), punishments a few at a time
  for (const x of read.filter(x => x.kind === 'appointments')) {
    if (Date.now() - started > 100000) { off.stoppedEarly = true; break; }
    try {
      const a = R.parseAppointments(await page(x.url));
      const round = a.round ?? x.round;
      const { assigned, unmatched } = R.assign(a.items, await fixturesOf(x.league), round);
      off.posts++;
      for (const { item, match } of assigned) offRows.set(match.id, { match_id: match.id, league: x.league, season: R.SEASON, round: match.round ?? round, crew: item.crew,
        fixture: item.fixture, kickoff_text: item.date ? `${item.date.day}${item.date.time ? ' ' + item.date.time : ''}` : null, src_url: x.url, src_title: x.title, posted_at: x.posted, updated_at: new Date().toISOString() });
      off.byLeague[x.league] = (off.byLeague[x.league] ?? 0) + assigned.length;
      off.unmatched.push(...unmatched.map((f: string) => `${x.league} ${round}: ${f}`));
    } catch (e) { off.errors.push(`${x.title}: ${String((e as Error).message ?? e)}`.slice(0, 200)); }
  }
  off.matched = offRows.size;
  await pool(read.filter(x => x.kind === 'discipline'), 3, started, async x => {
    try {
      const doc = R.docLink(await page(x.url));
      const parsed = doc ? R.parsePunishments(await pdfLines(await fetchBytes(doc)), teams) : { players: [], decisions: [] };
      dis.posts++; dis.players += parsed.players.length; dis.decisions += parsed.decisions.length;
      disRows.push({ url: x.url, league: 'sw3', season: R.SEASON, round: x.round, title: x.title, doc_url: doc, posted_at: x.posted,
        players: parsed.players, decisions: parsed.decisions, updated_at: new Date().toISOString() });
    } catch (e) { dis.errors.push(`${x.title}: ${String((e as Error).message ?? e)}`.slice(0, 200)); }
  });
  if (dry) { off.sample = [...offRows.values()].slice(-3); dis.sample = disRows.slice(0, 1); }
  else {
    try { if (offRows.size) await upsert('football_officials', 'match_id', [...offRows.values()]); } catch (e) { off.errors.push(String((e as Error).message ?? e)); }
    try { if (disRows.length) await upsert('football_discipline', 'url', disRows); } catch (e) { dis.errors.push(String((e as Error).message ?? e)); }
  }
  off.unmatched = off.unmatched.slice(0, 20); off.errors = off.errors.slice(0, 8); dis.errors = dis.errors.slice(0, 8);
  out.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (!dry) await rpc('football_log', { details: out }).catch(() => {});
  return Response.json(out);
});
