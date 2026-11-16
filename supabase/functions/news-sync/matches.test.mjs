// Tests of the per-match search (matches.js): which match a headline is about, what is kept as the match's coverage,
// what stays a refereeing article, and when a match is searched. The headlines are what Google News gave on
// 16 Nov 2026 for "Рилски спортист Хебър" (Втора лига, 16th round, 15 Nov 2026, 1:1).
// node supabase/functions/news-sync/matches.test.mjs
import * as MS from './matches.js';

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

// the season's matches around it (football_matches, 6–22 Nov 2026)
const M = (id, league, kickoff, status, home_name, away_name) => ({ id, league, kickoff, status, home_name, away_name });
const rows = [
  M('efbet:534559', 'efbet', '2026-11-06T15:00:00Z', 'finished', 'Септември София', 'ПФК Локомотив София 1929'),
  M('efbet:534554', 'efbet', '2026-11-06T17:15:00Z', 'finished', 'Ботев Пловдив', 'Дунав Русе'),
  M('efbet:534548', 'efbet', '2026-11-07T11:30:00Z', 'finished', 'Ботев Враца', 'Локомотив Пловдив'),
  M('sw3:kyustendil:levski-ii', 'sw3', '2026-11-07T12:00:00Z', 'finished', 'Кюстендил (Кюстендил)', 'Левски II (София)'),
  M('sw3:minyor:tsska-iii', 'sw3', '2026-11-07T12:00:00Z', 'finished', 'Миньор (Перник)', 'ЦСКА III (София)'),
  M('efbet:534560', 'efbet', '2026-11-07T14:00:00Z', 'finished', 'Славия София', 'Черно море Варна'),
  M('mrbit:15:vihren:lokgo', 'mrbit', '2026-11-08T12:30:00Z', 'finished', 'Вихрен', 'Локомотив Г. Оряховица'),
  M('mrbit:15:hebar:marek', 'mrbit', '2026-11-08T14:30:00Z', 'finished', 'Хебър 1918', 'Марек'),
  M('efbet:534543', 'efbet', '2026-11-08T15:00:00Z', 'finished', 'Левски София', 'ЦСКА София'),
  M('mrbit:15:cska2:rilski', 'mrbit', '2026-11-09T12:30:00Z', 'finished', 'ЦСКА София II', 'Рилски Спортист'),
  M('mrbit:16:marek:chernomorets', 'mrbit', '2026-11-14T12:30:00Z', 'finished', 'Марек', 'Черноморец 1919 Бургас'),
  M('mrbit:16:nesebar:fratria', 'mrbit', '2026-11-15T12:30:00Z', 'finished', 'Несебър', 'Фратрия'),
  M('mrbit:16:lokgo:cska2', 'mrbit', '2026-11-15T12:30:00Z', 'finished', 'Локомотив Г. Оряховица', 'ЦСКА София II'),
  M('mrbit:16:pirin:montana', 'mrbit', '2026-11-15T12:30:00Z', 'finished', 'Пирин Благоевград', 'Монтана'),
  M('mrbit:16:rilski:hebar', 'mrbit', '2026-11-15T12:30:00Z', 'finished', 'Рилски Спортист', 'Хебър 1918'),
  M('mrbit:16:sportist:spartakpl', 'mrbit', '2026-11-15T12:30:00Z', 'finished', 'Спортист Своге', 'Спартак Плевен'),
  M('mrbit:16:beroe:vihren', 'mrbit', '2026-11-15T13:30:00Z', 'finished', 'Берое', 'Вихрен'),
  M('mrbit:17:chernomorets:rilski', 'mrbit', '2026-11-21T10:15:00Z', 'scheduled', 'Черноморец 1919 Бургас', 'Рилски Спортист'),
  M('mrbit:17:hebar:lokgo', 'mrbit', '2026-11-21T12:30:00Z', 'scheduled', 'Хебър 1918', 'Локомотив Г. Оряховица'),
  M('uefa:x', 'uefa.europa', '2026-11-05T17:45:00Z', 'finished', 'Levski Sofia', 'Ferencvaros'),
];
const ctx = MS.context(rows);
const byId = Object.fromEntries(ctx.matches.map(m => [m.id, m]));
const RH = byId['mrbit:16:rilski:hebar'];

