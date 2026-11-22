// node sheets.test.mjs — the ebfu.net reader on real pages (21 Nov 2026) and our names for those matches
import * as E from './ebfu.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// a day's list, as ebfu.net sends it (one block per match; the commented-out old layout repeats the code)
const block = (i, home, hTown, label, time, away, aTown, venue, id) => `
        <tr style="cursor:pointer">
        <td><table width="998" border="0" cellspacing="0" cellpadding="0" class="teamTable" onclick="$('#showMatch${i}').click();">
        <tbody>
            <tr>
                <td width="80" height="80" rowspan="3" align="center">                <img src="../images/teamLogo1112.png" width="60" height="60" style="margin-top: 4px;"/></td>
                <td width="390" height="56" align="left" valign="bottom"><div class="teamName">${home}</div><div class="teamCity">гр.${hTown}</td>
                <td width="78" align="center"><div class="teamCity">${label}</div><div class="teamName">${time}</div></td>
                <td width="390" align="right" valign="bottom"><div class="teamName">${away}</div><div class="teamCity">гр.${aTown}</td>
                <td width="80" rowspan="3" align="center">
                                <img src="../images/teamLogo1113.png" width="60" height="60" style="margin-top: 4px;"/></td>
            </tr>
            <tr>
                <td height="24" colspan="3" align="center" class="teamCity">${venue}</td>
            </tr>
        </tbody>
        </table><input id="showMatch${i}" type="submit" name="showMatchBtn" value="${id}" style="display: none;"><div style="height: 20px;"></div></td>
    </tr>
    <!--
        <td width="250" align="right" class="robotoBlueB14"><div class="teamName">${home}</div><div class="teamCity">гр.${hTown}&nbsp;&nbsp;</td>
        <td width="24" bgcolor="#FFFFFF"><input id="showMatch${i}" type="submit" name="showMatchBtn" value="${id}" style="display: none;"></td>
    !-->`;
