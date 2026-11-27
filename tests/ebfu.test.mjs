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

// the whole /ebfu/week route, with ebfu.net and the database stood in: the menu, the round (through ebfu.net's script
// redirect), a remembered league number that is out of date, an expired session
{
  const worker = (await import('../public/_worker.js')).default;
  const roundPage = r => week.replace(/12 кръг/g, r + ' кръг').replace(/ - 12 Кръг/g, ` - ${r} Кръг`);
  let log = [], loggedIn = true, selected = '';
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
    if (u.endsWith('/videoArchive.php')) return res(menu);
    if (u.endsWith('/videoShowChampWeek.php')) { const [comp, r] = selected.split('-'); return res(comp === '1145' ? roundPage(r) : roundPage(99)); }
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
  loggedIn = false;
  j = await call({ session: 'PHPSESSID=old', league: 'u17', round: 12, season: '2026-2027', comp: '1145' });
  ok(!j.ok && j.expired, 'an expired ebfu.net session says so');
  j = await call({ session: 'PHPSESSID=old', league: 'world', round: 12 });
  ok(!j.ok && !j.expired && /league/.test(j.error), 'only the ten Bulgarian leagues');
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
