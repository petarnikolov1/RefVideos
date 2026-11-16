// A one-off check: which tracks (picture, sound) the site's video files have. Walks the MP4 boxes to the track list
// (moov) and reads only that. Protected by the sync key; changes nothing.
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function get(url: string, from: number, to: number, headers: Record<string, string>) {
  const r = await fetch(url, { headers: { ...headers, Range: `bytes=${from}-${to}` }, signal: AbortSignal.timeout(20000) });
  if (!(r.status === 200 || r.status === 206)) throw new Error(`${r.status} ${(await r.text()).slice(0, 80)}`);
  const total = Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
  if (r.status === 200) { r.body?.cancel(); throw new Error('no range support'); }
  return { b: new Uint8Array(await r.arrayBuffer()), total };
}
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
function kids(b: Uint8Array, start: number, end: number) {
  const out: { type: string; body: number; end: number }[] = [];
  for (let i = start; i + 8 <= end;) {
    let size = u32(b, i), hdr = 8;
    if (size === 1) { size = u32(b, i + 8) * 2 ** 32 + u32(b, i + 12); hdr = 16; } else if (size === 0) size = end - i;
    if (size < 8) break;
    out.push({ type: tag(b, i + 4), body: i + hdr, end: Math.min(end, i + size) });
    i += size;
  }
  return out;
}
const child = (b: Uint8Array, box: { body: number; end: number }, type: string) => kids(b, box.body, box.end).find(k => k.type === type);

async function probe(url: string, headers: Record<string, string>) {
  // the top-level boxes: header by header until the track list (moov)
  let off = 0, total = Infinity, moov: { at: number; size: number } | null = null, n = 0;
  while (off < total && n++ < 40) {
    const h = await get(url, off, off + 15, headers);
    total = h.total || total;
    let size = u32(h.b, 0), hdr = 8; const type = tag(h.b, 4);
    if (size === 1) { size = u32(h.b, 8) * 2 ** 32 + u32(h.b, 12); hdr = 16; } else if (size === 0) size = total - off;
    if (size < 8 || !/^[\x20-\x7e]{4}$/.test(type)) throw new Error('not an MP4/MOV file (' + JSON.stringify(type) + ')');
    if (type === 'moov') { moov = { at: off, size }; break; }
    off += size;
  }
  if (!moov) throw new Error('no track list found');
  if (moov.size > 12_000_000) throw new Error('track list too big');
  const { b } = await get(url, moov.at, moov.at + moov.size - 1, headers);
  const root = { body: 8, end: b.length };
  const tracks = kids(b, root.body, root.end).filter(k => k.type === 'trak').map(t => {
    const mdia = child(b, t, 'mdia'), hdlr = mdia && child(b, mdia, 'hdlr');
    const kind = hdlr ? tag(b, hdlr.body + 8) : '?';
    const stsd = mdia && child(b, mdia, 'minf') && child(b, child(b, mdia, 'minf')!, 'stbl') && child(b, child(b, child(b, mdia, 'minf')!, 'stbl')!, 'stsd');
    const codec = stsd ? tag(b, stsd.body + 8 + 4) : '?';
    const stbl = mdia && child(b, mdia, 'minf') && child(b, child(b, mdia, 'minf')!, 'stbl');
    const stsz = stbl && child(b, stbl, 'stsz'), samples = stsz ? u32(b, stsz.body + 8) : -1;
    // how big the frames are: real sound runs to hundreds of bytes a frame, silence to a few
    let avg = 0, max = 0;
    if (stsz && samples > 0) {
      const fixed = u32(b, stsz.body + 4);
      if (fixed) { avg = max = fixed; }
      else { let sum = 0; const n = Math.min(samples, Math.floor((stsz.end - stsz.body - 12) / 4)); for (let j = 0; j < n; j++) { const z = u32(b, stsz.body + 12 + 4 * j); sum += z; if (z > max) max = z; } avg = n ? Math.round(sum / n) : 0; }
    }
    return `${kind === 'vide' ? 'picture' : kind === 'soun' ? 'SOUND' : kind}:${codec}${samples >= 0 ? '/' + samples : ''}${kind === 'soun' ? ` avg ${avg} B, max ${max} B` : ''}`;
  });
  return { mb: Math.round(total / 104857.6) / 10, tracks };
}

Deno.serve(async (req) => {
  const key = req.headers.get('x-sync-key') ?? '';
  const ok = await fetch(`${SB_URL}/rest/v1/rpc/football_sync_key_ok`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ k: key }) })
    .then(r => r.json()).catch(() => false);
  if (!key || ok !== true) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const out: any[] = [];
  const one = async (label: string, url: string, headers: Record<string, string> = {}) => {
    try { out.push({ file: label, ...(await probe(url, headers)) }); } catch (e) { out.push({ file: label, error: String((e as Error).message ?? e) }); }
  };
  for (const p of body.paths ?? []) await one(p, `${SB_URL}/storage/v1/object/videos/${p.split('/').map(encodeURIComponent).join('/')}`, AUTH);
  for (const id of body.drive ?? []) await one('drive:' + id, `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`);
  return Response.json({ ok: true, files: out });
});