const L = [
  ['ПФК Черно море U15', 'Варна', 'U15', '10:00', 'ПФК Септември Сф U15', 'София', 'Корабостроител - гр.Варна', '9768f'],
  ['ФУТБОЛЕН КЛУБ ЧЕРНОМОРЕЦ 1919 БУРГАС', 'Бургас', 'ВПФЛ', '12:15', 'Футболен клуб Рилски спортист-2011', 'Самоков', 'Лазур - гр.Бургас', '9a8a8'],
  ['ФК Национал (София)', 'София', 'В ЮЗ', '14:00', 'Футболен клуб Миньор - Перник', 'Перник', 'НСА тревен - гр.София', '9272a'],
  ['ФК Черноморец Балчик', 'Балчик', 'В СИ', '14:00', 'Футболен клуб Устрем - Дончево', 'Дончево', 'Градски стадион - гр.Балчик', '9a42a'],
  ['ОФК Беласица', 'Петрич', 'В ЮЗ', '14:00', 'ФК Пирин Разлог 1941', 'Разлог', 'Цар Самуил - гр.Петрич', '92711'],
  ['ПРОФЕСИОНАЛЕН ФУТБОЛЕН КЛУБ ЕТРОПОЛЕ', 'Етрополе', 'В ЮЗ', '14:00', 'ФК Банско Тиим Сдружение', 'Банско', 'Чавдар - гр.Етрополе', '92743'],
  ['ПФК ЦСКА III', 'София', 'В ЮЗ', '14:00', 'ФК Оборище-Панагюрище', 'Панагюрище', 'Бенковски - гр.Костенец', '9275c'],
  ['ФК Балкан 1929', 'Ботевград', 'В ЮЗ', '14:00', 'ФК Струмска слава 1927', 'Радомир', 'Христо Ботев - гр.Ботевград', '92775'],
  ['Сдружение ОФК Костинброд - 2012', 'Костинброд', 'В ЮЗ', '14:00', 'Септември См', 'Симитли', 'Георги Бенковски - гр.Костинброд', '9278e'],
  ['ФК Сливнишки герой', 'Сливница', 'В ЮЗ', '14:00', 'ФК Кюстендил - Kюстендил', 'Кюстендил', 'Сливнишки герой - гр.Сливница', '927a7'],
  ['ПФK Левски II', 'София', 'В ЮЗ', '14:00', 'ПФК Славия ||', 'София', 'Георги Аспарухов помощно/изкуствено игрище - гр.София', '927d9'],
  ['ПФК Септември Сф II', 'София', 'В ЮЗ', '14:00', 'ОФК Ботев 1937', 'Ихтиман', '57 училище - гр.София', '927c0'],
  ['ОФК Спартак Пл', 'Плевен', 'ВПФЛ', '14:30', 'СДРУЖЕНИЕ ОБЩИНСКИ ФУТБОЛЕН КЛУБ НЕСЕБЪР', 'Несебър', 'Градски стадион - гр.Ловеч', '9a93e'],
  ['ПФК Хебър 1918 АД', 'Пазарджик', 'ВПФЛ', '14:30', 'ОФК Локомотив Горна Оряховица', 'Горна Оряховица', 'Георги Бенковски - гр.Пазарджик', '9a925'],
  ['ФК Етър ВТ', 'Велико Търново', 'ВПФЛ', '14:30', 'Спортист 2009', 'Своге', 'Ивайло - гр.Велико Търново', '9a90c'],
  ['ПФК Лудогорец 1945 II', 'Разград', 'ВПФЛ', '14:30', 'ФК МАРЕК 1915', 'Дупница', 'Гнездо на орли - гр.Разград', '9a8f3'],
  ['ОФК Вихрен - Сандански', 'Сандански', 'ВПФЛ', '14:30', 'ПФК Пирин 22 АД', 'Благоевград', 'Градски стадион - гр.Сандански', '9a8c1'],
  ['ПФК Марица 1921', 'Пловдив', 'В ЮИ', '14:30', 'Локомотив Пд II', 'Пловдив', 'Английска гимназия - гр.Пловдив', '9364d'],
  ['ПФК Славия 1913', 'София', 'efbet Лига', '14:45', 'ПФК Арда Кърджали 1924', 'Кърджали', 'Славия - гр.София', '9a682'],
  ['ФУТБОЛЕН КЛУБ СПАРТАК 1918', 'Варна', 'efbet Лига', '17:15', 'ПФК ЧЕРНО МОРЕ АД', 'Варна', 'Спартак - гр.Варна', '9a69b'],
];
const listHtml = `<!doctype html><html><body><form id="form" name="form" method="post"><table width="1000">${L.map((r, i) => block(i, ...r)).join('')}</table></form></body></html>`;
const list = E.parseList(listHtml);
ok(list.length === L.length, `the list: ${list.length} matches read`);
const sl = list.find(x => x.id === '9a682');
ok(sl && sl.league === 'efbet' && sl.time === '14:45' && sl.home === 'ПФК Славия 1913' && sl.homeTown === 'София' && sl.away === 'ПФК Арда Кърджали 1924' && sl.venue === 'Славия - гр.София', 'a match: league, time, teams, towns, stadium');
ok(list.filter(x => x.league === 'sw3').length === 9 && list.filter(x => x.league === 'mrbit').length === 6 && list.filter(x => x.league === 'efbet').length === 2, 'labels: В ЮЗ → sw3, ВПФЛ → mrbit, efbet Лига → efbet');
ok(list.filter(x => x.league === null).map(x => x.label).join() === 'U15,В СИ,В ЮИ', 'other competitions are left out (league null)');

