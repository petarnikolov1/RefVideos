// The video player of BG Referee Watch: full screen, one clip after another, zoom, slow motion and frame by frame.
// A plain script: the page loads it as window.VPlayer.
//
//   VPlayer.open({ items, index, details, onChange, onClose })   plays items[index]; the next ones follow on their own
//   VPlayer.update(items)            the same queue with fresh data (a deleted clip leaves it, signed links change)
//   VPlayer.close(), isOpen(), current(), refreshDetails(), root
//   VPlayer.thumb(item) → Promise<url>   a picture for the gallery: the item's own (Google Drive, YouTube), or a frame
//                                     of the file, kept in this browser
//   VPlayer.duration(id)             a clip's length once it is known (kept in this browser)
//   VPlayer.watch(container)         muted previews of the tiles [data-vprev]: on hover with a mouse, the tile in the
//                                     middle of the screen on a phone
//
// item: { id, title, kind: 'file' | 'yt' | 'embed' | 'link', src, cors, poster, posterBig, fallback, href, host, thumbKey, ytid, msg,
//         heavy (a big original: not previewed or got ready ahead on a phone's mobile data) }
//   file   a video file the page plays itself: everything works (an uploaded clip, a Google Drive file)
//   yt     YouTube, through its player API: speed (0.25–2×), the end of the clip, zoom
//   embed  another site's player in a frame: zoom only
//   link   a page that can't be shown here: a button to open it
(function () {
  'use strict';
  const FPS = 25;                                      // a frame step: TV pictures in Europe are 25 a second
  const RATES = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const ZMAX = 8;
  const K = { rate: 'bgRefWatch.vrate', auto: 'bgRefWatch.vauto', vol: 'bgRefWatch.vvol', thumbs: 'bgRefWatch.vthumbs', dur: 'bgRefWatch.vdur', side: 'bgRefWatch.vside' };
  const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0'); };
  const fmtFine = s => fmt(s) + '.' + String(Math.floor((s % 1) * 10));
  const rateLabel = r => (r === 0.1 ? '0.1' : String(r)) + '×';
  const hoverable = () => window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lowData = () => { const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g|3g/.test(c.effectiveType || ''))); };
  const wifi = () => { const c = navigator.connection; return !!(c && /wifi|ethernet/.test(c.type || '')); };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>'),
    pause: svg('<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>'),
    prev: svg('<path d="M6 6h2.2v12H6zM9.6 12 18 18V6z"/>'),
    next: svg('<path d="M15.8 6H18v12h-2.2zM6 18l8.4-6L6 6z"/>'),
    fback: svg('<path d="M14.5 6.5 9 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6h2v12h-2z"/>'),
    ffwd: svg('<path d="M9.5 6.5 15 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 6h2v12H5z"/>'),
    zin: svg('<path d="M10.5 4a6.5 6.5 0 0 1 5.18 10.43l4.2 4.2-1.42 1.41-4.2-4.2A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm-1 1.75h2v1.75h1.75v2H11.5v1.75h-2V11.5H7.75v-2H9.5z"/>'),
    zout: svg('<path d="M10.5 4a6.5 6.5 0 0 1 5.18 10.43l4.2 4.2-1.42 1.41-4.2-4.2A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm-2.75 3.5h5.5v2h-5.5z"/>'),
    loop: svg('<path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/>'),
    auto: svg('<path d="M3 6h11v2H3zm0 4h11v2H3zm0 4h7v2H3zm13-4v8l6-4z"/>'),
    vol: svg('<path d="M4 9v6h4l5 4V5L8 9zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>'),
    mute: svg('<path d="M4 9v6h4l5 4V5L8 9zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>'),
    fs: svg('<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/>'),
    fsx: svg('<path d="M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/>'),
    close: svg('<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>'),
    info: svg('<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 7h2v6h-2zm0-4h2v2h-2z"/>'),
    list: svg('<path d="M3 5h12v2H3zm0 4h12v2H3zm0 4h8v2H3zm14 0v6l5-3z"/>'),
    reset: svg('<path d="M12 5a7 7 0 1 1-6.93 8h2.02A5 5 0 1 0 12 7v3L7.5 6 12 2z"/>'),
    ext: svg('<path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H7v10h10v-4h2v6H5z"/>'),
  };

  /* ───────────── styles ───────────── */
  const CSS = `
  .vp{position:fixed;inset:0;z-index:1000;background:#000;color:#f2f4f7;display:flex;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    -webkit-tap-highlight-color:transparent;--vpa:#2dd4bf;
    --bg:#0b0d10;--card:#15181d;--text:#e7e9ec;--muted:#98a1ad;--line:#272c34;--chip:#20252d;--accent:#2dd4bf;--accent-ink:#06201d;--ok:#4ade80;--err:#f97066;color-scheme:dark}
  .vp[hidden],.vp [hidden]{display:none !important}
  .vp *{box-sizing:border-box}
  .vp-main{display:flex;flex:1;min-width:0;min-height:0}
  .vp-stage{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;outline:none}
  .vp-layer{position:absolute;inset:0;transform-origin:0 0}
  .vp-layer>video,.vp-layer iframe,.vp-layer>.vp-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
  .vp-layer>video{object-fit:contain}
  .vp-layer>.vp-poster{position:absolute;inset:0;background:#000 center/contain no-repeat;transition:opacity .3s}
  .vp-shield{position:absolute;inset:0}
  .vp-shield.off{pointer-events:none}
  .vp-btn{appearance:none;border:0;background:transparent;color:inherit;width:42px;height:42px;border-radius:50%;display:inline-grid;place-items:center;cursor:pointer;padding:0;flex:0 0 auto;font:inherit}
  .vp-btn:hover{background:rgba(255,255,255,.14)}
  .vp-btn:focus-visible{outline:2px solid var(--vpa);outline-offset:-2px}
  .vp-btn svg{width:24px;height:24px;fill:currentColor}
  .vp-btn.on{color:var(--vpa)}
  .vp-btn[disabled]{opacity:.3;cursor:default;background:transparent}
  .vp-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:4px;padding:8px 8px 30px;
    background:linear-gradient(rgba(0,0,0,.72),rgba(0,0,0,0));transition:opacity .25s;z-index:3}
  .vp-title{flex:1;min-width:0;font-weight:600;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px;text-shadow:0 1px 3px rgba(0,0,0,.6)}
  .vp-pos{opacity:.7;font-size:12.5px;font-variant-numeric:tabular-nums;padding:0 6px;white-space:nowrap}
  .vp-ctrl{position:absolute;left:0;right:0;bottom:0;padding:34px 6px max(6px,env(safe-area-inset-bottom));background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.78));transition:opacity .25s;z-index:3}
  .vp-row{display:flex;align-items:center;gap:0}
  .vp-time{font-size:13px;font-variant-numeric:tabular-nums;margin:0 8px;white-space:nowrap;opacity:.92}
  .vp-gap{flex:1}
  .vp-rate{width:auto;min-width:48px;padding:0 10px;border-radius:21px;font-weight:700;font-size:13.5px;letter-spacing:.2px}
  .vp-rate.slow{background:var(--vpa);color:#04201c}
  .vp-rate.slow:hover{background:#5eead4}
  .vp-seek{position:relative;height:22px;margin:0 8px 2px;cursor:pointer;touch-action:none}
  .vp-tr{position:absolute;left:0;right:0;top:9px;height:4px;border-radius:2px;background:rgba(255,255,255,.24);overflow:hidden;transition:top .12s,height .12s}
  .vp-seek:hover .vp-tr,.vp-seek.drag .vp-tr{top:8px;height:6px}
  .vp-buf,.vp-played{position:absolute;left:0;top:0;bottom:0;width:0}
  .vp-buf{background:rgba(255,255,255,.32)} .vp-played{background:var(--vpa)}
  .vp-knob{position:absolute;top:5px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--vpa);transform:scale(0);transition:transform .12s;box-shadow:0 0 0 3px rgba(45,212,191,.25)}
  .vp-seek:hover .vp-knob,.vp-seek.drag .vp-knob,.vp-seek:focus-visible .vp-knob{transform:scale(1)}
  .vp-seek:focus-visible{outline:none}
  .vp-tip{position:absolute;bottom:24px;transform:translateX(-50%);background:rgba(10,12,15,.92);padding:2px 7px;border-radius:5px;font-size:12px;font-variant-numeric:tabular-nums;pointer-events:none;display:none;white-space:nowrap}
  .vp-seek:hover .vp-tip,.vp-seek.drag .vp-tip{display:block}
  .vp-top,.vp-ctrl{pointer-events:none}
  .vp-top>*,.vp-ctrl>.vp-row>*,.vp-ctrl>.vp-seek{pointer-events:auto}
  .vp-ctrl>.vp-row>.vp-gap,.vp-top>.vp-title,.vp-top>.vp-pos{pointer-events:none}
  .vp.idle .vp-top,.vp.idle .vp-ctrl,.vp.idle .vp-menu{opacity:0;pointer-events:none}
  .vp.idle .vp-top *,.vp.idle .vp-ctrl *{pointer-events:none !important}
  .vp.idle .vp-stage{cursor:none}
  .vp-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:22px;z-index:2;pointer-events:none;transition:opacity .25s}
  .vp-center>*{pointer-events:auto}
  .vp.idle .vp-center .vp-big{opacity:0;pointer-events:none}
  .vp.zoomed .vp-center{display:none}
  .vp-big{width:72px;height:72px;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
  .vp-big svg{width:38px;height:38px}
  .vp-big.sm{width:52px;height:52px} .vp-big.sm svg{width:28px;height:28px}
  .vp-big:hover{background:rgba(0,0,0,.7)}
  .vp-spin{width:46px;height:46px;border:4px solid rgba(255,255,255,.22);border-top-color:#fff;border-radius:50%;animation:vpspin .9s linear infinite;pointer-events:none}
  @keyframes vpspin{to{transform:rotate(360deg)}}
  .vp-flash{position:absolute;left:50%;top:16%;transform:translateX(-50%);background:rgba(0,0,0,.62);padding:6px 14px;border-radius:20px;font-weight:700;font-size:14px;
    opacity:0;transition:opacity .25s;pointer-events:none;z-index:4;white-space:nowrap}
  .vp-flash.on{opacity:1}
  .vp-badges{position:absolute;right:10px;top:58px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;z-index:3}
  .vp-badge{display:flex;align-items:center;gap:2px;background:rgba(0,0,0,.62);border-radius:18px;padding:0 0 0 11px;font-weight:700;font-size:13px;height:34px}
  .vp-badge .vp-btn{width:34px;height:34px}
  .vp-badge .vp-btn svg{width:19px;height:19px}
  .vp-badge.rate{padding:0 11px;color:#04201c;background:var(--vpa)}
  .vp-menu{position:absolute;right:8px;bottom:70px;background:rgba(18,20,24,.97);border:1px solid #2a2f37;border-radius:14px;padding:8px;z-index:5;box-shadow:0 8px 28px rgba(0,0,0,.5);width:236px}
  .vp-menu h4{margin:2px 4px 8px;font-size:12px;font-weight:600;color:#98a1ad;text-transform:uppercase;letter-spacing:.6px}
  .vp-menu .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
  .vp-menu button{appearance:none;border:1px solid #2a2f37;background:#1b1f25;color:#e7e9ec;border-radius:9px;height:36px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;padding:0}
  .vp-menu button.on{background:var(--vpa);border-color:var(--vpa);color:#04201c}
  .vp-menu button.slowk{border-color:#2f5f5a}
  .vp-menu p{margin:8px 4px 2px;font-size:12px;color:#98a1ad}
  .vp-nextc{position:absolute;left:14px;bottom:86px;max-width:min(78%,460px);background:rgba(10,12,15,.82);border-radius:12px;padding:8px 14px;z-index:4;
    opacity:0;transform:translateY(10px);transition:opacity .3s,transform .3s;pointer-events:none}
  .vp-nextc.on{opacity:1;transform:none}
  .vp-nextc small{display:block;color:#98a1ad;font-size:11.5px;text-transform:uppercase;letter-spacing:.6px}
  .vp-nextc b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vp-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(88%,440px);text-align:center;background:rgba(14,16,20,.92);border:1px solid #2a2f37;border-radius:14px;padding:18px;z-index:4}
  .vp-msg p{margin:0 0 12px;color:#cbd2da}
  .vp-msg .acts{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .vp-a{display:inline-flex;align-items:center;gap:6px;border-radius:10px;padding:9px 14px;background:var(--vpa);color:#04201c;font-weight:700;text-decoration:none;border:0;cursor:pointer;font:inherit;font-weight:700}
  .vp-a.sec{background:#232830;color:#e7e9ec}
  .vp-a svg{width:18px;height:18px;fill:currentColor}
  .vp-note{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);background:rgba(10,12,15,.85);border-radius:10px;padding:6px 12px;font-size:12.5px;color:#cbd2da;z-index:4;max-width:90%;text-align:center}
  .vp-side{width:372px;flex:0 0 372px;background:#0f1114;border-left:1px solid #20242b;display:flex;flex-direction:column;min-height:0;color:var(--text)}
  .vp.noside .vp-side{display:none}
  .vp-head{padding:14px 14px 4px}
  .vp-head h2{margin:0;font-size:16.5px;line-height:1.3}
  .vp-tabs{display:flex;gap:6px;padding:10px 12px 8px;border-bottom:1px solid #20242b}
  .vp-tabs button{flex:1;appearance:none;border:0;border-radius:9px;background:transparent;color:#98a1ad;font:inherit;font-weight:600;font-size:13.5px;padding:7px 8px;cursor:pointer}
  .vp-tabs button.on{background:#1d2128;color:#f2f4f7}
  .vp-pane{flex:1;overflow:auto;padding:10px 12px 18px;overscroll-behavior:contain}
  .vp-auto{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 4px 10px;font-size:13px;color:#cbd2da;cursor:pointer}
  .vp-sw{position:relative;width:38px;height:22px;border-radius:11px;background:#353b45;flex:0 0 auto;transition:background .2s}
  .vp-sw::after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
  .vp-auto.on .vp-sw{background:var(--vpa)} .vp-auto.on .vp-sw::after{transform:translateX(16px)}
  .vp-q{list-style:none;margin:0;padding:0}
  .vp-qi{display:flex;gap:10px;align-items:center;padding:6px;border-radius:10px;cursor:pointer;width:100%;appearance:none;border:0;background:transparent;color:inherit;font:inherit;text-align:left}
  .vp-qi:hover{background:#171a20}
  .vp-qi.on{background:#1b2a2a}
  .vp-qi .th{position:relative;width:118px;flex:0 0 118px;aspect-ratio:16/9;border-radius:7px;background:#1b1f25 center/cover no-repeat;overflow:hidden}
  .vp-qi .th i{position:absolute;right:4px;bottom:4px;font-style:normal;font-size:11px;font-weight:700;background:rgba(0,0,0,.75);padding:0 4px;border-radius:3px}
  .vp-qi.on .th::after{content:"";position:absolute;inset:0;border:2px solid var(--vpa);border-radius:7px}
  .vp-qi .tt{font-size:13.5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .vp-qi .n{font-size:11.5px;color:#7d8794;width:16px;text-align:center;flex:0 0 16px;font-variant-numeric:tabular-nums}
  .vp-qi.skip .tt{color:#98a1ad}
  .vp-info{font-size:14px}
  /* phones and narrow windows: the picture on top, the list under it */
  .vp.col .vp-main{flex-direction:column}
  .vp.col .vp-stage{flex:0 0 auto;height:var(--sh,56vw)}
  .vp.col .vp-side{width:auto;flex:1 1 auto;border-left:0;border-top:1px solid #20242b}
  .vp-head{display:none}
  .vp.col .vp-head{display:block}
  .vp.col .vp-ctrl{padding-top:16px} .vp.col .vp-top{padding-bottom:14px}
  /* a phone on its side, or full screen: only the picture; the list slides in over it */
  .vp.full .vp-side{position:absolute;right:0;top:0;bottom:0;width:min(372px,88vw);z-index:6;box-shadow:-10px 0 30px rgba(0,0,0,.5);transform:translateX(105%);transition:transform .25s;display:flex}
  .vp.full.sideon .vp-side{transform:none}
  .vp.full.noside .vp-side{display:flex}
  .vp .hide-s{display:inline-grid}
  .vp.col [data-a="side"]{display:none}
  @media (max-width:560px){ .vp .hide-s{display:none} .vp-btn{width:40px;height:40px} .vp-time{margin:0 4px;font-size:12.5px} .vp-title{font-size:14.5px} }
  .vp .when-paused{display:none} .vp.paused .when-paused{display:inline-grid} .vp.paused .when-playing{display:none}
  @media (max-width:560px){ .vp.paused .hide-paused-s{display:none} }
  .vp-kbd{color:#98a1ad;font-size:12px;margin:14px 4px 0;line-height:1.7}
  .vp-kbd kbd{display:inline-block;min-width:20px;padding:0 5px;border:1px solid #333a44;border-bottom-width:2px;border-radius:5px;background:#171a20;color:#e7e9ec;font:600 11.5px/18px system-ui;text-align:center}
  /* the gallery's previews */
  .vprev{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s;pointer-events:none;background:#000}
  .vprev.on{opacity:1}
  `;

  /* ───────────── the player's parts ───────────── */
  let R, ST, LAYER, POSTER, FRAME, SHIELD, CENTER, FLASH, BADGES, MENU, NEXTC, MSG, NOTE, SIDE, PANE, TITLE, POS, SEEK, BUF, PLAYED, KNOB, TIP, TIME;
  const V = [];
  let items = [], idx = 0, opt = {}, mode = '', cur = 0, tab = 'queue';
  let rate = 1, auto = load(K.auto) !== false, loop = false, vol = load(K.vol) || { v: 1, m: false };
  let sideWanted = load(K.side) !== false, sideOpen = false;
  let z = { s: 1, x: 0, y: 0 }, ar = 16 / 9;
  let yt = null, ytReady = null, ytTime = 0, ytDur = 0, ytState = -1;
  let idleT = 0, flashT = 0, nextT = 0, noteT = 0, loadT = 0, raf = 0, wasPlaying = false, failed = false, opener = null;
  const DUR = load(K.dur) || {};

  (() => { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); })();
  function build(){
    if (R) return;
    R = document.createElement('div');
    R.className = 'vp'; R.hidden = true;
    R.setAttribute('role', 'dialog'); R.setAttribute('aria-modal', 'true'); R.setAttribute('aria-label', 'Видео');
    R.innerHTML = `<div class="vp-main">
      <div class="vp-stage" tabindex="-1">
        <div class="vp-layer"><div class="vp-poster"></div><video playsinline preload="auto"></video><video playsinline preload="auto" hidden></video><div class="vp-frame" hidden></div></div>
        <div class="vp-shield"></div>
        <div class="vp-center"><button class="vp-btn vp-big sm" data-a="prev" aria-label="Предишно">${IC.prev}</button><button class="vp-btn vp-big" data-a="toggle" aria-label="Пусни">${IC.play}</button><button class="vp-btn vp-big sm" data-a="next" aria-label="Следващо">${IC.next}</button></div>
        <div class="vp-flash" aria-live="polite"></div>
        <div class="vp-badges"></div>
        <div class="vp-nextc"></div>
        <div class="vp-top">
          <button class="vp-btn" data-a="close" aria-label="Затвори" title="Затвори (Esc)">${IC.close}</button>
          <div class="vp-title"></div><span class="vp-pos"></span>
          <button class="vp-btn" data-a="info" aria-label="Детайли" title="Детайли (I)">${IC.info}</button>
          <button class="vp-btn" data-a="side" aria-label="Списък" title="Списък">${IC.list}</button>
        </div>
        <div class="vp-ctrl">
          <div class="vp-seek" role="slider" tabindex="0" aria-label="Позиция" aria-valuemin="0"><div class="vp-tr"><div class="vp-buf"></div><div class="vp-played"></div></div><div class="vp-knob"></div><div class="vp-tip"></div></div>
          <div class="vp-row">
            <button class="vp-btn" data-a="toggle" aria-label="Пусни / спри" title="Пусни / спри (интервал)">${IC.play}</button>
            <button class="vp-btn when-paused" data-a="fback" aria-label="Кадър назад" title="Кадър назад (,)">${IC.fback}</button>
            <button class="vp-btn when-paused" data-a="ffwd" aria-label="Кадър напред" title="Кадър напред (.)">${IC.ffwd}</button>
            <button class="vp-btn hide-paused-s" data-a="prev" aria-label="Предишно" title="Предишно (P)">${IC.prev}</button>
            <button class="vp-btn hide-paused-s" data-a="next" aria-label="Следващо" title="Следващо (N)">${IC.next}</button>
            <span class="vp-time"></span>
            <span class="vp-gap"></span>
            <button class="vp-btn vp-rate" data-a="rate" aria-label="Скорост" title="Скорост ([ ])">1×</button>
            <button class="vp-btn hide-s" data-a="zout" aria-label="Намали" title="Намали (−)">${IC.zout}</button>
            <button class="vp-btn hide-s" data-a="zin" aria-label="Увеличи" title="Увеличи (+)">${IC.zin}</button>
            <button class="vp-btn" data-a="loop" aria-label="Повтаряй клипа" title="Повтаряй клипа (L)">${IC.loop}</button>
            <button class="vp-btn hide-s" data-a="auto" aria-label="Пускай следващото" title="Пускай следващото (A)">${IC.auto}</button>
            <button class="vp-btn hide-s" data-a="mute" aria-label="Звук" title="Звук (M)">${IC.vol}</button>
            <button class="vp-btn" data-a="fs" aria-label="Цял екран" title="Цял екран (F)">${IC.fs}</button>
          </div>
        </div>
        <div class="vp-menu" hidden></div>
      </div>
      <aside class="vp-side">
        <div class="vp-head"><h2></h2></div>
        <div class="vp-tabs" role="tablist"><button data-tab="queue" role="tab">Следващи</button><button data-tab="info" role="tab">Детайли</button></div>
        <div class="vp-pane"></div>
      </aside></div>`;
    document.body.appendChild(R);
    const q = s => R.querySelector(s);
    ST = q('.vp-stage'); LAYER = q('.vp-layer'); POSTER = q('.vp-poster'); FRAME = q('.vp-frame'); SHIELD = q('.vp-shield'); CENTER = q('.vp-center');
    FLASH = q('.vp-flash'); BADGES = q('.vp-badges'); MENU = q('.vp-menu'); NEXTC = q('.vp-nextc'); SIDE = q('.vp-side'); PANE = q('.vp-pane');
    TITLE = q('.vp-title'); POS = q('.vp-pos'); SEEK = q('.vp-seek'); BUF = q('.vp-buf'); PLAYED = q('.vp-played'); KNOB = q('.vp-knob'); TIP = q('.vp-tip'); TIME = q('.vp-time');
    V.push(...R.querySelectorAll('.vp-layer>video'));
    V.forEach(bindVideo);
    R.addEventListener('click', onClick);
    R.addEventListener('pointermove', poke, { passive: true });
    document.addEventListener('keydown', e => { if (R && !R.hidden) onKey(e); });
    bindGestures();
    bindSeek();
    window.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', () => { layout(); paintButtons(); });
    document.addEventListener('webkitfullscreenchange', () => { layout(); paintButtons(); });
  }

  /* ───────────── what is playing ───────────── */
  const it = () => items[idx];
  const playable = x => x && x.kind !== 'link';
  const vid = () => V[cur];
  function mPlay(){
    if (mode === 'file') {
      const v = vid(), p = v.play();
      if (p && p.catch) p.catch(e => {
        if (!e || e.name !== 'NotAllowedError' || v !== vid()) return;
        const o = V[1 - cur];
        if (!v.dataset.ok && o.dataset.ok) {
          o.pause(); o.crossOrigin = v.crossOrigin; if (!v.crossOrigin) o.removeAttribute('crossorigin');
          o.dataset.src = v.dataset.src; o.dataset.id = v.dataset.id; o.src = v.getAttribute('src');
          v.pause(); v.hidden = true; o.hidden = false; cur = 1 - cur; applyVol(); applyRate();
          const p2 = o.play(); if (p2 && p2.catch) p2.catch(() => { paint(); poke(); });
        } else { paint(); poke(); }
      });
    }
    else if (mode === 'yt' && yt && yt.playVideo) yt.playVideo();
  }
  function mPause(){ if (mode === 'file') vid().pause(); else if (mode === 'yt' && yt && yt.pauseVideo) yt.pauseVideo(); }
  function mPaused(){ if (mode === 'file') return vid().paused; if (mode === 'yt') return ytState !== 1 && ytState !== 3; return true; }
  function mTime(){ if (mode === 'file') return vid().currentTime || 0; if (mode === 'yt') return ytTime; return 0; }
  function mDur(){ if (mode === 'file') { const d = vid().duration; return isFinite(d) ? d : 0; } if (mode === 'yt') return ytDur; return 0; }
  function mSeek(t){
    t = clamp(t, 0, mDur() || 0);
    if (mode === 'file') vid().currentTime = t;
    else if (mode === 'yt' && yt && yt.seekTo) { yt.seekTo(t, true); ytTime = t; }
  }
  function mBuffered(){
    if (mode === 'yt' && yt && yt.getVideoLoadedFraction) try { return yt.getVideoLoadedFraction() || 0; } catch (e) { return 0; }
    if (mode !== 'file') return 0;
    const v = vid(), b = v.buffered, t = v.currentTime, d = mDur();
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) >= t) return d ? b.end(i) / d : 0;
    return 0;
  }
  function applyRate(){
    if (mode === 'file') { const v = vid(); try { v.playbackRate = rate; } catch (e) { rate = 0.25; v.playbackRate = rate; } v.preservesPitch = rate >= 0.5; }
    else if (mode === 'yt' && yt && yt.setPlaybackRate) {
      const avail = (yt.getAvailablePlaybackRates && yt.getAvailablePlaybackRates()) || [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
      yt.setPlaybackRate(avail.reduce((a, b) => Math.abs(b - rate) < Math.abs(a - rate) ? b : a, 1));
    }
  }
  function applyVol(){
    V.forEach(v => { v.muted = vol.m; v.volume = vol.v; });
    if (mode === 'yt' && yt && yt.mute) vol.m ? yt.mute() : yt.unMute();
  }
  const canRate = () => mode === 'file' || mode === 'yt';
  const canFrames = () => mode === 'file';

  function bindVideo(v){
    const mine = () => v === vid() && mode === 'file';
    v.addEventListener('loadedmetadata', () => {
      if (v.dataset.id) { const d = v.duration; if (isFinite(d) && d > 0 && DUR[v.dataset.id] !== Math.round(d)) { DUR[v.dataset.id] = Math.round(d); save(K.dur, DUR); } }
      if (!mine()) return;
      if (!v.videoWidth) { fail('codec'); return; }
      ar = v.videoWidth / v.videoHeight || 16 / 9;
      clearTimeout(loadT); layout(); paint();
    });
    v.addEventListener('loadeddata', () => { if (mine()) { POSTER.style.opacity = 0; paint(); } });
    v.addEventListener('playing', () => { v.dataset.ok = '1'; if (mine()) { POSTER.style.opacity = 0; paint(); idle(); preloadNext(); } });
    v.addEventListener('pause', () => { if (mine()) { paint(); poke(); } });
    v.addEventListener('waiting', () => { if (mine()) paint(); });
    v.addEventListener('canplay', () => { if (mine()) paint(); });
    v.addEventListener('ended', () => { if (mine()) ended(); });
    v.addEventListener('error', () => { if (mine() && v.getAttribute('src')) fail('error'); });
    v.addEventListener('ratechange', () => { if (mine()) paintButtons(); });
  }

  // what a clip that can't be played here becomes: the source's own player (Google Drive), or a link
  function fail(why){
    const x = it();
    if (failed || !x) return;
    failed = true;
    clearTimeout(loadT);
    const v = vid(); v.pause(); v.removeAttribute('src'); delete v.dataset.src; try { v.load(); } catch (e) {}
    if (x.fallback) {
      showEmbed(x.fallback);
      note('Този клип се пуска в плейъра на Google Drive: без забавяне и кадър по кадър.');
      return;
    }
    mode = 'none';
    message(`${why === 'codec' ? 'Браузърът не може да покаже този видео формат.' : 'Видеото не може да се пусне тук.'}`, x.href);
  }

  function message(text, href){
    clearMsg();
    MSG = document.createElement('div');
    MSG.className = 'vp-msg';
    MSG.innerHTML = `<p>${esc(text)}</p><div class="acts">${href ? `<a class="vp-a" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${IC.ext} Отвори</a>` : ''}
      ${items.length > 1 ? '<button class="vp-a sec" data-a="next">Следващо</button>' : ''}</div>`;
    ST.appendChild(MSG);
    paint();
  }
  const clearMsg = () => { if (MSG) { MSG.remove(); MSG = null; } };
  function note(t, ms = 5000){
    if (!NOTE) { NOTE = document.createElement('div'); NOTE.className = 'vp-note'; ST.appendChild(NOTE); }
    NOTE.textContent = t; NOTE.hidden = false; NOTE.onclick = null;
    clearTimeout(noteT); noteT = setTimeout(() => { if (NOTE) NOTE.hidden = true; }, ms);
  }

  function showEmbed(src){
    V.forEach(v => { v.pause(); v.hidden = true; });
    mode = 'embed';
    FRAME.hidden = false;
    FRAME.innerHTML = `<iframe src="${esc(src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    POSTER.style.opacity = 0;
    SHIELD.classList.toggle('off', z.s === 1);
    paint();
  }

  // YouTube: its player API, without its own controls, so the speed, the end of the clip and zoom work like the rest
  function ytApi(){
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytReady) return ytReady;
    ytReady = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) {} res(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
      s.onerror = () => { ytReady = null; rej(new Error('YouTube')); };
      document.head.appendChild(s);
    });
    return ytReady;
  }
  function showYT(x){
    V.forEach(v => { v.pause(); v.hidden = true; });
    mode = 'yt'; ytTime = 0; ytDur = 0; ytState = -1;
    FRAME.hidden = false; FRAME.innerHTML = '<div></div>';
    const host = FRAME.firstChild, my = x;
    ytApi().then(() => {
      if (it() !== my) return;
      yt = new window.YT.Player(host, { videoId: x.ytid, width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0, origin: location.origin },
        events: {
          onReady: () => { if (it() !== my) return; applyRate(); applyVol(); ytDur = yt.getDuration() || 0; yt.playVideo(); paint(); },
          onStateChange: e => { if (it() !== my) return; ytState = e.data; if (e.data === 1) { POSTER.style.opacity = 0; idle(); } if (e.data === 0) ended(); paint(); poke(); },
          onError: () => { if (it() === my) { mode = 'none'; message('YouTube не пусна това видео тук.', x.href); } },
        } });
    }).catch(() => { if (it() === my) { mode = 'none'; message('YouTube не се зареди.', x.href); } });
  }
  function ytTick(){
    if (mode !== 'yt' || !yt || !yt.getCurrentTime) return;
    try { ytTime = yt.getCurrentTime() || 0; ytDur = yt.getDuration() || ytDur; } catch (e) {}
  }

  function show(i, how){
    if (!items.length) return;
    idx = clamp(i, 0, items.length - 1);
    const x = it();
    failed = false; clearMsg(); if (NOTE) NOTE.hidden = true;
    clearTimeout(loadT); hideMenu();
    resetZoom(true);
    if (yt) { try { yt.destroy(); } catch (e) {} yt = null; }
    FRAME.innerHTML = ''; FRAME.hidden = true;
    SHIELD.classList.remove('off');
    ar = 16 / 9;
    POSTER.style.backgroundImage = x.posterBig || x.poster ? `url("${(x.posterBig || x.poster).replace(/"/g, '%22')}")` : 'none';
    POSTER.style.opacity = 1;
    TITLE.textContent = x.title || '';
    R.querySelector('.vp-head h2').textContent = x.title || '';
    POS.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
    if (x.kind === 'file') {
      mode = 'file';
      // the clip that was got ready while the one before it played starts straight away
      let k = V.findIndex(v => v.dataset.src === x.src && v.getAttribute('src') && !v.error);
      if (k < 0) k = V[cur].paused || V[cur].ended ? cur : 1 - cur;
      const other = V[1 - k];
      other.pause(); other.hidden = true;
      cur = k;
      const v = V[cur];
      v.hidden = false;
      if (v.dataset.src !== x.src || !v.getAttribute('src')) {
        v.crossOrigin = x.cors ? 'anonymous' : null;
        if (!x.cors) v.removeAttribute('crossorigin');
        v.dataset.src = x.src; v.dataset.id = x.id;
        v.preload = 'auto';
        v.src = x.src;
      } else if (v.ended || v.currentTime > 0.5 && how !== 'auto') v.currentTime = 0;
      if (v.readyState >= 1 && v.videoWidth) { ar = v.videoWidth / v.videoHeight; layout(); }
      applyVol(); applyRate();
      mPlay();
      // a slow start: Google Drive's own player is offered
      loadT = setTimeout(() => {
        if (it() !== x || mode !== 'file' || vid().readyState >= 2 || !x.fallback || failed) return;
        note('Зарежда бавно… Докоснете тук, за да го пуснете в плейъра на Google Drive.', 15000);
        NOTE.onclick = () => { NOTE.onclick = null; NOTE.hidden = true; fail('slow'); };
      }, 9000);
    } else if (x.kind === 'yt') showYT(x);
    else if (x.kind === 'embed') { showEmbed(x.src); note('Плейърът на източника: увеличението работи, скоростта — в неговите настройки.', 4500); }
    else { V.forEach(v => { v.pause(); v.hidden = true; }); mode = 'none'; message(x.msg || (x.host ? `Видеото е в ${x.host}.` : 'Видеото е на друг сайт.'), x.href); }
    if (how === 'auto') nextCard(x); else { clearTimeout(nextT); NEXTC.classList.remove('on'); }
    drawSide();
    paint(); poke();
    media(x);
    if (opt.onChange) try { opt.onChange(x); } catch (e) {}
  }

  // the next clip is got ready in the other <video> while this one plays, so it starts without a wait
  function preloadNext(){
    const n = nextIndex(1);
    if (n < 0 || lowData()) return;
    const x = items[n];
    if (!x || x.kind !== 'file' || (x.heavy && !hoverable() && !wifi())) return;
    const o = V[1 - cur];
    if (o.dataset.src === x.src && o.getAttribute('src')) return;
    o.crossOrigin = x.cors ? 'anonymous' : null;
    if (!x.cors) o.removeAttribute('crossorigin');
    o.dataset.src = x.src; o.dataset.id = x.id;
    o.preload = 'auto'; o.muted = true;
    o.src = x.src;
    o.load();
  }
  function nextIndex(step){
    for (let k = 1; k <= items.length; k++) {
      const j = idx + step * k;
      if (j < 0 || j >= items.length) return -1;
      if (playable(items[j])) return j;
    }
    return -1;
  }
  function go(step, how){
    const j = how === 'auto' ? nextIndex(step) : idx + step;
    if (j < 0 || j >= items.length) { if (how === 'auto') { paint(); poke(); } return; }
    show(j, how);
  }
  function ended(){
    if (loop) { mSeek(0); mPlay(); return; }
    if (auto && nextIndex(1) >= 0) { go(1, 'auto'); return; }
    paint(); poke();
  }
  function nextCard(x){
    NEXTC.innerHTML = `<small>Пуска се · ${idx + 1} / ${items.length}</small><b>${esc(x.title)}</b>`;
    NEXTC.classList.add('on');
    clearTimeout(nextT); nextT = setTimeout(() => NEXTC.classList.remove('on'), 2600);
  }

  /* ───────────── controls ───────────── */
  function paint(){
    if (!R || R.hidden) return;
    const paused = mPaused(), loading = mode === 'file' && !paused && vid().readyState < 3 && !failed;
    R.classList.toggle('paused', paused && mode !== 'embed' && mode !== 'none');
    R.querySelectorAll('[data-a="toggle"]').forEach(b => { b.innerHTML = paused ? IC.play : IC.pause; b.setAttribute('aria-label', paused ? 'Пусни' : 'Спри'); });
    const big = CENTER.querySelector('.vp-big:not(.sm)');
    big.hidden = loading || mode === 'embed' || mode === 'none' || !!MSG;
    CENTER.querySelectorAll('.vp-big.sm').forEach(b => { b.hidden = big.hidden || !paused; });
    let sp = CENTER.querySelector('.vp-spin');
    if (loading && !sp) { sp = document.createElement('div'); sp.className = 'vp-spin'; CENTER.appendChild(sp); }
    if (!loading && sp) sp.remove();
    R.querySelector('.vp-ctrl').style.visibility = mode === 'none' ? 'hidden' : '';
    paintButtons();
  }
  function paintButtons(){
    const has = j => j >= 0 && j < items.length;
    R.querySelectorAll('[data-a="prev"]').forEach(b => b.disabled = !has(idx - 1));
    R.querySelectorAll('[data-a="next"]').forEach(b => b.disabled = !has(idx + 1));
    const rb = R.querySelector('[data-a="rate"]');
    rb.textContent = rateLabel(rate); rb.classList.toggle('slow', rate < 1); rb.hidden = !canRate();
    R.querySelectorAll('[data-a="fback"],[data-a="ffwd"]').forEach(b => b.hidden = !canFrames());
    R.querySelector('[data-a="loop"]').classList.toggle('on', loop);
    R.querySelector('[data-a="auto"]').classList.toggle('on', auto);
    const mb = R.querySelector('[data-a="mute"]'); mb.innerHTML = vol.m ? IC.mute : IC.vol;
    const fsOn = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const fb = R.querySelector('[data-a="fs"]'); fb.innerHTML = fsOn ? IC.fsx : IC.fs; fb.hidden = !fsAble();
    R.querySelector('[data-a="side"]').classList.toggle('on', R.classList.contains('full') ? sideOpen : !R.classList.contains('noside'));
    SEEK.style.visibility = canRate() ? '' : 'hidden';
    TIME.style.visibility = canRate() ? '' : 'hidden';
    // what is changed from normal stays on screen: the speed and the zoom
    BADGES.innerHTML = (z.s > 1.01 ? `<div class="vp-badge">${z.s.toFixed(1)}×<button class="vp-btn" data-a="zreset" aria-label="Нормален размер" title="Нормален размер (0)">${IC.reset}</button></div>` : '')
      + (rate !== 1 && canRate() ? `<div class="vp-badge rate">${rateLabel(rate)}</div>` : '');
  }
  function tick(){
    raf = requestAnimationFrame(tick);
    if (!R || R.hidden) return;
    if (mode === 'yt') ytTick();
    const d = mDur(), t = mTime();
    if (!SEEK.classList.contains('drag')) {
      const p = d ? t / d : 0;
      PLAYED.style.width = (p * 100) + '%'; KNOB.style.left = (p * 100) + '%';
      SEEK.setAttribute('aria-valuemax', Math.round(d)); SEEK.setAttribute('aria-valuenow', Math.round(t));
      SEEK.setAttribute('aria-valuetext', fmt(t) + ' от ' + fmt(d));
    }
    BUF.style.width = (mBuffered() * 100) + '%';
    const txt = d ? `${rate < 1 || mPaused() ? fmtFine(t) : fmt(t)} / ${fmt(d)}` : '';
    if (TIME.textContent !== txt) TIME.textContent = txt;
  }
  function flash(t){
    FLASH.textContent = t; FLASH.classList.add('on');
    clearTimeout(flashT); flashT = setTimeout(() => FLASH.classList.remove('on'), 900);
  }
  function setRate(r){
    rate = r; applyRate(); paintButtons(); flash(rateLabel(r) + (r < 1 ? ' · забавено' : ''));
    if (!MENU.hidden) drawMenu();
  }
  const stepRate = d => { const i = RATES.indexOf(rate); setRate(RATES[clamp((i < 0 ? 4 : i) + d, 0, RATES.length - 1)]); };
  function frame(d){
    if (!canFrames()) return;
    mPause();
    mSeek(mTime() + d / FPS);
    flash(d < 0 ? '‹ кадър' : 'кадър ›');
  }
  function drawMenu(){
    MENU.innerHTML = `<h4>Скорост</h4><div class="grid">${RATES.filter(r => mode !== 'yt' || r >= 0.25).map(r =>
      `<button data-rate="${r}" class="${r === rate ? 'on' : ''}${r < 1 ? ' slowk' : ''}">${rateLabel(r)}</button>`).join('')}</div>
      <p>Забавен каданс: 0.25× или 0.1×. Кадър по кадър: спрете и натиснете ‹ ›.</p>`;
  }
  function hideMenu(){ if (MENU) MENU.hidden = true; }
  function toggleMenu(){ if (MENU.hidden) { drawMenu(); MENU.hidden = false; } else hideMenu(); poke(); }

  const fsAble = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function toggleFs(){
    const on = document.fullscreenElement || document.webkitFullscreenElement;
    if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const p = (R.requestFullscreen || R.webkitRequestFullscreen).call(R);
      // a phone turns the picture sideways for a wide clip
      const lock = () => { try { if (ar > 1.2 && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} };
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    }
  }

  // the controls hide themselves while a clip plays; any movement brings them back
  function poke(){
    if (!R || R.hidden) return;
    R.classList.remove('idle');
    clearTimeout(idleT);
    idle();
  }
  function idle(){
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      if (mPaused() || !MENU.hidden || SEEK.classList.contains('drag') || R.querySelector('.vp-ctrl:hover,.vp-top:hover')) return;
      R.classList.add('idle');
    }, 2600);
  }

  /* ───────────── zoom and pan ───────────── */
  // the picture's place inside the stage (a clip of another shape has black bands)
  function content(){
    const W = ST.clientWidth, H = ST.clientHeight;
    const a = mode === 'file' ? ar : W / H;
    let cw = W, ch = W / a;
    if (ch > H) { ch = H; cw = H * a; }
    return { W, H, cw, ch, ox: (W - cw) / 2, oy: (H - ch) / 2 };
  }
  function clampZ(){
    const c = content();
    const fit = (pos, size, off, view) => size * z.s > view ? clamp(pos, view - z.s * (off + size), -z.s * off) : (view - z.s * size) / 2 - z.s * off;
    z.x = fit(z.x, c.cw, c.ox, c.W); z.y = fit(z.y, c.ch, c.oy, c.H);
  }
  function applyZ(anim){
    if (z.s <= 1.001) { z.s = 1; z.x = 0; z.y = 0; } else clampZ();
    LAYER.style.transition = anim ? 'transform .22s ease-out' : 'none';
    LAYER.style.transform = z.s === 1 ? '' : `translate(${z.x}px,${z.y}px) scale(${z.s})`;
    R.classList.toggle('zoomed', z.s > 1);
    // a frame (YouTube, another site's player) takes the gestures only while zoomed in
    if (mode === 'embed') SHIELD.classList.toggle('off', z.s === 1);
    paintButtons();
  }
  function zoomAt(s, px, py, anim){
    const r = ST.getBoundingClientRect();
    if (px == null) { px = r.width / 2; py = r.height / 2; } else { px -= r.left; py -= r.top; }
    s = clamp(s, 1, ZMAX);
    const k = s / z.s;
    z.x = px - (px - z.x) * k; z.y = py - (py - z.y) * k; z.s = s;
    applyZ(anim);
  }
  function resetZoom(now){ z = { s: 1, x: 0, y: 0 }; if (LAYER) applyZ(!now); }

  function bindGestures(){
    const P = new Map();
    let pinch = null, pan = null, tap = null, lastTap = null, swipe = null;
    const onStage = e => e.target === SHIELD || e.target === ST || e.target === LAYER || (e.target.closest && e.target.closest('.vp-layer'));
    ST.addEventListener('pointerdown', e => {
      if (!onStage(e)) return;
      try { ST.setPointerCapture(e.pointerId); } catch (er) {}
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      hideMenu();
      if (P.size === 2) {
        const [a, b] = [...P.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: z.s, x: z.x, y: z.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        pan = null; tap = null; swipe = null;
      } else if (P.size === 1) {
        pan = { x: e.clientX, y: e.clientY, zx: z.x, zy: z.y, moved: false };
        tap = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
        swipe = z.s === 1 && e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      }
    });
    ST.addEventListener('pointermove', e => {
      if (!P.has(e.pointerId)) return;
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && P.size >= 2) {
        const [a, b] = [...P.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const r = ST.getBoundingClientRect();
        const s = clamp(pinch.s * d / pinch.d, 1, ZMAX);
        // the point under the fingers stays under them
        const lx = (pinch.mx - r.left - pinch.x) / pinch.s, ly = (pinch.my - r.top - pinch.y) / pinch.s;
        z.s = s; z.x = mx - r.left - lx * s; z.y = my - r.top - ly * s;
        applyZ(false);
        return;
      }
      if (pan) {
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) { pan.moved = true; tap = null; }
        if (z.s > 1 && pan.moved) { z.x = pan.zx + dx; z.y = pan.zy + dy; applyZ(false); }
      }
    });
    const up = e => {
      if (!P.has(e.pointerId)) return;
      P.delete(e.pointerId);
      if (P.size < 2) pinch = null;
      if (P.size) return;
      const now = performance.now();
      if (swipe && pan && pan.moved) {
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && now - swipe.t < 600) go(dx < 0 ? 1 : -1);
      }
      if (tap && now - tap.t < 300) {
        // two taps: zoom in on that point (or back out); one tap: play / pause with a mouse, show / hide the controls on a touch screen
        if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
          clearTimeout(lastTap.timer); lastTap = null;
          if (tap.type === 'mouse' && mode !== 'embed') togglePlay();      // the first click had toggled it
          if (z.s > 1) resetZoom(); else zoomAt(2.5, e.clientX, e.clientY, true);
        } else {
          const t0 = { x: e.clientX, y: e.clientY, t: now };
          if (tap.type === 'mouse') { if (mode !== 'embed' || z.s > 1) { if (mode !== 'embed') togglePlay(); } lastTap = t0; }
          else { t0.timer = setTimeout(() => { lastTap = null; if (R.classList.contains('idle')) poke(); else if (!mPaused()) { clearTimeout(idleT); R.classList.add('idle'); } else poke(); }, 300); lastTap = t0; }
        }
      }
      pan = null; tap = null; swipe = null;
    };
    ST.addEventListener('pointerup', up);
    ST.addEventListener('pointercancel', up);
    ST.addEventListener('wheel', e => {
      if (!onStage(e)) return;
      e.preventDefault();
      zoomAt(z.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX, e.clientY, false);
      poke();
    }, { passive: false });
    // Safari's own pinch on a trackpad
    ST.addEventListener('gesturestart', e => e.preventDefault());
  }

  function bindSeek(){
    let wasP = true;
    const at = e => { const r = SEEK.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
    const showTip = p => { TIP.textContent = fmt(p * mDur()); TIP.style.left = (p * 100) + '%'; };
    SEEK.addEventListener('pointermove', e => { if (!SEEK.classList.contains('drag')) showTip(at(e)); });
    SEEK.addEventListener('pointerdown', e => {
      if (!canRate() || !mDur()) return;
      e.stopPropagation();
      try { SEEK.setPointerCapture(e.pointerId); } catch (er) {}
      SEEK.classList.add('drag');
      wasP = mPaused(); if (!wasP) mPause();
      const p = at(e); mSeek(p * mDur()); showTip(p); PLAYED.style.width = KNOB.style.left = (p * 100) + '%';
    });
    SEEK.addEventListener('pointermove', e => {
      if (!SEEK.classList.contains('drag')) return;
      const p = at(e); mSeek(p * mDur()); showTip(p); PLAYED.style.width = KNOB.style.left = (p * 100) + '%';
    });
    const end = () => { if (!SEEK.classList.contains('drag')) return; SEEK.classList.remove('drag'); if (!wasP) mPlay(); idle(); };
    SEEK.addEventListener('pointerup', end); SEEK.addEventListener('pointercancel', end);
    SEEK.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); mSeek(mTime() + (e.key === 'ArrowLeft' ? -5 : 5)); }
    });
  }

  function togglePlay(){
    if (mode === 'none' || mode === 'embed') return;
    if (mPaused()) { if (mode === 'file' && vid().ended) mSeek(0); mPlay(); } else mPause();
    paint(); poke();
  }
  function toggleSide(){
    if (R.classList.contains('full')) { sideOpen = !sideOpen; R.classList.toggle('sideon', sideOpen); }
    else { sideWanted = R.classList.contains('noside'); save(K.side, sideWanted); layout(); }
    paintButtons();
  }

  function onClick(e){
    const r = e.target.closest('[data-rate]');
    if (r) { setRate(Number(r.dataset.rate)); hideMenu(); return; }
    const t = e.target.closest('[data-tab]');
    if (t && SIDE.contains(t)) { tab = t.dataset.tab; drawSide(); return; }
    const q = e.target.closest('[data-qi]');
    if (q) { show(Number(q.dataset.qi)); if (R.classList.contains('full')) { sideOpen = false; R.classList.remove('sideon'); } return; }
    if (e.target.closest('.vp-auto')) { setAuto(!auto); return; }
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) { if (!e.target.closest('.vp-menu') && !e.target.closest('[data-a="rate"]')) hideMenu(); return; }
    const a = b.dataset.a;
    if (a !== 'rate') hideMenu();
    if (a === 'toggle') togglePlay();
    else if (a === 'prev') go(-1);
    else if (a === 'next') go(1);
    else if (a === 'fback') frame(-1);
    else if (a === 'ffwd') frame(1);
    else if (a === 'rate') toggleMenu();
    else if (a === 'zin') zoomAt(z.s * 1.5, null, null, true);
    else if (a === 'zout') zoomAt(z.s / 1.5, null, null, true);
    else if (a === 'zreset') resetZoom();
    else if (a === 'loop') { loop = !loop; flash(loop ? 'Повтаря клипа' : 'Без повторение'); paintButtons(); }
    else if (a === 'auto') setAuto(!auto);
    else if (a === 'mute') { vol.m = !vol.m; save(K.vol, vol); applyVol(); paintButtons(); }
    else if (a === 'fs') toggleFs();
    else if (a === 'close') close();
    else if (a === 'side') toggleSide();
    else if (a === 'info') {
      tab = 'info'; drawSide();
      if (R.classList.contains('full')) { sideOpen = true; R.classList.add('sideon'); }
      else if (R.classList.contains('noside')) { sideWanted = true; save(K.side, true); layout(); }
      paintButtons();
    }
    poke();
  }
  function setAuto(on){ auto = on; save(K.auto, auto); flash(auto ? 'Следващото се пуска само' : 'Спира след клипа'); paintButtons(); drawSide(); }

  function onKey(e){
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const done = () => { e.preventDefault(); poke(); };
    if (k === ' ' || k === 'k' || k === 'K') { if (e.target.closest && e.target.closest('button') && k === ' ') return; togglePlay(); done(); }
    else if (k === 'Escape') { if (!MENU.hidden) hideMenu(); else if (document.fullscreenElement || document.webkitFullscreenElement) return; else if (sideOpen) toggleSide(); else close(); done(); }
    else if (k === 'ArrowLeft' && e.target !== SEEK) { mSeek(mTime() - (e.shiftKey ? 1 : 5)); flash('− ' + (e.shiftKey ? 1 : 5) + ' с'); done(); }
    else if (k === 'ArrowRight' && e.target !== SEEK) { mSeek(mTime() + (e.shiftKey ? 1 : 5)); flash('+ ' + (e.shiftKey ? 1 : 5) + ' с'); done(); }
    else if (k === ',') { frame(-1); done(); }
    else if (k === '.') { frame(1); done(); }
    else if (k === '[' || k === '<') { stepRate(-1); done(); }
    else if (k === ']' || k === '>') { stepRate(1); done(); }
    else if (k === 's' || k === 'S') { setRate(rate < 1 ? 1 : 0.25); done(); }
    else if (k === '+' || k === '=') { zoomAt(z.s * 1.5, null, null, true); done(); }
    else if (k === '-' || k === '_') { zoomAt(z.s / 1.5, null, null, true); done(); }
    else if (k === '0') { resetZoom(); done(); }
    else if (k === 'n' || k === 'N' || k === 'PageDown') { go(1); done(); }
    else if (k === 'p' || k === 'P' || k === 'PageUp') { go(-1); done(); }
    else if (k === 'f' || k === 'F') { if (fsAble()) toggleFs(); done(); }
    else if (k === 'm' || k === 'M') { vol.m = !vol.m; save(K.vol, vol); applyVol(); paintButtons(); flash(vol.m ? 'Без звук' : 'Звук'); done(); }
    else if (k === 'l' || k === 'L') { loop = !loop; flash(loop ? 'Повтаря клипа' : 'Без повторение'); paintButtons(); done(); }
    else if (k === 'a' || k === 'A') { setAuto(!auto); done(); }
    else if (k === 'i' || k === 'I') { R.querySelector('[data-a="info"]').click(); done(); }
    else if (k === 'Home') { mSeek(0); done(); }
    else if (k === 'End') { mSeek(mDur() - 0.1); done(); }
    else if (/^[1-9]$/.test(k) && mDur()) { mSeek(mDur() * Number(k) / 10); done(); }
  }

  /* ───────────── the list and the details ───────────── */
  function drawSide(){
    if (!R) return;
    SIDE.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
    if (tab === 'queue') {
      const keep = PANE.querySelector('.vp-q') && PANE.dataset.tab === 'queue' ? PANE.scrollTop : null;
      PANE.dataset.tab = 'queue';
      PANE.innerHTML = `<div class="vp-auto${auto ? ' on' : ''}" role="switch" aria-checked="${auto}" tabindex="0"><span>Пускай следващото автоматично</span><span class="vp-sw"></span></div>
        <ul class="vp-q">${items.map((x, i) => { const d = DUR[x.id];
          return `<li><button class="vp-qi${i === idx ? ' on' : ''}${playable(x) ? '' : ' skip'}" data-qi="${i}">
            <span class="n">${i === idx ? '▶' : i + 1}</span>
            <span class="th" data-th="${i}">${d ? `<i>${fmt(d)}</i>` : ''}${playable(x) ? '' : '<i>↗</i>'}</span>
            <span class="tt">${esc(x.title)}</span></button></li>`; }).join('')}</ul>
        <div class="vp-kbd"><kbd>Интервал</kbd> пусни/спри · <kbd>,</kbd> <kbd>.</kbd> кадър · <kbd>[</kbd> <kbd>]</kbd> скорост · <kbd>S</kbd> забавено ·
          <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd> увеличение · <kbd>←</kbd> <kbd>→</kbd> 5 с · <kbd>N</kbd> <kbd>P</kbd> следващо/предишно · <kbd>L</kbd> повтаряй · <kbd>F</kbd> цял екран</div>`;
      PANE.querySelectorAll('[data-th]').forEach(el => {
        const x = items[Number(el.dataset.th)];
        thumb(x).then(u => { if (u) el.style.backgroundImage = 'url("' + u.replace(/["\\\n]/g, encodeURIComponent) + '")'; });
      });
      const on = PANE.querySelector('.vp-qi.on');
      if (keep != null) PANE.scrollTop = keep;
      if (on) { const r = on.getBoundingClientRect(), pr = PANE.getBoundingClientRect(); if (r.top < pr.top || r.bottom > pr.bottom) PANE.scrollTop += r.top - pr.top - 8; }
    } else {
      if (PANE.dataset.tab !== 'info' || PANE.dataset.id !== String(it() && it().id)) PANE.innerHTML = '<div class="vp-info"></div>';
      PANE.dataset.tab = 'info'; PANE.dataset.id = String(it() && it().id);
      if (opt.details && it()) try { opt.details(it(), PANE.querySelector('.vp-info')); } catch (e) { PANE.querySelector('.vp-info').textContent = String(e); }
    }
  }

  function layout(){
    if (!R || R.hidden) return;
    const W = innerWidth, H = innerHeight, fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const full = fs || (W < 900 && W > H * 1.15);
    const col = !full && W < 900;
    R.classList.toggle('full', full); R.classList.toggle('col', col);
    R.classList.toggle('noside', !full && !col && !sideWanted);
    if (!full) { sideOpen = false; R.classList.remove('sideon'); }
    if (col) R.style.setProperty('--sh', Math.round(clamp(W / ar, Math.min(220, H * 0.4), H * 0.66)) + 'px');
    applyZ(false);
  }

  function media(x){
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title: x.title || '', artist: 'BG Referee Watch', artwork: x.poster ? [{ src: x.poster }] : [] });
      const h = { play: () => mPlay(), pause: () => mPause(), previoustrack: () => go(-1), nexttrack: () => go(1),
        seekbackward: () => mSeek(mTime() - 5), seekforward: () => mSeek(mTime() + 5) };
      Object.entries(h).forEach(([k, f]) => { try { navigator.mediaSession.setActionHandler(k, f); } catch (e) {} });
    } catch (e) {}
  }

  /* ───────────── open / close ───────────── */
  function open(o){
    build();
    opt = o || {};
    items = (opt.items || []).slice();
    if (!items.length) return;
    opener = document.activeElement;
    stopPreview();
    R.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    tab = 'queue';
    layout();
    if (!raf) raf = requestAnimationFrame(tick);
    show(clamp(opt.index || 0, 0, items.length - 1));
    ST.focus({ preventScroll: true });
  }
  function close(silent){
    if (!R || R.hidden) return;
    V.forEach(v => { v.pause(); v.removeAttribute('src'); delete v.dataset.src; v.load(); });
    if (yt) { try { yt.destroy(); } catch (e) {} yt = null; }
    FRAME.innerHTML = '';
    if (document.fullscreenElement || document.webkitFullscreenElement) try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
    R.hidden = true;
    NEXTC.classList.remove('on'); clearMsg();
    document.documentElement.style.overflow = '';
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(loadT); clearTimeout(idleT);
    mode = '';
    if (opener && opener.focus) try { opener.focus({ preventScroll: true }); } catch (e) {}
    const cb = opt.onClose; opt = {};
    if (cb) try { cb(!!silent); } catch (e) {}
  }
  // fresh data for the same queue: the clip playing keeps playing
  function update(list){
    if (!R || R.hidden) return;
    const id = it() && it().id;
    const fresh = (list || []).slice();
    const j = fresh.findIndex(x => x.id === id);
    if (j < 0) { items = fresh; if (!items.length) return close(); show(clamp(idx, 0, items.length - 1)); return; }
    const was = it();
    items = fresh; idx = j;
    // a new signed link for the same file: the <video> keeps the one it has
    if (was && was.kind === 'file' && items[j].kind === 'file' && was.src !== items[j].src) {
      V.forEach(v => { if (v.dataset.src === was.src) v.dataset.src = items[j].src; });
    }
    TITLE.textContent = it().title || '';
    R.querySelector('.vp-head h2').textContent = it().title || '';
    POS.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
    drawSide(); paintButtons();
  }

  /* ───────────── thumbnails and previews for the gallery ───────────── */
  const THC = load(K.thumbs) || {};
  const tq = []; let tBusy = 0;
  function thumb(x){
    if (!x) return Promise.resolve('');
    if (x.poster) return Promise.resolve(x.poster);
    if (x.kind !== 'file' || !x.src) return Promise.resolve('');
    const key = x.thumbKey || x.src;
    if (THC[key]) return Promise.resolve(THC[key].u);
    return new Promise(res => { tq.push({ x, key, res }); pump(); });
  }
  function pump(){
    while (tBusy < 2 && tq.length) {
      const job = tq.shift();
      if (THC[job.key]) { job.res(THC[job.key].u); continue; }
      tBusy++;
      grab(job.x).then(u => {
        if (u) { THC[job.key] = { u, t: Date.now() }; keepThumbs(); }
        job.res(u || '');
      }).finally(() => { tBusy--; pump(); });
    }
  }
  function keepThumbs(){
    const keys = Object.keys(THC);
    if (keys.length > 80) keys.sort((a, b) => THC[a].t - THC[b].t).slice(0, keys.length - 70).forEach(k => delete THC[k]);
    while (!save(K.thumbs, THC)) { const ks = Object.keys(THC); if (!ks.length) break; ks.sort((a, b) => THC[a].t - THC[b].t); delete THC[ks[0]]; }
  }
  // a frame from a tenth of the way in (the first frame is often black), as a small JPEG
  function grab(x){
    return new Promise(res => {
      const v = document.createElement('video');
      let done = false;
      const fin = u => { if (done) return; done = true; clearTimeout(to); v.removeAttribute('src'); try { v.load(); } catch (e) {} res(u); };
      const to = setTimeout(() => fin(''), 20000);
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      if (x.cors) v.crossOrigin = 'anonymous';
      v.addEventListener('loadedmetadata', () => {
        const d = v.duration;
        if (isFinite(d) && d > 0) { DUR[x.id] = Math.round(d); save(K.dur, DUR); }
        v.currentTime = isFinite(d) && d > 0 ? Math.min(3, d * 0.12) : 0.5;
      });
      v.addEventListener('seeked', () => {
        try {
          const w = 480, h = Math.round(w * (v.videoHeight || 270) / (v.videoWidth || 480));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(v, 0, 0, w, h);
          fin(c.toDataURL('image/jpeg', 0.7));
        } catch (e) { fin(''); }
      });
      v.addEventListener('error', () => fin(''));
      v.src = x.src;
    });
  }

  // previews: a muted clip in the tile under the mouse, or in the tile in the middle of a phone's screen
  let PREV = null, prevT = 0, io = null, watched = null, ioTimer = 0;
  const vis = new Map();
  function startPreview(tile, x){
    if (!x || x.kind !== 'file' || !x.src || reduced()) return;
    if (x.heavy && !hoverable() && !wifi()) return;
    if (PREV && PREV.tile === tile) return;
    stopPreview();
    const box = tile.querySelector('.vthumb') || tile;
    const v = document.createElement('video');
    v.className = 'vprev'; v.muted = true; v.playsInline = true; v.loop = true; v.preload = 'auto';
    v.setAttribute('aria-hidden', 'true');
    if (x.cors) v.crossOrigin = 'anonymous';
    v.addEventListener('playing', () => v.classList.add('on'));
    v.addEventListener('loadedmetadata', () => { const d = v.duration; if (isFinite(d) && d > 0) { DUR[x.id] = Math.round(d); save(K.dur, DUR); } if (isFinite(d) && d > 20) v.currentTime = d * 0.1; });
    v.addEventListener('error', () => stopPreview());
    v.src = x.src;
    box.insertBefore(v, box.querySelector('.vplay'));
    const p = v.play(); if (p && p.catch) p.catch(() => {});
    PREV = { tile, v, stop: setTimeout(stopPreview, hoverable() ? 30000 : 8000) };
  }
  function stopPreview(){
    if (!PREV) return;
    clearTimeout(PREV.stop);
    const v = PREV.v; PREV = null;
    v.classList.remove('on');
    setTimeout(() => { v.pause(); v.removeAttribute('src'); try { v.load(); } catch (e) {} v.remove(); }, 300);
  }
  function watch(container, getItem){
    if (!container) return;
    if (!container._vpw) {
      container._vpw = true;
      container.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse') return;
        const t = e.target.closest('[data-vprev]'); if (!t || !container.contains(t)) return;
        clearTimeout(prevT);
        prevT = setTimeout(() => startPreview(t.closest('.vtile') || t, getItem(t.dataset.vprev)), 350);
      });
      container.addEventListener('pointerout', e => {
        if (e.pointerType !== 'mouse') return;
        const t = e.target.closest('[data-vprev]'); if (!t) return;
        if (e.relatedTarget && t.contains(e.relatedTarget)) return;
        clearTimeout(prevT);
        if (PREV && (PREV.tile === t || PREV.tile.contains(t))) stopPreview();
      });
    }
    if (hoverable() || !('IntersectionObserver' in window)) return;
    // a phone: the tile most in view, once the scrolling stops
    if (io && watched !== container) { io.disconnect(); vis.clear(); }
    watched = container;
    if (!io) io = new IntersectionObserver(es => {
      es.forEach(en => { if (en.isIntersecting && en.intersectionRatio >= 0.85) vis.set(en.target, en.intersectionRatio); else vis.delete(en.target); });
      clearTimeout(ioTimer);
      ioTimer = setTimeout(() => {
        if (lowData() || (R && !R.hidden)) { stopPreview(); return; }
        const mid = innerHeight / 2;
        let best = null, bd = 1e9;
        vis.forEach((r, el) => { if (!document.body.contains(el)) { vis.delete(el); return; } const b = el.getBoundingClientRect(); const d = Math.abs((b.top + b.bottom) / 2 - mid); if (d < bd) { bd = d; best = el; } });
        if (best) startPreview(best.closest('.vtile') || best, getItem(best.dataset.vprev)); else stopPreview();
      }, 450);
    }, { threshold: [0, 0.85, 1] });
    container.querySelectorAll('[data-vprev]').forEach(el => { if (el.dataset.vprev) io.observe(el); });
  }

  window.VPlayer = {
    open, close, update, thumb, watch, stopPreview,
    isOpen: () => !!(R && !R.hidden),
    current: () => (R && !R.hidden ? it() : null),
    refreshDetails: () => { if (R && !R.hidden && tab === 'info') drawSide(); },
    duration: id => DUR[id] || 0,
    get root(){ build(); return R; },
  };
})();
