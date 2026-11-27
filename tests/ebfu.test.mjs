// Tests for reading ebfu.net's video archive (public/_worker.js: ebfuTiles, ebfuWeek). Run: node tests/ebfu.test.mjs
// The pages are cut-down copies of the real ones (November 2026); the video tokens are made up.
import { ebfuTiles, ebfuWeek, EBFU_LABEL } from '../public/_worker.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const tile = (comp, label, r) => `<div class="videoChampWeek flex-row jc-sb ai-c" style="margin: 0; border-radius: 5px; width: 110px;" onClick="$('#showChampWeek${comp}-${r}').click();">
  <div class="flex-col ml5"> <div class="robotoDarkGreen13 fw500">${label}</div> <i class="fas fa-video"></i> </div>
  <div class="flex-col ai-fe mr5"> <div class="robotoBlack11" style="margin-top: 2px; font-size: 10px;">КРЪГ</div> <div class="videoCW">${r}</div> </div> </div>
  <input id="showChampWeek${comp}-${r}" type="submit" name="showChampWeek" value="${comp}-${r}" style="display: none;">`;
const group = (comp, label, n) => `<div class="flex-row ai-c fs14 ls-05 dark_green fw500 mt10" style="height: 30px;">${label}</div>
  <div class="flex-row" style="gap: 5px; flex-wrap: wrap;">${Array.from({ length: n }, (_, i) => tile(comp, label, i + 1)).join('')}</div>`;
const menu = `<html><body><form id="form" name="form" method="post"><div>Видео архив за сезон: <select name="selectSeason" onChange="$('#form').submit();">
  <option value="2026-2027" SELECTED>2026-2027</option> <option value="2025-2026">2025-2026</option></select></div>
  ${group(1141, 'В ЮЗ', 18)}${group(1145, 'U17', 12)}${group(1148, 'ВПФЛ', 17)}${group(1149, 'efbet Лига', 15)}</form></body></html>`;
{
  const t = ebfuTiles(menu);
  ok(t.season === '2026-2027', 'the season chosen: ' + t.season);
  ok(t.tiles.length === 62 && t.tiles.find(x => x.label === 'efbet Лига' && x.round === 15)?.comp === '1149' && t.tiles.find(x => x.label === 'В ЮЗ' && x.round === 18)?.comp === '1141',
    'every round tile with its competition: ' + t.tiles.length);
  ok(Object.values(EBFU_LABEL).join(',') === 'efbet Лига,ВПФЛ,В ЮЗ,В СЗ,В СИ,В ЮИ,U18,U17,U16,U15', 'the tiles\' names for the ten leagues');
}

const play = (home, away, comp, by, tok) => `onclick="startPlayer('<span class=##robotoBlack16## style=##display: inline-block; color: #000; font-weight: 500;##>${home} - ${away}<span style=##color: #666; font-weight: 300;##>, ${comp} - </span>12 Кръг<span style=##color: #666;##>, Сезон: </span>2026-2027</span><br><span class=##robotoBlack13## style=##color: #666;##>Видеото е качено от ${by}</span>','https://ebfu.net/videoFile.php?stream_token=${tok}');"`;
const card = (comp, r, when, home, score, away, venue, cams) => `<div class="flex-col br10 p10 robotoC fs14 fw300 mt10" style="background-color: #fff;">
  <div class="flex-row ai-c jc-sb fs12"> <div>${comp} - ${r} Кръг</div> <div>${when}</div> </div>
  <div class="flex-row br10 robotoC fs15 fw300 ai-c mt5"> <div class="fw400 lh15" style="width: 30%; flex-grow: 1; min-width: 0; text-align: right;">${home}</div>
    <img src="../images/teamLogo1052.png" class="br5 ml5" style="width: 30px; height: 30px;"/> <div class="fw500" style="width: 40px; min-width: 40px; text-align: center;">${score}</div>
    <img src="../images/teamLogo2901.png" class="br5 mr5" style="width: 30px; height: 30px;"/> <div class="fw400 lh15" style="width: 30%; flex-grow: 1; min-width: 0; text-align: left">${away}</div> </div>
  <div class="flex-row ai-c jc-sb fs12 mt5"> <div>${venue}</div> <div class="flex-row ai-c" style="column-gap: 5px;">${cams.map(c => `<div class="flex-row ai-c jc-c br7" style="width: 40px; height: 40px; background-color: #f5f5f5;" ${c}> <i class="fas fa-video fs15 blue"></i> </div>`).join(' ')}</div> </div> </div>`;
const C = 'Елитна юношеска група до 17 години';
const week = `<html><body><form id="form" name="form" method="post"><div class="centerWhiteWindowGlass p10"><div class="flex-row ai-c robotoC fs16 fw400 dark_green ml5 ls-05" style="height: 30px;">Видео архив за сезон: 2026-2027, ${C}, 12 кръг</div> <!-- съдържание -->
  ${card(C, 12, 'Съб 21, Ное в 13:30', 'Локомотив Пд U17', '2-3', 'ФК Нефтохимик 1962 U17', 'Христо Бонев - Пловдив',
    [play('ПФК Локомотив Пд U17', 'ФК Нефтохимик 1962 U17', C, 'домакина', '111-222-1'), play('ПФК Локомотив Пд U17', 'ФК Нефтохимик 1962 U17', C, 'госта', '333-444-1')])}
  ${card(C, 12, 'Нед 22, Ное в 11:00', 'Славия U17', '1-0', 'Ботев Пд U17', 'Славия - София', [play('Пфк Славия U17', 'ПФК Ботев Пд U17', C, 'домакина', '555-666-1')])}
  ${card(C, 12, 'Пет 5, Дек в 10:00', 'Арда U17', '-', 'Етър U17', 'Арда - Кърджали', [])}
  <input id="backButton" type="submit" name="buttonBack" value="1" style="display: none;"></div></form></body></html>`;
{
  const w = ebfuWeek(week), [a, b, c] = w.cards;
  ok(w.heading === '2026-2027, ' + C + ', 12 кръг' && w.cards.length === 3, 'the heading and every match card: ' + w.heading);
  ok(a.round === 12 && a.home === 'Локомотив Пд U17' && a.away === 'ФК Нефтохимик 1962 U17' && a.score.join('-') === '2-3' && a.venue === 'Христо Бонев - Пловдив'
    && a.when.d === 21 && a.when.mo === 11 && a.when.time === '13:30', 'a card: round, teams, score, stadium, day and time: ' + JSON.stringify(a.when));
  ok(a.videos.length === 2 && a.videos[0].by === 'home' && a.videos[1].by === 'away' && a.videos[1].url === 'https://ebfu.net/videoFile.php?stream_token=333-444-1'
    && a.videos[0].title.startsWith('ПФК Локомотив Пд U17 - ФК Нефтохимик 1962 U17'), 'both clubs\' videos, each with who uploaded it');
  ok(b.videos.length === 1 && c.videos.length === 0 && c.score === null && c.when.mo === 12, 'a match with no video yet (and not played)');
}

// the layout ebfu.net gives a session logged in from a wide window (the screenshot of efbet Лига, 13 кръг, 27 Nov 2026):
// other markup, full club names, the town under each name. The videos' titles still name the teams and the round.
const wideTitle = (home, away, comp, r, by) => `<span class=##robotoBlack16##>${home} - ${away}<span style=##color: #666;##>, ${comp} - </span>${r} Кръг<span>, Сезон: </span>2026-2027</span><br><span>Видеото е качено от ${by}</span>`;
const wideCard = (home, town1, score, away, town2, cams) => `<div class="videoMatchRow row"><div class="col date"><i class="far fa-calendar"></i> Петък, 6 Ное, 2026 <i class="far fa-clock"></i> 17:00</div>
  <div class="col teamH"><span class="tname">${home}</span><span class="ttown">${town1}</span></div><img class="logo"/><span class="score">${score}</span><img class="logo"/>
  <div class="col teamA"><span class="tname">${away}</span><span class="ttown">${town2}</span></div>
  <div class="col cams">${cams.map(([by, tok]) => `<i class="fas fa-video blue" onclick="startPlayer('${wideTitle(home, away, 'efbet Лига', 13, by)}', 'https://ebfu.net/videoFile.php?stream_token=${tok}');"></i>`).join('')}</div>
  <div class="col venue"><i class="fas fa-landmark"></i> Георги Аспарухов - София</div></div>`;