// our matches of that day (football_matches)
const ours = [
  ['mrbit:2026-27:17:chernomorets-1919-burgas-8530:rilski-sportist-8547', 'mrbit', '2026-11-21T10:15:00Z', 'Черноморец 1919 Бургас', 'Рилски Спортист', '9a8a8'],
  ['sw3:2026-27:etropole:bansko', 'sw3', '2026-11-21T12:00:00Z', 'Етрополе (Етрополе)', 'Банско тийм (Банско)', '92743'],
  ['sw3:2026-27:natsional:minyor', 'sw3', '2026-11-21T12:00:00Z', 'Национал (София)', 'Миньор (Перник)', '9272a'],
  ['sw3:2026-27:levski-ii:slaviya-1913-ii', 'sw3', '2026-11-21T12:00:00Z', 'Левски II (София)', 'Славия 1913 II (София)', '927d9'],
  ['sw3:2026-27:belasitsa:pirin-1941', 'sw3', '2026-11-21T12:00:00Z', 'Беласица (Петрич)', 'Пирин 1941 (Разлог)', '92711'],
  ['sw3:2026-27:slivnishki-geroy:kyustendil', 'sw3', '2026-11-21T12:00:00Z', 'Сливнишки герой (Сливница)', 'Кюстендил (Кюстендил)', '927a7'],
  ['sw3:2026-27:kostinbrod-2012:septemvri', 'sw3', '2026-11-21T12:00:00Z', 'ОФК Костинброд 2012 (Костинброд)', 'Септември (Симитли)', '9278e'],
  ['sw3:2026-27:balkan-1929:strumska-slava-1927', 'sw3', '2026-11-21T12:00:00Z', 'Балкан 1929 (Ботевград)', 'Струмска слава 1927 (Радомир)', '92775'],
  ['sw3:2026-27:tsska-iii:oborishte', 'sw3', '2026-11-21T12:00:00Z', 'ЦСКА III (София)', 'Оборище (Панагюрище)', '9275c'],
  ['sw3:2026-27:septemvri-ii:botev-1937', 'sw3', '2026-11-21T12:00:00Z', 'Септември II (София)', 'Ботев 1937 (Ихтиман)', '927c0'],
  ['mrbit:2026-27:17:ludogorets-ii-1409:marek-8543', 'mrbit', '2026-11-21T12:30:00Z', 'Лудогорец II', 'Марек', '9a8f3'],
  ['mrbit:2026-27:17:etar-veliko-tarnovo-855:sportist-svoge-8550', 'mrbit', '2026-11-21T12:30:00Z', 'Етър Велико Търново', 'Спортист Своге', '9a90c'],
  ['mrbit:2026-27:17:spartak-pleven-1418:nesebar-1410', 'mrbit', '2026-11-21T12:30:00Z', 'Спартак Плевен', 'Несебър', '9a93e'],
  ['mrbit:2026-27:17:hebar-1918-4659:lokomotiv-g-oryahovitsa-1420', 'mrbit', '2026-11-21T12:30:00Z', 'Хебър 1918', 'Локомотив Г. Оряховица', '9a925'],
  ['mrbit:2026-27:17:vihren-5025:pirin-blagoevgrad-1428', 'mrbit', '2026-11-21T12:30:00Z', 'Вихрен', 'Пирин Благоевград', '9a8c1'],
  ['efbet:fb-m-534555', 'efbet', '2026-11-21T12:45:00Z', 'Славия София', 'Арда Кърджали', '9a682'],
  ['efbet:fb-m-534539', 'efbet', '2026-11-21T15:15:00Z', 'Спартак Варна', 'Черно море Варна', '9a69b'],
].map(([id, league, kickoff, home_name, away_name, want]) => ({ id, league, kickoff, home_name, away_name, want }));
const pairs = E.pair(ours, list);
for (const m of ours) { const e = pairs.get(m.id); ok(e && e.id === m.want, `pairs ${m.home_name} – ${m.away_name} → ${e ? `${e.home} – ${e.away}` : 'nothing'}`); }
// a reserve team never fits the first team; and a match not on ebfu that day finds nothing
ok(E.teamScore('Славия София', ['ПФК Славия ||', 'София']) < 0 && E.teamScore('Левски II (София)', ['ПФK Левски II', 'София']) >= 3, 'a reserve team fits only a reserve team');
ok(E.pair([{ id: 'x', league: 'efbet', kickoff: '2026-11-21T12:45:00Z', home_name: 'Левски София', away_name: 'ЦСКА София' }], list).size === 0, 'a match that is not in the list finds nothing');
ok(E.tokens('ФК Кюстендил - Kюстендил').join() === 'кюстендил,кюстендил', 'a Latin K in a Cyrillic word is read as Cyrillic');