ok(MS.searchQuery(RH) === '"Рилски спортист" "Хебър"', 'the strict search: "Рилски спортист" "Хебър" → ' + MS.searchQuery(RH));
ok(/after%3A2026-11-12%20before%3A2026-11-22/.test(MS.searchUrl(RH, Date.parse('2026-12-01T00:00:00Z'))), 'searched from 3 days before to a week after the kickoff');
ok(/after%3A2026-11-12%20before%3A2026-11-17/.test(MS.searchUrl(RH, Date.parse('2026-11-16T10:00:00Z'))), '…but never past tomorrow (Google drops a "before:" in the future)');
ok(MS.searchQuery(byId['efbet:534548']) === '"Ботев" ("Локомотив" OR "Локо")', 'Локомотив is searched as Локомотив or Локо');
const S3 = MS.searches(RH);
ok(S3.length === 3 && S3[0].strict && !S3[1].strict && !S3[2].strict, 'three searches: strict, loose, and the leading outlets');
ok(S3[1].q === 'Рилски спортист Хебър' && /^Рилски спортист Хебър \(site:gong\.bg OR site:sportal\.bg OR /.test(S3[2].q), 'loose: ' + S3[1].q + ' · outlets: ' + S3[2].q.slice(0, 60) + '…');

// the Google News results for the match: [headline - outlet, outlet's address, published (UTC)] → the match it is about, kind
const item = (t, url, at) => ({ title: t, link: 'https://news.google.com/rss/articles/x', date: new Date(at), desc: '', source: t.slice(t.lastIndexOf(' - ') + 3), srcUrl: url });
const now = Date.parse('2026-11-16T09:00:00Z');
const cases = [
  ['Рилски спортист надигра Хебър, но взе само точка с късен гол - Sportal.bg', 'https://sportal.bg', '2026-11-15T15:20:00Z', 'mrbit:16:rilski:hebar', 'match'],
  ['Рилски спортист и Хебър не успяха да се победят в Самоков - Gong.bg', 'https://gong.bg', '2026-11-15T15:05:00Z', 'mrbit:16:rilski:hebar', 'match'],
  ['Рилски спортист защитава домакинската си серия срещу Хебър - Palms Sport', 'https://palmssport.bg', '2026-11-14T08:00:00Z', 'mrbit:16:rilski:hebar', 'match'],
  ['Хебър взе точка в Самоков, а можеше да си тръгне с три : Вестник Знаме - новини Пазарджик и областта - Zname.info', 'https://www.zname.info', '2026-11-15T18:02:41Z', 'mrbit:16:rilski:hebar', 'match'],
  ['Рилски спортист се пребори за точка срещу Хебър с късна дузпа на Божилов - Palms Sport', 'https://palmssport.bg', '2026-11-15T15:11:39Z', 'mrbit:16:rilski:hebar', 'ref'],
  ['Рилски спортист надигра Хебър, но взе само точка с късен гол - KotaSport', 'https://www.kotasport.com', '2026-11-15T16:00:00Z', 'mrbit:16:rilski:hebar', 'match'],
  ['Николай Митов след равния в Самоков: Нямаме право да правим такава дузпа (ВИДЕО) - Sportal.bg', 'https://sportal.bg', '2026-11-15T16:31:00Z', 'mrbit:16:rilski:hebar', 'ref'],
  // Google's date for Gong's report: a date without a time, four days off
  ['Рилски спортист и Хебър не успяха да се победят в Самоков - Gong.bg', 'https://gong.bg', '2026-11-11T08:00:00Z', 'mrbit:16:rilski:hebar', 'match'],
  ['Рилски спортист и Хебър не успяха да се победят в Самоков - Gong.bg', 'https://gong.bg', '2026-11-11T08:07:13Z', null, null],
  ['Хебър взе точка в Самоков - Gong.bg', 'https://gong.bg', '2026-11-11T08:00:00Z', null, null],
  // other matches the same search brings
  ['Алвеша дебютира начело на Марек в домакинството срещу Черноморец - Palms Sport', 'https://palmssport.bg', '2026-11-14T09:00:00Z', 'mrbit:16:marek:chernomorets', 'match'],
  ['Фратрия спечели драматичен мач с Несебър - Dsport.bg', 'https://dsport.bg', '2026-11-15T15:00:00Z', 'mrbit:16:nesebar:fratria', 'match'],
  ['Хебър удари Марек с 3:1 - marica.bg', 'https://www.marica.bg', '2026-11-08T17:00:00Z', 'mrbit:15:hebar:marek', 'match'],
  ['Георги Йомов се разписа при победа на ЦСКА II над Рилски спортист - ФОКУС', 'https://www.focus-news.net', '2026-11-09T15:00:00Z', 'mrbit:15:cska2:rilski', 'match'],
  ['Шоколадите се усладиха на Спартак Плевен - KotaSport', 'https://www.kotasport.com', '2026-11-15T16:04:12Z', 'mrbit:16:sportist:spartakpl', 'match'],
  ['Монтана с ключов успех в Благоевград, изплува от опасната зона - KotaSport', 'https://www.kotasport.com', '2026-11-15T16:06:55Z', 'mrbit:16:pirin:montana', 'match'],
  // a refereeing article about no single match: the refereeing searches find it, not this one
  ['Трима елитни съдии с наряди за Втора лига - Dsport.bg', 'https://dsport.bg', '2026-11-13T10:00:00Z', null, null],
  // left out: round-ups, programmes, tables, quotes that name no team or venue, several clubs, aggregators, betting sites
  ['На върха във Втора лига става все по-интересно - Sportal.bg', 'https://sportal.bg', '2026-11-15T19:00:00Z', null, null],
  ['Тройна битка за върха в Mr Bit Втора лига (резултати) - Gong.bg', 'https://gong.bg', '2026-11-15T17:00:00Z', null, null],
  ['Стартира 16-и кръг във Втора лига - програма ᐉ Новини от Fakti.bg - Спорт - Fakti.bg', 'https://fakti.bg', '2026-11-14T07:00:00Z', null, null],
  ['8 мача от футболната Втора лига ще се изиграят днес - ФОКУС', 'https://www.focus-news.net', '2026-11-15T07:00:00Z', null, null],
  ['Резултати и класиране във Втора лига - Football24.bg', 'https://football24.bg', '2026-11-15T18:00:00Z', null, null],
  ['Пламен Крумов: Доволен съм от характера,но не и от резултата - KotaSport', 'https://www.kotasport.com', '2026-11-15T17:00:00Z', null, null],
  ['ЦСКА II ще си връща върха във Втора лига, Вихрен с тежко гостуване на Берое - Тема Спорт', 'https://temasport.com', '2026-11-14T10:00:00Z', null, null],
  ['Домакините стигнаха до равенството с късен гол Рилски спортист завърши - https://novini247.com/', 'https://novini247.com', '2026-11-15T16:00:00Z', null, null],
  ['Рилски спортист и Хебър без победител - Букмейкър Рейтинги', 'https://bookmaker-ratings.bg', '2026-11-15T16:00:00Z', null, null],
  ['Прогноза за Рилски спортист - Хебър: залози и коефициенти - Sportal.bg', 'https://sportal.bg', '2026-11-14T10:00:00Z', null, null],
  ['MrBit Втора лига на живо: Как може да гледате мача Рилски спортист срещу Хебър - Gong.bg', 'https://gong.bg', '2026-11-13T10:17:03Z', null, null],
  ['НА ЖИВО: Рилски спортист 0:1 Хебър, греда за гостите - Gong.bg', 'https://gong.bg', '2026-11-15T13:10:41Z', null, null],
  ['НА ЖИВО: Рилски спортист - Хебър, съставите - Gong.bg', 'https://gong.bg', '2026-11-15T12:01:41Z', null, null],
  ['Рилски спортист - Хебър /стартови състави/ - Gong.bg', 'https://gong.bg', '2026-11-15T12:01:41Z', null, null],
  ['Ман Сити - Ман Юнайтед, Рилски спортист - Хебър и Лига на нациите по ТВ днес - ФОКУС', 'https://www.focus-news.net', '2026-11-15T06:01:41Z', null, null],
  ['Рилски спортист - Хебър 1:1 /репортаж/ - Gong.bg', 'https://gong.bg', '2026-11-15T14:31:41Z', 'mrbit:16:rilski:hebar', 'match'],
  ['Десподов се завърна с асистенция след близо осем месеца извън игра - Football24.bg', 'https://football24.bg', '2026-11-15T20:00:00Z', null, null],
];
for (const [t, url, at, want, kind] of cases) {
  const r = MS.toRow(item(t, url, at), RH, ctx, now);
  const got = r ? `${r.kind} ${r.match_id}` : 'left out';
  ok(r ? r.kind === kind && r.match_id === want : kind === null, `${t.replace(/ - [^-]+$/, '')} → ${got}`);
}
// from a loose search only a headline naming both teams counts (other sports share the clubs' names)
const L = (t, url, at) => { const r = MS.toRow(item(t, url, at), RH, ctx, now, false); return r ? `${r.kind} ${r.match_id}` : 'left out'; };
ok(L(cases[1][0], cases[1][1], cases[1][2]) === 'match mrbit:16:rilski:hebar', 'loose search: Gong\'s report (both teams) is kept');
ok(L(cases[3][0], cases[3][1], cases[3][2]) === 'left out', 'loose search: "Хебър взе точка в Самоков" (one team) is not');
ok(L('Рилски спортист се справи със Спортинг в Самоков - Sportal.bg', 'https://sportal.bg', '2026-11-15T19:00:00Z') === 'left out', 'loose search: Рилски спортист\'s basketball game in Самоков is not the football match');
ok(L(cases[6][0], cases[6][1], cases[6][2]) === 'left out', 'loose search: a refereeing headline naming only the venue is left to the refereeing searches');
ok(MS.toRow(item('Рилски спортист надигра Хебър в мач от НБЛ - Sportal.bg', 'https://sportal.bg', '2026-11-15T19:00:00Z'), RH, ctx, now) === null, 'the other sports\' leagues: left out (НБЛ)');
const sportal = MS.toRow(item(cases[0][0], cases[0][1], cases[0][2]), RH, ctx, now);
ok(sportal.title === 'Рилски спортист надигра Хебър, но взе само точка с късен гол' && sportal.src === 'Sportal.bg' && sportal.divs.join() === 'd2' &&
  sportal.clubs.join() === 'rilski,hebar' && sportal.cats.join() === 'match', 'a coverage row: headline, outlet, Втора лига, both clubs, cats "match"');
ok(sportal.aid === 'рилски спортист надигра хебър но взе само точка с късен гол|sportal bg', 'the same key as a refereeing article would have');

// which match a headline is about
const W = (t, at) => { const m = MS.whichMatch(t, Date.parse(at), ctx); return m ? m.id : null; };
ok(W('Ботев и Локо не се победиха във Враца', '2026-11-07T15:00:00Z') === 'efbet:534548', 'two short names ("Ботев", "Локо"): the match between them, not each one\'s other matches');
ok(W('Кюстендил би Левски II', '2026-11-07T15:00:00Z') === 'sw3:kyustendil:levski-ii', 'a reserve team of the Third League: "Левски II"');
ok(W('Левски II падна в Кюстендил', '2026-11-08T18:00:00Z') !== 'efbet:534543', '…and "Левски II" is not Левски\'s match with ЦСКА');
ok(W('Миньор надигра ЦСКА III', '2026-11-07T15:00:00Z') === 'sw3:minyor:tsska-iii', '"ЦСКА III" is not ЦСКА II');
ok(W('ЦСКА U19 би Левски U19', '2026-11-08T18:00:00Z') === null, 'youth teams: no match');
ok(W('Хебър на 1/4-финал за Купата на България', '2026-11-16T18:00:00Z') === null, 'a cup tie: not on the Results page');
ok(W('Хебър подготвя мача', '2026-11-20T10:12:30Z') === 'mrbit:17:hebar:lokgo', 'one team, the day before its next match: that match');
ok(W('Хебър подготвя мача', '2026-11-12T06:12:30Z') === null, 'one team, more than 3 days after its last match and 2 before its next: none');
ok(W('Левски след Ференцварош: продължаваме', '2026-11-06T09:14:00Z') === null, 'a club right after a European match: not its league match');
ok(W('Треньорът след равния в Пазарджик', '2026-11-08T17:21:09Z') === 'mrbit:15:hebar:marek', 'the venue: "в Пазарджик" is Хебър\'s home match');
ok(W('Хебър подготвя мача', '2026-11-20T10:00:00Z') === null, 'one team with a date but no time (it can be days off): no match');
ok(W('Треньорът след загубата в София', '2026-11-08T17:21:09Z') === null, '…not "в София" (several clubs play there)');

// when each match is searched: 3 h, 20 h, 2 days and 5 days after the kickoff; never searched → now
const k = Date.parse(RH.kickoff), dueIds = (seen, at) => MS.due(ctx, seen, at).map(m => m.id);
ok(!dueIds({}, k + 2 * 3600e3).includes(RH.id), 'not before 3 hours after the kickoff');
ok(dueIds({}, k + 4 * 3600e3).includes(RH.id), 'due 3 hours after the kickoff');
ok(!dueIds({ [RH.id]: k + 4 * 3600e3 }, k + 10 * 3600e3).includes(RH.id), 'searched: not again before 20 hours');
ok(dueIds({ [RH.id]: k + 4 * 3600e3 }, k + 21 * 3600e3).includes(RH.id), '…then again');
ok(!dueIds({ [RH.id]: k + 6 * 864e5 }, k + 30 * 864e5).includes(RH.id), 'after the last search (5 days), never again');
ok(dueIds({}, k + 30 * 864e5).includes('mrbit:15:hebar:marek'), 'an old match never searched: due');
ok(!dueIds({}, k + 30 * 864e5).includes('mrbit:17:hebar:lokgo'), 'a match still "scheduled" (not played, or no result yet): not searched');
ok(!MS.due(ctx, {}, now).some(m => m.status === 'scheduled'), 'only played matches are searched');
ok(MS.due(ctx, {}, now)[0]._t >= MS.due(ctx, {}, now).at(-1)._t, 'newest matches first');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