const wide = `<html><body><div class="header">Иван Иванов <img src="../refereeImages/image-1.jpg"></div><div class="archiveTitle">Видео архив за сезон: 2026-2027, efbet Лига, 13 кръг</div>
  ${wideCard('ПФК Септември Сф', 'СОФИЯ', '1 - 0', 'ФУТБОЛЕН КЛУБ ЛОКОМОТИВ СОФИЯ 1929 ЕАД', 'СОФИЯ', [['домакина', '9-9-1']])}
  ${wideCard('ФК Светкавица - 2014', 'ТЪРГОВИЩЕ', '1 - 1', 'ФК Бенковски Исперих', 'ИСПЕРИХ', [['домакина', '8-8-1'], ['госта', '8-8-2']])}
  ${wideCard('ПФК Ботев Пловдив', 'ПЛОВДИВ', '3 - 3', 'ПФК ЦСКА-София', 'СОФИЯ', [])}</body></html>`;
{
  const w = ebfuWeek(wide), [a, b] = w.cards;
  ok(w.heading === '2026-2027, efbet Лига, 13 кръг' && w.layout === 'titles' && w.cards.length === 2, 'the wide layout: read from the videos\' titles — ' + w.cards.length + ' cards, ' + w.layout);
  ok(a.round === 13 && a.alts.some(([h, x]) => h === 'ПФК Септември Сф' && x === 'ФУТБОЛЕН КЛУБ ЛОКОМОТИВ СОФИЯ 1929 ЕАД') && a.videos[0].by === 'home' && a.videos[0].url.endsWith('9-9-1'),
    'a card: the teams, the round and the video');
  ok(b.videos.length === 2 && b.alts.length === 2 && b.alts.some(([h, x]) => h === 'ФК Светкавица - 2014' && x === 'ФК Бенковски Исперих'), 'a club with " - " in its name: both readings kept');
}
// the whole /ebfu/week route, with ebfu.net and the database stood in: the menu, the round (through ebfu.net's script
// redirect), a remembered league number that is out of date, an expired session
{
  const worker = (await import('../public/_worker.js')).default;
  const roundPage = r => week.replace(/12 кръг/g, r + ' кръг').replace(/ - 12 Кръг/g, ` - ${r} Кръг`);
  let log = [], loggedIn = true, selected = '', menuNow = null, pageFor = null, toStart = false;
  globalThis.fetch = async (u, o = {}) => {
    u = String(u); log.push((o.method || 'GET') + ' ' + u.replace(/^https:\/\/[^/]+/, ''));
    const res = (body, type = 'text/html', extra = {}) => new Response(body, { status: 200, headers: { 'content-type': type, ...extra } });
    if (u.includes('/auth/v1/user')) return res(JSON.stringify({ id: 'u1' }), 'application/json');
    if (u.includes('/rest/v1/profiles')) return res(JSON.stringify([{ approved: true, role: 'user' }]), 'application/json');
    if (!loggedIn) return res('<html><body><form><input name="login"><input type="password" name="pass"></form><script>function go(){ loginUser(); }</script></body></html>');
    if (u.endsWith('/videoArchive.php') && o.method === 'POST') {
      selected = new URLSearchParams(o.body).get('showChampWeek');
      return res('<html><head><script>self.location.href = "videoShowChampWeek.php";</script></head><body></body></html>', 'text/html', { 'set-cookie': 'PHPSESSID=abc2; path=/' });
    }
    const toIndex = () => res('\t<script>\n\t\tself.location.href = "https://ebfu.net/index.php";\n\t</script>\n');
    if (toStart && /videoArchive|videoShowChampWeek/.test(u)) return toIndex();
    if (u.endsWith('/videoArchive.php')) return res(menuNow || menu);
    if (u.endsWith('/videoShowChampWeek.php')) { const [comp, r] = selected.split('-'); return res(pageFor ? pageFor(comp, r) : comp === '1145' ? roundPage(r) : roundPage(99)); }
    if (/ebfu\.net\/(?:index\.php)?$/.test(u)) return res('<html><body><span onClick="loginUser();">Вход</span></body></html>');
    return new Response('not found', { status: 404 });
  };
  const call = async body => (await worker.fetch(new Request('https://refvideos.pages.dev/ebfu/week', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body) }), {})).json();
  let j = await call({ session: 'PHPSESSID=abc', league: 'u17', round: 12 });
  ok(j.ok && j.comp === '1145' && j.season === '2026-2027' && j.cards.length === 3 && j.cards[0].videos.length === 2 && /PHPSESSID=abc2/.test(j.session),
    'a round looked up from scratch: the menu, then the round through the script redirect: ' + log.join(', '));
  log = [];
  j = await call({ session: j.session, league: 'u17', round: 12, season: '2026-2027', comp: '1145' });
  ok(j.ok && j.cards.length === 3 && log.filter(x => !x.includes('/auth/') && !x.includes('/rest/')).length === 2, 'with the league\'s number remembered, the menu is skipped');
  log = [];
  j = await call({ session: j.session, league: 'u17', round: 12, season: '2026-2027', comp: '1001' });
  ok(j.ok && j.comp === '1145' && j.cards.length === 3 && j.cards.every(c => c.round === 12), 'an out-of-date number: the page names another round, so the menu is read again');
  j = await call({ session: j.session, league: 'u17', round: 13, season: '2026-2027' });
  ok(j.ok && j.none === 'round' && j.cards.length === 0, 'a round the archive has no tile for yet: no cards');
  // the wide layout: another menu (the round buttons under each competition's name) and the round page above
  const wideMenu = `<html><body><form method="post"><select name="selectSeason"><option value="2026-2027" selected>2026-2027</option></select>
    <h3>Купа</h3><button type="submit" name="showChampWeek" value="1150-1">1</button>
    <h3>efbet Лига</h3>${Array.from({ length: 15 }, (_, i) => `<button type="submit" name="showChampWeek" value="1149-${i + 1}">${i + 1}</button>`).join('')}
    <h3>ВПФЛ</h3>${Array.from({ length: 17 }, (_, i) => `<button type="submit" name="showChampWeek" value="1148-${i + 1}">${i + 1}</button>`).join('')}</form></body></html>`;
  const narrow = { menu, roundPage };
  menuNow = wideMenu; pageFor = (comp, r) => comp === '1149' && r === '13' ? wide : comp === '1148' && r === '13' ? wide.replace(/efbet Лига/g, 'Mr Bit Втора Лига') : roundPage(99);
  log = [];
  j = await call({ session: 'PHPSESSID=w', league: 'efbet', round: 13 });
  ok(j.ok && j.comp === '1149' && j.layout === 'titles' && j.cards.length === 2 && j.inspect && j.inspect.week && !/Иван|refereeImages|9-9-1/.test(JSON.stringify(j.inspect)),
    'a wide-layout session: the menu read another way, the round from the titles, and a sketch for the developer without the member\'s name or video links');
  log = [];
  j = await call({ session: 'PHPSESSID=w', league: 'mrbit', round: 13, season: '2026-2027', comp: '1149' });
  ok(j.ok && j.comp === '1148' && j.cards.length === 2, 'a remembered number for another league is noticed (the heading names efbet Лига, not Втора лига)');
  menuNow = null; pageFor = null;
  // the round page sends a session that has ended to the start page: that page is never opened (it would end a live one)
  log = []; toStart = true;
  j = await call({ session: 'PHPSESSID=abc', league: 'u17', round: 12, season: '2026-2027', comp: '1145' });
  ok(!j.ok && j.expired && !log.some(x => /GET \/(?:index\.php)?$/.test(x)), 'an ended session: says so without opening ebfu.net\'s start page: ' + log.filter(x => !/auth|rest/.test(x)).join(', '));
  toStart = false;
  loggedIn = false;
  j = await call({ session: 'PHPSESSID=old', league: 'u17', round: 12, season: '2026-2027', comp: '1145' });
  ok(!j.ok && j.expired, 'an expired ebfu.net session says so');
  j = await call({ session: 'PHPSESSID=old', league: 'world', round: 12 });
  ok(!j.ok && !j.expired && /league/.test(j.error), 'only the ten Bulgarian leagues');
}
// /ebfu/file: a recording relayed a piece at a time, each piece tried again when ebfu.net fails; only ebfu.net's video
// links, only from this site
{
  const worker = (await import('../public/_worker.js')).default;
  const SIZE = 3_000_000_000, TOK = 'https://ebfu.net/videoFile.php?stream_token=4512-6768-1';
  let asked = [], failFirst = 1;
  globalThis.fetch = async (u, o = {}) => {
    const r = (o.headers || {}).Range || '';
    asked.push(r);
    if (failFirst > 0) { failFirst--; return new Response('busy', { status: 503 }); }
    const [, a, z] = r.match(/bytes=(\d+)-(\d*)/);
    const end = z ? Math.min(+z, SIZE - 1) : SIZE - 1;
    return new Response('x'.repeat(16), { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': `bytes ${a}-${end}/${SIZE}`, 'content-length': String(end - a + 1) } });
  };
  const get = (u, h = {}) => worker.fetch(new Request('https://refvideos.pages.dev/ebfu/file?u=' + encodeURIComponent(u), { headers: { 'Sec-Fetch-Site': 'same-origin', ...h } }), {});
  let r = await get(TOK, { Range: 'bytes=2400000000-' });
  ok(r.status === 206 && r.headers.get('content-range') === `bytes 2400000000-${2400000000 + 8 * 1024 * 1024 - 1}/${SIZE}` && r.headers.get('accept-ranges') === 'bytes'
    && asked.length === 2 && asked[1] === `bytes=2400000000-${2400000000 + 8 * 1024 * 1024 - 1}`, 'a jump 40 minutes in: one 8 MB piece from there, asked again after ebfu.net\'s 503: ' + asked.join(', '));
  asked = [];
  r = await get(TOK, { Range: 'bytes=100-199' });
  ok(r.status === 206 && asked[0] === 'bytes=100-199', 'a small range is passed on as it is');
  r = await get('https://example.com/videoFile.php?stream_token=4512-6768-1');
  ok(r.status === 400, 'anything but an ebfu.net video link is refused');
  r = await get(TOK, { 'Sec-Fetch-Site': 'cross-site' });
  ok(r.status === 403, 'another site can\'t use the relay');
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