// the match sheet (showTeamList.php) of Славия – Арда
const sheetHtml = `<!doctype html><html><head><meta><title>BFU eChampionship</title><link><link></head><body><table><tbody><tr><td><table><tbody><tr><td colspan="3"><table><tbody><tr><td><img src="images/bfuMailLogo.png"/></td><td class="robotoWhiteBold28"><div>БЪЛГАРСКИ ФУТБОЛЕН СЪЮЗ</div></td></tr></tbody></table></td></tr><tr><td colspan="3"><table><tbody><tr><td><img src="../images/teamLogo1011.png"/></td><td><span class="robotoBlackB24">ПФК Славия 1913</span><br><span class="robotoBlackB20">София</span></td><td><span class="robotoBlackB24">ПФК Арда Кърджали 1924</span><br><span class="robotoBlackB20">Кърджали</span></td><td><img src="../images/teamLogo1099.png"/></td></tr></tbody></table><table><tbody><tr><td colspan="4" class="robotoBlack20">&nbsp;Стадион: <span class="robotoBlackB20">Славия - гр.София</span></td></tr></tbody></table></td></tr><tr><td colspan="3"><table><tbody><tr><td colspan="2" class="robotoWhiteB20"><span>ПЪРВЕНСТВО: </span>efbet Лига - 15 Кръг, Събота 21, Ное 2026 г. 14:45 часа</td></tr><tr><td class="robotoBlack20"><span>Главен съдия</span></td><td class="robotoBlackB20"><span>Никола Антонов Попов - гр.София</span></td></tr><tr><td class="robotoBlack20"><span>Асистент съдия 1</span></td><td class="robotoBlackB20"><span>Дениз Пиринов Соколов - гр.София</span></td></tr><tr><td class="robotoBlack20"><span>Асистент съдия 2</span></td><td class="robotoBlackB20"><span>Марио Георгиев Данаилов - гр.Дупница</span></td></tr><tr><td class="robotoBlack20"><span>Четвърти съдия</span></td><td class="robotoBlackB20"><span>Георги Георгиев Спасов - гр.София</span></td></tr><tr><td class="robotoBlack20"><span>ВАР</span></td><td class="robotoBlackB20"><span>Любослав Бисеров Любомиров - гр.Перник</span></td></tr><tr><td class="robotoBlack20"><span>АВАР</span></td><td class="robotoBlackB20"><span>Кристина Георгиева Георгиева - гр.София</span></td></tr><tr><td class="robotoBlack20"><span>БФС Делегат</span></td><td class="robotoBlackB20"><span>Станислав Румянов Вълков - гр.София</span></td></tr><tr><td class="robotoBlack20"><span>Съдийски наблюдател</span></td><td class="robotoBlackB20"><span>Валентин Желев Добрев - гр.София</span></td></tr></tbody></table></td></tr><tr><td colspan="3">&nbsp;</td></tr><tr><td><table><tbody><tr><td colspan="2" class="robotoWhiteB20">&nbsp;ПФК Славия 1913</td></tr><tr class="robotoBlackB20"><td>99</td><td>&nbsp;Иван Георгиев Андонов - ВРАТАР</td></tr><tr class="robotoBlackB20"><td>87</td><td>&nbsp;Диего Густаво Фераресо</td></tr><tr class="robotoBlackB20"><td>4</td><td>&nbsp;Никола Савич</td></tr><tr class="robotoBlackB20"><td>24</td><td>&nbsp;Лазар Енев Марин</td></tr><tr class="robotoBlackB20"><td>20</td><td>&nbsp;Жордан Семедо Варела</td></tr><tr class="robotoBlackB20"><td>95</td><td>&nbsp;Владимир Милетич</td></tr><tr class="robotoBlackB20"><td>73</td><td>&nbsp;Иван Стоилов Минчев - КАПИТАН</td></tr><tr class="robotoBlackB20"><td>71</td><td>&nbsp;Кристиян Стоянов Стоянов</td></tr><tr class="robotoBlackB20"><td>27</td><td>&nbsp;Умаро Балде</td></tr><tr class="robotoBlackB20"><td>77</td><td>&nbsp;Емил Светославов Стоев</td></tr><tr class="robotoBlackB20"><td>19</td><td>&nbsp;Емилиян Бойков Гогев</td></tr></tbody></table><table><tbody><tr><td colspan="2" class="robotoWhiteB20">&nbsp;Резерви</td></tr><tr class="robotoBlackB20"><td>63</td><td>&nbsp;Леви Кахамба Нтумба - ВРАТАР</td></tr><tr class="robotoBlackB20"><td>1</td><td>&nbsp;Георги Стоянов Петков</td></tr><tr class="robotoBlackB20"><td>6</td><td>&nbsp;Борис Борисов Тодоров</td></tr><tr class="robotoBlackB20"><td>17</td><td>&nbsp;Васил Гълъбинов Казълджиев</td></tr><tr class="robotoBlackB20"><td>26</td><td>&nbsp;Димитър Христов Буров</td></tr><tr class="robotoBlackB20"><td>23</td><td>&nbsp;Илиан Илианов Антонов</td></tr><tr class="robotoBlackB20"><td>3</td><td>&nbsp;Мартин Христинов Георгиев</td></tr><tr class="robotoBlackB20"><td>11</td><td>&nbsp;Мохамед Досо</td></tr><tr class="robotoBlackB20"><td>7</td><td>&nbsp;Роберто Илиев Райчев</td></tr><tr class="robotoBlackB20"><td>9</td><td>&nbsp;Йоан Атанасов Борносузов</td></tr></tbody></table><br><span class="robotoBlack20">Главен Треньор:</span><span class="robotoBlackB20">Ратко Достанич</span></td><td>&nbsp;</td><td><table><tbody><tr><td colspan="2" class="robotoWhiteB20">&nbsp;ПФК Арда Кърджали 1924</td></tr><tr class="robotoBlackB20"><td>1</td><td>&nbsp;Анатолий Енчев Господинов - КАПИТАН - ВРАТАР</td></tr><tr class="robotoBlackB20"><td>2</td><td>&nbsp;Дерик Фернандо Да Силва</td></tr><tr class="robotoBlackB20"><td>5</td><td>&nbsp;Виктор Бориславов Любенов</td></tr><tr class="robotoBlackB20"><td>6</td><td>&nbsp;Виктор Николаев Попов</td></tr><tr class="robotoBlackB20"><td>10</td><td>&nbsp;Светослав Светозаров Ковачев</td></tr><tr class="robotoBlackB20"><td>21</td><td>&nbsp;Вячеслав Сергийович Велев</td></tr><tr class="robotoBlackB20"><td>35</td><td>&nbsp;Димитър Валентинов Велковски</td></tr><tr class="robotoBlackB20"><td>39</td><td>&nbsp;Антонио Венциславов Вутов</td></tr><tr class="robotoBlackB20"><td>70</td><td>&nbsp;Набил Макни</td></tr><tr class="robotoBlackB20"><td>80</td><td>&nbsp;Лъчезар Христов Котев</td></tr><tr class="robotoBlackB20"><td>91</td><td>&nbsp;Станислав Ивайлов Иванов</td></tr></tbody></table><table><tbody><tr><td colspan="2" class="robotoWhiteB20">&nbsp;Резерви</td></tr><tr class="robotoBlackB20"><td>22</td><td>&nbsp;Янко Иванов Георгиев - ВРАТАР</td></tr><tr class="robotoBlackB20"><td>4</td><td>&nbsp;Идову Давид Акинтола</td></tr><tr class="robotoBlackB20"><td>11</td><td>&nbsp;Атанас Василев Кабов</td></tr><tr class="robotoBlackB20"><td>16</td><td>&nbsp;Преслав Валериев Бачев</td></tr><tr class="robotoBlackB20"><td>18</td><td>&nbsp;Симеон Сергеев Василев</td></tr><tr class="robotoBlackB20"><td>24</td><td>&nbsp;Мартин Красимиров Паскалев</td></tr><tr class="robotoBlackB20"><td>26</td><td>&nbsp;Бурак Акънджъ</td></tr><tr class="robotoBlackB20"><td>44</td><td>&nbsp;Адама Траоре</td></tr><tr class="robotoBlackB20"><td>99</td><td>&nbsp;Бирсент Хамди Карагарен</td></tr></tbody></table><br><span class="robotoBlack20">Главен Треньор:</span><span class="robotoBlackB20">Александър Благов Тунчев</span></td></tr><tr><td colspan="3">&nbsp;</td></tr></tbody></table></td></tr></tbody></table></body></html>`;
const s = E.parseSheet(sheetHtml);
ok(s.home.name === 'ПФК Славия 1913' && s.home.town === 'София' && s.away.name === 'ПФК Арда Кърджали 1924', 'sheet: the two teams');
ok(s.stadium === 'Славия - гр.София' && /15 Кръг/.test(s.competition), 'sheet: stadium and round: ' + s.competition);
ok(s.officials.length === 8 && s.officials.map(o => o.r).join() === 'ГС,АС1,АС2,4-ТИ,ВАР,АВАР,ДЕЛЕГАТ,СН', 'sheet: 8 officials with their roles: ' + s.officials.map(o => o.r).join());
ok(s.officials[0].n === 'Никола Антонов Попов' && s.officials[0].town === 'София' && s.officials[2].town === 'Дупница', 'sheet: an official\'s name and town');
ok(s.teams.length === 2 && s.teams[0].name === 'ПФК Славия 1913' && s.teams[0].xi.length === 11 && s.teams[0].subs.length === 10, 'sheet: Славия: 11 + 10 substitutes');
ok(s.teams[1].xi.length === 11 && s.teams[1].subs.length === 9 && s.teams[1].coach === 'Александър Благов Тунчев' && s.teams[0].coach === 'Ратко Достанич', 'sheet: Арда 11 + 9, both coaches');
ok(JSON.stringify(s.teams[0].xi[0]) === JSON.stringify({ n: '99', name: 'Иван Георгиев Андонов', gk: true }), 'sheet: the goalkeeper marked');
ok(s.teams[0].xi[6].cap && !s.teams[0].xi[6].gk && s.teams[1].xi[0].cap && s.teams[1].xi[0].gk, 'sheet: the captain marked (and captain-goalkeeper)');
ok(E.complete(s), 'sheet: complete (both elevens)');
// before the clubs fill it in: the officials, no teams
const early = sheetHtml.replace(/<tr><td colspan="3">&nbsp;<\/td><\/tr><tr><td><table>[\s\S]*$/, '</tbody></table></td></tr></tbody></table></body></html>');
const se = E.parseSheet(early);
ok(se.officials.length === 8 && se.teams.length === 0 && !E.complete(se), 'an early sheet: the officials, no teams yet, not complete');
const half = sheetHtml.replace(/(<td colspan="2" class="robotoWhiteB20">&nbsp;ПФК Арда Кърджали 1924<\/td><\/tr>)[\s\S]*?(<\/tbody><\/table><table>)/, '$1$2');
ok(!E.complete(E.parseSheet(half)), 'one team without its eleven: not complete');
ok(E.compact(E.compact(sheetHtml)) === E.compact(sheetHtml), 'compact() changes nothing the second time');
// 22 Nov: ЦСКА 1948 is written out; the Third League's delegate is also the observer; a coach written in capitals
const l22 = E.parseList(`<table>${[
  ['ПФК Ботев Враца', 'Враца', 'efbet Лига', '13:00', 'ФК Централен Спортен Клуб на Армията 1948', 'София', 'Враца', '9a6b4'],
  ['ПФК Левски', 'София', 'efbet Лига', '15:30', 'ФУТБОЛЕН КЛУБ ЛОКОМОТИВ СОФИЯ 1929 ЕАД', 'София', 'Георги Аспарухов - гр.София', '9a6cd'],
  ['ПФК Ботев АД', 'Пловдив', 'efbet Лига', '18:00', 'ПРОФЕСИОНАЛЕН ФУТБОЛЕН КЛУБ ЦСКА ЕАД', 'София', 'Колежа - гр.Пловдив', '9a6e6'],
].map((r, i) => block(i, ...r)).join('')}</table>`);
const p22 = E.pair([
  { id: 'a', league: 'efbet', kickoff: '2026-11-22T11:00:00Z', home_name: 'Ботев Враца', away_name: 'ЦСКА 1948' },
  { id: 'b', league: 'efbet', kickoff: '2026-11-22T13:30:00Z', home_name: 'Левски София', away_name: 'ПФК Локомотив София 1929' },
  { id: 'c', league: 'efbet', kickoff: '2026-11-22T16:00:00Z', home_name: 'Ботев Пловдив', away_name: 'ЦСКА София' },
], l22);
ok(p22.get('a') && p22.get('a').id === '9a6b4', 'ЦСКА 1948 pairs with "Централен Спортен Клуб на Армията 1948"');
ok(p22.get('b') && p22.get('b').id === '9a6cd' && p22.get('c') && p22.get('c').id === '9a6e6', 'Левски – Локомотив and Ботев Пловдив – ЦСКА pair too');
ok(E.teamScore('ЦСКА 1948', ['ПРОФЕСИОНАЛЕН ФУТБОЛЕН КЛУБ ЦСКА ЕАД', 'София']) < E.teamScore('ЦСКА 1948', ['ФК Централен Спортен Клуб на Армията 1948', 'София']), 'ЦСКА 1948 fits its own written-out name better than ЦСКА София\'s');
ok(E.teamScore('Славия 1913', ['ПФК Арда Кърджали 1924']) < 0 + 1, 'a different year counts against');
const sw = E.parseSheet(sheetHtml.replace('<span>БФС Делегат</span>', '<span>БФС Делегат/Наблюдател</span>').replace('Ратко Достанич', 'ДАНИЕЛ АЛЕКСАНДРЕ МОРАЛЕС БАТАЖЕЛО'));
ok(sw.officials[6].r === 'ДН' && sw.teams[0].coach === 'Даниел Александре Моралес Баталело'.replace('Баталело', 'Батажело'), 'Делегат/Наблюдател → ДН; a coach in capitals in the usual case: ' + sw.teams[0].coach);
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
