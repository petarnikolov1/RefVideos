// ebfu-probe: a one-off reader of ebfu.net (БФС Електронно първенство) pages, to see how its matches and squad lists
// are built. Only ebfu.net addresses, only with the sync key. Body: { url, offset?, max?, method?, form?, json? }.
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; } })();
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || SECRET || '';
const AUTH: Record<string, string> = SB_KEY.startsWith('sb_secret_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

Deno.serve(async (req) => {
  const key = req.headers.get('x-sync-key') ?? '';
  const ok = await fetch(`${SB_URL}/rest/v1/rpc/football_sync_key_ok`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ k: key }) })
    .then(r => r.json()).catch(() => false);
  if (!key || ok !== true) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const url = String(b.url ?? '');
  if (!/^https:\/\/(www\.)?ebfu\.net\//.test(url)) return Response.json({ ok: false, error: 'ebfu.net only' }, { status: 400 });
  try {
    const init: RequestInit = { method: b.method ?? 'GET', headers: { 'User-Agent': UA, 'Accept-Language': 'bg-BG,bg;q=0.9', Accept: '*/*', ...(b.headers ?? {}) }, signal: AbortSignal.timeout(20000) };
    if (b.form) { init.body = new URLSearchParams(b.form); (init.headers as any)['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (b.json) { init.body = JSON.stringify(b.json); (init.headers as any)['Content-Type'] = 'application/json'; }
    // a first request whose cookies (the PHP session) go with the main one: { first: { url, form } }
    if (b.first) {
      const f0 = await fetch(String(b.first.url), { method: 'POST', redirect: 'manual', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(b.first.form ?? {}), signal: AbortSignal.timeout(20000) });
      await f0.text();
      const jar = (f0.headers.getSetCookie?.() ?? [f0.headers.get('set-cookie') ?? '']).map(c => c.split(';')[0]).filter(Boolean).join('; ');
      if (jar) (init.headers as any).Cookie = jar;
    }
    const r = await fetch(url, init);
    let text = await r.text();
    // compact: no comments, scripts or styles, only the attributes that say what a thing is, whitespace collapsed
    if (b.compact) text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>/g, (m, tag, attrs, sl) => '<' + tag + (attrs.match(/\s(?:class|id|name|value|src|colspan|rowspan|onclick)="[^"]*"/g) || []).join('') + sl + '>')
      .replace(/\s+/g, ' ').replace(/> </g, '><');
    if (b.grep) { const re = new RegExp(b.grep, 'g'); text = [...text.matchAll(re)].map(m => m.slice(1).join(' | ') || m[0]).join('\n'); }
    const off = Number(b.offset) || 0, max = Math.min(Number(b.max) || 60000, 200000);
    return Response.json({ ok: true, status: r.status, type: r.headers.get('content-type'), final: r.url, length: text.length, text: text.slice(off, off + max) });
  } catch (e) { return Response.json({ ok: false, error: String((e as Error).message ?? e) }); }
});
