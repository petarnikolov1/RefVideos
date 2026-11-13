// News search for BG Referee Watch: the searches, feed parsing and the refereeing filter.
// Plain JS so it runs in the Supabase Edge Function and can be tested with Node.
// The international media for the World sections (English only) are in intl.js.
import { analyzeIntl, topOutlet, leagueHint, looksEnglish, bilingual } from './intl.js';

export const SEASON_START = '2026-07-01';               // 2026/27 season
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
// Google shows a cookie-consent page to EU servers unless consent cookies are present
export const GOOGLE_COOKIES = 'CONSENT=YES+cb.20240101-00-p0.bg+FX+000; SOCS=CAESHAgBEhJnd3NfMjAyNDAxMDEtMF9SQzIaAmJnIAEaBgiA_LyuBg';

export const REFEREES = ['Георги Кабаков', 'Волен Чинков', 'Никола Попов', 'Мартин Марков', 'Драгомир Драганов',
  'Радослав Гидженов', 'Ивайло Стоянов', 'Венцислав Митрев', 'Станимир Тренчев'];
const REF_SURNAMES = ['Кабаков', 'Чинков', 'Гидженов', 'Тренчев', 'Митрев'];
const SITES = ['sportal.bg', 'gong.bg', 'blitz.bg', 'topsport.bg', 'dsport.bg', 'bulgarian-football.com',
  'bfunion.bg', 'novsport.com', 'btvnovinite.bg', '24chasa.bg'];

/* ───────────── searches ───────────── */
const OR = a => '(' + a.join(' OR ') + ')';
const REF = OR(['съдия', 'съдии', 'съдията', 'съдийство', 'рефер', 'арбитър', 'ВАР', 'VAR']);
const INC = OR(['съдия', 'съдийство', 'ВАР', 'дузпа', '"червен картон"', 'засада', '"отменен гол"']);
const LG = OR(['"efbet Лига"', '"Първа лига"', '"Втора лига"', '"Трета лига"']);
const BGX = OR(['"efbet Лига"', '"Втора лига"', '"Трета лига"', 'БФС', 'Левски', 'ЦСКА', 'Лудогорец', 'Локомотив',
  'Ботев', '"Черно море"', 'Славия', 'Арда', 'Септември', 'Спартак', 'Дунав']);
const WREF = OR(['съдия', 'съдията', 'рефер', 'арбитър', 'ВАР', 'VAR', 'дузпа', '"червен картон"', 'засада']);
const Q = (q, ctx = 'bg', div = null) => ({ q, ctx, div });

// ctx 'bg' = Bulgarian domestic searches, 'loose' = general searches, 'world' = top-5 leagues, European cups, national teams
export const GOOGLE_QUERIES = [
  Q(`${REF} "efbet Лига"`, 'bg', 'd1'),
  Q(`${REF} "Първа лига" футбол`, 'bg', 'd1'),
  Q(`${REF} "Втора лига"`, 'bg', 'd2'),
  Q(`${REF} ("Трета лига" OR "Трета аматьорска")`, 'bg', 'd3'),
  Q(`${REF} (Югозапад OR Югоизток OR Северозапад OR Североизток) футбол`, 'bg', 'd3'),
  Q(`("Съдийската комисия" OR "Съдийска комисия") (БФС OR футбол)`),
  Q(`("Дисциплинарната комисия" OR "Дисциплинарна комисия") БФС`),
  Q(`(ВАР OR VAR OR "Hawk-Eye") ("efbet Лига" OR БФС OR "Втора лига")`),
  Q(`дузпа ${LG}`),
  Q(`("червен картон" OR "жълт картон" OR изгонен) ${LG}`),
  Q(`(засада OR офсайд) ${LG}`),
  Q(`("отменен гол" OR "отмени гол" OR "отмененият гол" OR "неправилно отменен") ${BGX}`),
  Q(`("съдийски грешки" OR "съдийска грешка" OR "съдийски скандал" OR "съдийски гаф") футбол`, 'loose'),
  Q(`скандал (съдия OR съдийство OR ВАР) ${BGX}`),
  Q(`(сбиване OR меле OR побой OR инциденти) мач ${LG}`),
  Q(`(нападнаха OR нападнат OR пребиха OR заплашиха OR удари) (съдия OR съдията OR рефера) футбол`, 'loose'),
  Q(`("прекратен мач" OR "прекрати мача" OR "прекратена среща" OR "изоставен мач") футбол`, 'loose'),
  Q(`(наказан OR наказаха OR отстранен OR "извън наряд" OR спрян) (съдия OR рефер OR съдията) футбол`, 'loose'),
  Q(`(наряд OR "ще ръководи" OR "ще свири" OR "главен съдия") ${LG}`),
  Q(`(протест OR "отворено писмо" OR "официална позиция") (съдийство OR съдия) ${BGX}`),
  Q(`(ЦСКА OR Левски OR Лудогорец OR "ЦСКА 1948") (съдия OR съдийство OR дузпа OR "червен картон" OR ВАР)`, 'bg', 'd1'),
  Q(`(Локомотив OR Ботев OR "Черно море" OR Славия OR Арда OR Септември OR "Спартак Варна" OR Дунав) (съдия OR дузпа OR "червен картон" OR ВАР)`, 'bg', 'd1'),
  Q(`(Берое OR Добруджа OR Монтана OR Етър OR Хебър OR Фратрия OR Янтра OR Вихрен OR Марица OR Пирин OR Литекс OR Спортист) (съдия OR дузпа OR "червен картон")`, 'bg', 'd2'),
  Q(OR(REFEREES.map(n => `"${n}"`)) + ' футбол'),
  Q(`"Купа на България" (съдия OR дузпа OR "червен картон" OR ВАР)`, 'bg', 'cup'),
  Q(`(фенове OR хулигани OR пиротехника) (глоба OR наказание OR инциденти) ${LG}`),
  Q(`БФС (глоба OR глоби OR наказание OR санкции) (клуб OR футболист OR треньор)`),
  Q(`("служебна загуба" OR "служебно 3:0" OR "без публика") футбол БФС`),
  Q(`("уреден мач" OR "уредени мачове" OR "черно тото" OR манипулиране) футбол България`, 'loose'),
  ...SITES.map(s => Q(`site:${s} ${INC} ${BGX}`)),
  // World: top-5 leagues, the three European cups and national teams
  Q(`${WREF} ("Висшата лига" OR "Премиър лийг" OR "английското първенство")`, 'world'),
  Q(`${WREF} ("Ла Лига" OR "испанското първенство" OR "Реал Мадрид" OR Барселона)`, 'world'),
  Q(`${WREF} ("Серия А" OR "италианското първенство" OR Ювентус OR Интер OR Милан)`, 'world'),
  Q(`${WREF} (Бундеслигата OR Бундеслига OR Байерн OR Дортмунд)`, 'world'),
  Q(`${WREF} ("Лига 1" OR "френското първенство" OR ПСЖ)`, 'world'),
  Q(`${WREF} ("Шампионска лига" OR "Шампионската лига")`, 'world'),
  Q(`(Ливърпул OR "Манчестър Юнайтед" OR "Манчестър Сити" OR Арсенал OR Челси) (съдия OR ВАР OR дузпа OR "червен картон")`, 'world'),
  Q(`("съдийски скандал" OR "скандално съдийство" OR "ВАР скандал" OR "VAR скандал") (Висшата OR "Ла Лига" OR "Серия А" OR Бундеслигата OR "Лига 1" OR "Шампионска лига")`, 'world'),
  Q(`(ВАР OR VAR OR дузпа OR "червен картон" OR съдията) (Тотнъм OR Нюкасъл OR "Астън Вила" OR "Нотингам Форест" OR Евертън OR "Уест Хям" OR Брайтън)`, 'world'),
  Q(`("Майкъл Оливър" OR "Антъни Тейлър" OR "Хауърд Уеб" OR PGMOL OR "Саймън Хупър" OR "Крис Кавана")`, 'world'),
  Q(`(ВАР OR VAR OR дузпа OR "червен картон" OR съдията) ("Реал Мадрид" OR Барселона OR "Атлетико Мадрид")`, 'world'),
  Q(`(Негрейра OR "случая Негрейра" OR "испанските съдии" OR "Техническия комитет на съдиите")`, 'world'),
  Q(`(ВАР OR VAR OR дузпа OR "червен картон" OR съдията) (Ювентус OR Интер OR Милан OR Наполи OR Рома OR Лацио OR Аталанта)`, 'world'),
  Q(`(ВАР OR VAR OR дузпа OR "червен картон" OR съдията) (Байерн OR Дортмунд OR Леверкузен OR Лайпциг OR Щутгарт)`, 'world'),
  Q(`(ВАР OR VAR OR дузпа OR "червен картон" OR съдията) (ПСЖ OR Марсилия OR Монако OR Лион OR Лил)`, 'world'),
  Q(`${WREF} ("Лига Европа" OR "Лигата Европа")`, 'world'),
  Q(`${WREF} ("Лига на конференциите" OR "Лигата на конференциите" OR "Конферентната лига")`, 'world'),
  Q(`${WREF} ("Лига на нациите" OR "Лигата на нациите")`, 'world'),
  Q(`${WREF} ("световно първенство" OR Мондиал OR "световните квалификации" OR "квалификациите за Мондиал")`, 'world'),
  Q(`${WREF} ("европейско първенство" OR "Евро 2028" OR "квалификациите за Евро")`, 'world'),
  Q(`(съдия OR съдията OR ВАР OR дузпа OR "червен картон") ("националния отбор" OR националите OR трикольорите)`, 'world'),
  Q(`${WREF} ("Копа Америка" OR "Купата на африканските нации" OR "Купа на африканските нации")`, 'world'),
];
export const BING_QUERIES = [
  ...['съдия efbet Лига', 'съдийство Левски ЦСКА Лудогорец', 'ВАР efbet Лига', 'дузпа efbet Лига', 'червен картон efbet Лига',
    'съдия Втора лига футбол', 'съдия Трета лига футбол', 'Съдийска комисия БФС', 'Дисциплинарна комисия БФС наказания',
    'скандал съдия мач футбол', 'нападнаха съдия футбол', 'отменен гол засада ВАР'].map(q => Q(q, 'loose')),
  ...['ВАР скандал Висшата лига', 'съдия скандал Шампионска лига', 'ВАР Ла Лига скандал', 'съдия Серия А скандал', 'ВАР Бундеслига',
    'съдия ПСЖ Лига 1', 'съдия Лига Европа', 'съдия Лига на конференциите', 'съдия Лига на нациите', 'съдия националния отбор'].map(q => Q(q, 'world')),
];
const ymd = d => new Date(d).toISOString().slice(0, 10);
export const googleUrl = (q, from, to) => 'https://news.google.com/rss/search?q=' +
  encodeURIComponent(`${q} after:${ymd(from)} before:${ymd(to)}`) + '&hl=bg&gl=BG&ceid=BG:bg';
export const bingUrl = q => 'https://www.bing.com/news/search?q=' + encodeURIComponent(q) +
  '&format=rss&setlang=bg&cc=BG&qft=' + encodeURIComponent('sortbydate="1"');

/* ───────────── feeds ───────────── */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };
export const decode = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m));
const cdata = s => String(s || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
export const htmlToText = html => decode(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export function parseRss(xml) {
  if (!/<(rss|channel|feed)[\s>]/i.test(xml)) throw new Error('response is not a feed');
  const out = [];
  for (const m of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    const get = tag => { const r = it.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')); return r ? cdata(r[1]).trim() : ''; };
    const su = it.match(/<source\b[^>]*\burl="([^"]*)"/i);
    out.push({ title: htmlToText(get('title')), link: decode(get('link')), date: new Date(get('pubDate')),
      desc: htmlToText(decode(get('description'))), source: htmlToText(get('source') || get('News:Source')), srcUrl: su ? decode(su[1]) : '' });
  }
  return out;
}
const unBing = link => { try { return new URL(link).searchParams.get('url') || link; } catch { return link; } };
export const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* ───────────── refereeing filter ───────────── */
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])', W = '\\p{L}*';
const rx = s => new RegExp(B + '(?:' + s + ')', 'iu');
const CS = list => new RegExp('(?<![\\p{L}\\p{N}])(?:' + list.join('|') + ')(?![\\p{L}])', 'u');   // case-sensitive names
export const RX = {
  referee:   rx(`съди(?:я|ята|и|ите|йск${W}|йств${W})${E}|съдийск${W}|съдийств${W}|рефер${W}|арбит${W}|отсъ(?:ди|жда|дено|дена)${W}|страничн${W} съди${W}|четвърт${W} съди${W}`),
  var:       rx(`(?:вар|var)(?:-?(?:а|ът|ове))?${E}|hawk-?eye|хоук-?ай|видеоарбит${W}|видеоповтор${W}|видеосъди${W}`),
  red:       rx(`червен${W} картон${W}|жълт${W} картон${W}|картон${W} (?:за|на) |изгон${W}|втори жълт${W}|с човек по-малко|с играч по-малко|в десет души|остана${W} с десет|наказан${W} (?:за|с) \\d+ мач${W}`),
  penalty:   rx(`дузп${W}|наказател${W} удар${W}|11-метров${W}|единадесетметров${W}|бял(?:а|ата) точка`),
  offside:   rx(`засад${W}|офсайд${W}|отмен${W} (?:гол${W}|попадени${W})|гол${W} (?:беше |бе |е )?отмен${W}|неправилно отменен${W}|признат${W} гол${W}|непризнат${W}`),
  foul:      rx(`фаул${W}|фал${E}|фалове${W}|груб${W} нарушени${W}|нарушени${W} (?:срещу|над)|симулаци${W}|симулира${W}|игра с ръка|ръка в наказателното|влизане отзад`),
  committee: rx(`съдийск${W} комиси${W}|наряд${W}|делегира${W}|ще ръководи|ще свири|главен съдия на|назнач${W} (?:за )?(?:главен )?съди${W}|съдийск${W} назначени${W}|чуждестран${W} съди${W}|чужд${W} съди${W}|съдийск${W} анализ${W}|анализ${W} на съдийств${W}|наблюдател${W}|свир${W} (?:на|дербито|мача|вечното)|избра${W} (?:рефер${W}|съди${W})`),
  discipline:rx(`дисциплинарн${W} комиси${W}|дк${E}|наказан${W}|наказаха${E}|наказани${W}|глоб${W}|санкци${W}|без публика|при закрити врати|служебн${W} загуб${W}|служебно 3:0|отнет${W} точк${W}|изтегля${W} точк${W}|дисквалифи${W}`),
  fights:    rx(`сбиван${W}|сбиха|сбил${W}|меле${E}|мелето|побо${W}|пребит${W}|пребиха|нападна${W}|нападнат${W}|бой (?:на|между|в|във)${E}|удари${W} (?:съди${W}|рефер${W})|ритна${W} (?:съди${W}|рефер${W})|инцидент${W}|хулиган${W}|пиротехник${W}|бомбичк${W}|факл${W}|нахлу${W}|жандармер${W}|арест${W}|юмру${W}|шамар${W}`),
  // disputes that are about refereeing on their own: match fixing, abandoned matches, "robbed"
  dispRef:   rx(`ограб${W}|ощет${W}|слугинаж${W}|призна${W} (?:\\d+ |две |три |една |сериозн${W} |груб${W} )?(?:съдийск${W} )?грешк${W}|черно тото|уреден${W} мач${W}|уговорен${W}|манипул${W}|корупц${W}|прекрат${W} (?:мач${W}|среща${W}|двубо${W})|прекратен${W} мач${W}|мач${W} (?:беше |бе |е )?прекратен${W}|изоставен${W} мач|напусна${W} терена|отказа${W} да (?:излез|продълж)${W}|повтор${W} (?:на )?(?:дузп${W}|изпълнени${W})|дузп${W} (?:беше |бе |е )?повтор${W}|две изпълнения`),
  // disputes that count only together with a referee/VAR word
  dispStrong:rx(`скандал${W}|протест${W}|открадн${W}|открадна${W}|кражб${W}|обир${W}|грабеж${W}|отворено писмо|бойкот${W}|официална позиция`),
  dispWeak:  rx(`грешк${W}|сгреш${W}|спорн${W}|възмут${W}|гняв${W}|ярост${W}|недовол${W}|обвин${W}|жалб${W}|абсурд${W}|позор${W}|безобраз${W}|освирк${W}|подсвирк${W}|натиск${W}|бесен${W}|бесни${W}|критик${W}|критикува${W}|гаф${W}|оплак${W}|изригна${W}|избухна${W}`),
  // player / manager / club stories: kept only with a direct refereeing word
  // a penalty taken, scored, saved or missed is a player's action, not a refereeing decision
  penExec:   rx(`спаси${W}|спасен${W}|изпусна${W}|изпуснат${W}|пропусна${W}|пропуснат${W}|вкара${W}|реализира${W}|превърна${W}|бележи${W}|удови${W}|от бялата точка|(?:от|с) дузпа` +
    // who takes the penalties, a penalty "taken", and penalty shootouts
    `|изпълнява${W} (?:\\p{L}+ )?дузп${W}|изпълнен${W} дузп${W}|(?:след|при|на|чрез|с) (?:изпълнени${W} на )?дузпи(?:те)?${E}|сери${W} (?:от )?дузпи|драма с дузпи`),
  live:      rx(`на живо|live${E}|минута по минута|текстово предаване`),
  personal:  rx(`смен${W} (?:на )?треньор${W}|треньор${W} (?:е |беше )?сменен${W}|трансфер${W}|договор${W}|подписа${W}|привлече${W}|привлича${W}|напуска${W}|напусна${E}|раздел${W} се|освобод${W}|нов${W} треньор${W}|треньорск${W} пост${W}|наставник${W} на|назначен${W} за треньор${W}|уволн${W}|оставк${W}|контузи${W}|травм${W}|операци${W}|възстановява${W}|лекар${W}|интервю${W}|рожден${W} ден|сватб${W}|семейств${W}|съпруг${W}|бебе${E}|заплат${W}|собственик${W}|акционер${W}|бюджет${W}|спонсор${W}|лиценз${W}|стадион${W} (?:ще|се строи|ремонт)|национал${W}|повикан${W}|лагер${W}|подготовк${W}|контрол${W}|приятелск${W}|юноша${E}|юноши${E}|академия${W}|отдаде почит|почина|скърб${W}|наследник${W}|капитан${W} на`),
  foot:      rx(`футбол${W}|мач${W}|efbet|ефбет|лига${W}|гол${E}|гола${E}|голът|голове${W}|голов${W}|отбор${W}|кръг${W}|стадион${W}|треньор${W}|наставник${W}|футболист${W}|играч${W}|пфк|фк${E}|бфс|първенств${W}|шампионат${W}|полувреме${W}|двубо${W}|дерби${W}|терен${W}`),
  league1:   rx(`efbet\\s*(?:лига|league|liga)|ефбет\\s*лига|първа(?:та)? (?:професионална )?(?:футболна )?лига|първ${W} ниво|елита${E}|а група|а-група`),
  league2:   rx(`втора(?:та)? (?:професионална )?(?:футболна )?лига|втор${W} ешелон|втор${W} дивизи${W}|mrbit|мр\\.?\\s?бит|б група|б-група`),
  league3:   rx(`трета(?:та)? (?:аматьорска )?(?:футболна )?лига|трет${W} ешелон|трет${W} дивизи${W}|аматьорск${W} (?:футболн${W} )?лига|(?:група |зона )?[„"«]?(?:югозапад|югоизток|северозапад|североизток)${W}`),
  cup:       rx(`купа(?:та)? на българия|суперкупа(?:та)?(?: на българия)?`),
  bgOrg:     rx(`бфс${E}|български(?:я)? футболен съюз|бпфл${E}|професионалн${W} футболн${W} лига`),
  euro:      rx(`квалификаци${W}`),   // qualifiers of an unknown competition
  // Russian football: "ЦСКА" next to Краснодар or Зенит is CSKA Moscow, not the Bulgarian club
  ruFoot:    new RegExp('(?<![\\p{L}])(?:(?:ЦСКА|Спартак|Локомотив|Динамо|Торпедо)\\s*[(,]?\\s*(?:Москва|М)(?![\\p{L}])|Зенит|Краснодар|Ростов|Ахмат|Оренбург|Химки|' +
    'Крил(?:ия|я) Советов|РПЛ|руск(?:ата|ия|ото)? (?:висша лига|премиер лига|премиър лига|първенство|шампионат|футбол))(?![\\p{L}])', 'u'),
  foreign:   rx(`англи${W}|англичан${W}|испан${W}|итали${W}|герман${W}|франц${W}|френск${W}|португал${W}|холанд${W}|нидерланд${W}|турск${W}|турци${W}|гърц${W}|гръцк${W}|румън${W}|сръбск${W}|сърби${W}|хърват${W}|руск${W}|русия|украин${W}|украйн${W}|шотланд${W}|белги${W}|саудит${W}|млс${E}|mls${E}|бразил${W}|аржентин${W}|мексик${W}|фифа${E}|fifa${E}|уефа${E}|uefa${E}|москва|истанбул|атина|солун|букурещ|белград|загреб|маями|кипър${W}|кипърск${W}|израел${W}|полск${W}|полша|чехи${W}|чешк${W}|австри${W}|швейцар${W}|унгар${W}|европейск${W}`),
  otherSport:rx(`баскетбол${W}|волейбол${W}|хандбал${W}|футзал${W}|плаж${W} футбол${W}|мини-?футбол${W}|хокей${W}|тенис${W}|бокс${W}|mma${E}|формула 1|ръгби|водна топка`),
  court:     rx(`прокурат${W}|съд${E}|съда${E}|съдът|подсъдим${W}|обвиняем${W}|присъд${W}|осъд${W}|дело${E}|делото|адвокат${W}|районн${W} съд|градск${W} съд|апелатив${W}|мярка за неотклонение`),
  video:     rx(`видео${W}|video${E}|клип${W}|кадри${E}|вижте${E}|гледайте`),
  // a Bulgarian referee without a name: "български съдия", "наш рефер", "съдия №1 у нас", "варненски съдия", "българинът"
  bgRef:     rx(`(?:българск|наш|варненск|пловдивск|софийск|бургаск|русенск|старозагорск|търновск|великотърновск)${W} (?:съди|рефер|арбит)${W}|` +
    `(?:съди|рефер)${W} (?:№ ?|номер )(?:1|едно) (?:у нас|на българия|в българия)|българин(?:ът)?${E}|великотърновец${E}`),
};

// Bulgarian clubs: [key, division, display name, pattern]
export const CLUBS = [
  ['levski', 'd1', 'Левски', '(?<!Васил\\s)(?<!В\\.\\s?)Левски'], ['cska', 'd1', 'ЦСКА София', 'ЦСКА(?!\\s*[-–—]?\\s*1948|\\s*(?:II|2(?!\\d|\\s*[:–—-]\\s*\\d)|Москва))'], ['cska48', 'd1', 'ЦСКА 1948', 'ЦСКА\\s*[-–—]?\\s*1948'],
  ['ludo', 'd1', 'Лудогорец', 'Лудогорец(?!\\s*(?:II|III|2(?!\\d|\\s*[:–—-]\\s*\\d)|3(?!\\d|\\s*[:–—-]\\s*\\d)))'], ['chm', 'd1', 'Черно море', 'Черно море(?!\\s*(?:II|2(?!\\d|\\s*[:–—-]\\s*\\d)))'],
  ['lokpd', 'd1', 'Локомотив Пловдив', 'Локомотив\\s*\\(?(?:Пловдив|Пд)\\)?|Локо\\s*\\(?Пд\\)?'],
  ['loksf', 'd1', 'Локомотив София', 'Локомотив\\s*\\(?(?:София|Сф)\\)?|Локо\\s*\\(?Сф\\)?'],
  ['botpd', 'd1', 'Ботев Пловдив', 'Ботев\\s*\\(?(?:Пловдив|Пд)\\)?(?!\\s*(?:II|2(?!\\d|\\s*[:–—-]\\s*\\d)))'], ['botvr', 'd1', 'Ботев Враца', 'Ботев\\s*\\(?(?:Враца|Вр)\\)?'],
  ['slavia', 'd1', 'Славия', 'Славия(?!\\s*Прага)'], ['arda', 'd1', 'Арда'], ['septemvri', 'd1', 'Септември'],
  ['spartakvn', 'd1', 'Спартак Варна', 'Спартак\\s*\\(?(?:Варна|Вн)\\)?'], ['dunav', 'd1', 'Дунав'],
  ['beroe', 'd2', 'Берое'], ['dobrudzha', 'd2', 'Добруджа'], ['montana', 'd2', 'Монтана'], ['fratria', 'd2', 'Фратрия'],
  ['yantra', 'd2', 'Янтра'], ['vihren', 'd2', 'Вихрен'], ['etar', 'd2', 'Етър'], ['hebar', 'd2', 'Хебър'], ['maritsa', 'd2', 'Марица'],
  ['pirin', 'd2', 'Пирин'], ['litex', 'd2', 'Литекс'], ['sportist', 'd2', 'Спортист'], ['chernomorets', 'd2', 'Черноморец'],
  ['neftochimic', 'd2', 'Нефтохимик'], ['belasitsa', 'd2', 'Беласица'], ['minyor', 'd2', 'Миньор'], ['sevlievo', 'd2', 'Севлиево'],
  ['marek', 'd2', 'Марек'], ['strumska', 'd2', 'Струмска слава'], ['vitosha', 'd2', 'Витоша'], ['slivnishki', 'd2', 'Сливнишки герой'],
  ['spartakpl', 'd2', 'Спартак Плевен', 'Спартак\\s*\\(?Плевен\\)?'],
  ['lokgo', 'd2', 'Локомотив ГО', 'Локомотив\\s*\\(?(?:Горна Оряховица|ГО|Г\\. Оряховица)\\)?'],
  ['cska2', 'd2', 'ЦСКА II', 'ЦСКА\\s*(?:II|2(?!\\d|\\s*[:–—-]\\s*\\d))'], ['ludo2', 'd2', 'Лудогорец II', 'Лудогорец\\s*(?:II|2(?!\\d|\\s*[:–—-]\\s*\\d))'],
  ['botev2', 'd2', 'Ботев II', 'Ботев\\s*\\(?(?:Пловдив|Пд)?\\)?\\s*(?:II|2(?!\\d|\\s*[:–—-]\\s*\\d))'],
].map(([k, div, label, pat]) => ({ k, div, label, re: CS([pat || label]) }));
const clubsIn = t => CLUBS.filter(c => c.re.test(t)).map(c => c.k);
// "Съдия" is also a judge: a headline about a court, the judiciary or an investigation, with nothing about football in it, is
// not about referees ("екипажът на „Челси 3“ е разпитан пред съдия", "Висшия съдебен съвет от квотата на съдиите в Монтана")
export const COURT = new RegExp(B + `(?:пред съди${W}|разпит${W}|съда|съдът|съдилищ${W}|съдебн${W}|прокур${W}|делото|присъд${W}|осъд${W}|обвиняем${W}|` +
  `подсъдим${W}|адвокат${W}|магистрат${W}|всс|вкс|вас|еспч|конституционн${W} съд${W}|арбитражн${W} съд${W}|спортни${W} арбитраж|квотата на съдиите|` +
  `избирателна активност|екипаж${W}|кораб${W})${E}`, 'iu');
export const FOOTBALL = new RegExp(B + `(?:мач${W}|футбол${W}|гол(?:а|ът|ове|овете)?${E}|дузп${W}|картон${W}|вар${E}|var${E}|засад${W}|лига(?:та)?${E}|бфс${E}|уефа${E}|фифа${E}|` +
  `рефер${W}|арбитър${W}|арбитри${W}|свир${W}|наряд${W}|стадион${W}|треньор${W}|футболист${W}|играч${W}|фенове${W}|агитк${W}|дерби${W})`, 'iu');
const REFNAMES = CS(REFEREES.concat(REF_SURNAMES).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

// World section: the five big leagues, the three European cups and national teams
// (league names are case-insensitive, club names case-sensitive)
export const WORLD = [
  { k: 'eng', lg: rx(`висш${W} лига${W}|премиър лийг${W}|английск${W} (?:първенство|елит|висша)${W}|премиършип|pgmol`),
    cl: CS(['Ливърпул', 'Манчестър(?: Юнайтед| Сити)?', 'Арсенал', 'Челси', 'Тотнъм', 'Нюкасъл', 'Астън Вила', 'Уест Хям', 'Евертън', 'Брайтън',
      'Нотингам(?: Форест)?', 'Кристъл Палас', 'Фулъм', 'Брентфорд', 'Борнемут', 'Борнмът', 'Лийдс', 'Съндърланд', 'Ковънтри', 'Хъл Сити', 'Ипсуич',
      'Майкъл Оливър', 'Антъни Тейлър', 'Хауърд Уеб']) },
  { k: 'esp', lg: rx(`ла лига${W}|примера дивисион|испанск${W} първенство${W}|испанск${W} съди${W}|негрейра`),
    cl: CS(['Реал Мадрид', 'Реал', 'Барселона', 'Барса', 'Атлетико(?: Мадрид)?', 'Севиля', 'Виляреал', 'Бетис', 'Валенсия', 'Атлетик Билбао',
      'Реал Сосиедад', 'Осасуна', 'Хетафе', 'Селта', 'Еспаньол', 'Райо Валекано', 'Жирона']) },
  { k: 'ita', lg: rx(`серия а${E}|серие а${E}|калчо|италианск${W} първенство${W}`),
    cl: CS(['Ювентус', 'Милан', 'Интер(?! Маями)', 'Наполи', 'Рома', 'Лацио', 'Аталанта', 'Фиорентина', 'Болоня', 'Торино', 'Дженоа', 'Удинезе']) },
  { k: 'ger', lg: rx(`бундеслига${W}|германск${W} първенство${W}`),
    cl: CS(['Байерн(?: Мюнхен)?', 'Борусия(?: Дортмунд| Мьонхенгладбах)?', 'Дортмунд', 'Лайпциг', 'Байер Леверкузен', 'Леверкузен', 'Айнтрахт', 'Щутгарт',
      'Волфсбург', 'Фрайбург', 'Хофенхайм', 'Вердер(?: Бремен)?', 'Унион Берлин', 'Шалке', 'Хамбургер']) },
  { k: 'fra', lg: rx(`лига 1${E}|френск${W} първенство${W}|лига едно`), cl: CS(['ПСЖ', 'Пари Сен Жермен', 'Марсилия', 'Лион', 'Монако', 'Лил', 'Ланс', 'Ница']) },
  { k: 'ucl', lg: rx(`шампионска${W} лига${W}|лига${W} на шампионите|champions league`), cl: null },
  { k: 'uel', lg: rx(`лига(?:та)? европа|europa league`), cl: null },
  { k: 'uecl', lg: rx(`лига(?:та)? на конференциите|конферентна${W} лига|conference league`), cl: null },
  { k: 'nat', lg: rx(`национал${W} отбор${W}|национали(?:те)?${E}|националн${W} (?:тим|селекци)${W}|трикольор${W}|световн${W} първенств${W}|(?:сп|еп) 20\\d\\d|мондиал${W}|` +
      `евро 20\\d\\d|европейск${W} първенств${W}|лига(?:та)? на нациите|световн${W} квалификаци${W}|квалификаци${W} за (?:световно|мондиал|евро|европейско)${W}|` +
      `копа америка|купа(?:та)? на африканските нации`), cl: null },
];
const TOP5 = ['eng', 'esp', 'ita', 'ger', 'fra'];
const WGT = { red: 3, penalty: 3, offside: 2, var: 3, foul: 2, committee: 2, discipline: 2, fights: 3, dispute: 3 };
const DIRECT = ['red', 'penalty', 'offside', 'var', 'foul'];       // decisions a referee makes on the pitch

// "фаул" is also a free kick: a goal from a free kick is not a refereeing story
const FREE_KICK = new RegExp(B + '(?:(?:директно |пряко )?(?:от|с|чрез) фаул' + W + '|пряк' + W + ' фаул' + W + '|изпълн' + W + ' (?:на )?фаул' + W +
  '|(?:страхотн|красив|майсторск|перфектн|фантастичн|невероятн|чудесн|брилянтн|прекрасн)' + W + ' фаул' + W + '|вкара' + W + ' (?:\\p{L}+ )?фаул' + W + ')', 'giu');

// Is this headline (and description) about refereeing? Returns the classification, or null to leave it out.
export function analyze(title, desc, q) {
  title = String(title).replace(FREE_KICK, ' '); desc = String(desc || '').replace(FREE_KICK, ' ');
  const t = title + ' \n ' + (desc || '');
  const L1 = RX.league1.test(t), L2 = RX.league2.test(t), L3 = RX.league3.test(t), CUP = RX.cup.test(t);
  const anyLeague = L1 || L2 || L3 || CUP;
  if (RX.otherSport.test(t) && !anyLeague) return null;                       // basketball, volleyball…
  const ru = RX.ruFoot.test(t);
  const clubs = clubsIn(t).filter(k => !(ru && k === 'cska')), refName = REFNAMES.test(t);
  const bgSignal = anyLeague || clubs.length > 0 || refName || RX.bgOrg.test(t);
  const comps = WORLD.filter(w => w.lg.test(t) || (w.cl && w.cl.test(t))).map(w => w.k);

  let scope;
  if (anyLeague) scope = 'bg';
  // a Bulgarian club named next to a big league is a Bulgarian story; the European cups and national teams are World
  else if (comps.length) scope = (clubs.length && comps.every(c => TOP5.includes(c))) ? 'bg' : 'world';
  else if (RX.euro.test(t)) return null;                                     // qualifiers of some other competition
  else if ((RX.foreign.test(t) || ru) && !clubs.length && !refName) return null;      // other foreign football
  else if (bgSignal || (q && q.ctx === 'bg')) scope = 'bg';
  else return null;

  // what kind of refereeing it is about
  const cats = [];
  for (const k of ['red', 'penalty', 'offside', 'var', 'foul', 'committee', 'discipline', 'fights']) if (RX[k].test(t)) cats.push(k);
  const refHit = RX.referee.test(t) || refName;
  if (RX.dispRef.test(t) || ((RX.dispStrong.test(t) || RX.dispWeak.test(t)) && (refHit || cats.includes('var')))) cats.push('dispute');

  // 1. it must be about refereeing: a referee, a decision, a card, a sanction, an incident
  if (!refHit && !cats.length) return null;
  // 2. it must be football: "съдия" is also a court judge
  const foot = anyLeague || clubs.length > 0 || refName || RX.bgOrg.test(t) || RX.foot.test(t) || comps.length > 0 || cats.some(c => ['penalty', 'var', 'red'].includes(c));
  if (!foot) return null;
  if (RX.court.test(t) && !(refName || comps.length || cats.some(c => DIRECT.includes(c)) || RX.foot.test(title))) return null;
  if (COURT.test(title) && !FOOTBALL.test(title)) return null;
  // 3. player / manager / club stories (transfers, injuries, contracts, coaching changes, interviews…)
  //    only stay when the headline itself is about a referee or a decision on the pitch
  if (RX.personal.test(title) && !(RX.referee.test(title) || REFNAMES.test(title) || DIRECT.some(c => RX[c].test(title)) || RX.dispRef.test(title))) return null;
  // 4. the headline itself must be about refereeing (the description only adds detail)
  const refInTitle = RX.referee.test(title) || REFNAMES.test(title);
  const titleSignal = refInTitle || ['red', 'penalty', 'offside', 'var', 'foul', 'committee', 'discipline', 'fights', 'dispRef'].some(k => RX[k].test(title));
  if (!titleSignal) return null;
  // 5. a penalty that was only taken / saved / missed, and live match blogs, are not refereeing stories
  const disputed = refInTitle || RX.var.test(title) || RX.dispRef.test(title) || RX.dispStrong.test(title) || RX.dispWeak.test(title);
  const onlyPenalty = cats.every(c => c === 'penalty' || c === 'dispute') && RX.penalty.test(title);
  if (onlyPenalty && RX.penExec.test(title) && !disputed) return null;
  if (RX.live.test(title) && !refInTitle) return null;
  if (scope === 'world' && !(refHit || cats.some(c => DIRECT.includes(c)))) return null;

  const divs = [];
  let hinted = false;
  // a World story about a Bulgarian club (Левски in the Europa League) or a Bulgarian referee (Гидженов in the Nations
  // League) is shown in the Bulgaria tab too: division "eur"
  if (scope === 'world' && (clubsIn(title).length || REFNAMES.test(title) || RX.bgRef.test(title))) divs.push('eur');
  if (scope === 'bg') {
    if (L1) divs.push('d1'); if (L2) divs.push('d2'); if (L3) divs.push('d3'); if (CUP) divs.push('cup');
    if (!divs.length) for (const d of new Set(clubs.map(k => CLUBS.find(c => c.k === k).div))) divs.push(d);
    if (!divs.length && q && q.div && q.ctx === 'bg') { divs.push(q.div); hinted = true; }
    if (!divs.length) divs.push('unk');
  }
  let score = 1;
  for (const c of cats) score += WGT[c] * ((c === 'dispute' ? (RX.dispRef.test(title) || RX.dispStrong.test(title)) : RX[c].test(title)) ? 2 : 1);
  if (RX.referee.test(title) || REFNAMES.test(title)) score += 2;
  if (!cats.length) cats.push('other');
  return { scope, divs, comps, cats, score, hinted, clubs, vh: RX.video.test(title) };
}

// Russian, Ukrainian, Serbian or Macedonian (Google News also gives those for Bulgarian searches): letters Bulgarian
// doesn't have, Russian words Bulgarian doesn't have ("которая", "матч", "судья"…), or a site from those countries
const NOT_BG_LETTERS = /[ыэёіїєґѓќѕџљњјђћ]/iu;
const RU_WORDS = new RegExp('(?<![\\p{L}])(?:котор(?:ый|ая|ое|ые|ого|ой|ому|ым|ых|ую)|матч(?:а|е|у|ем|и|ей|ах)?|суд(?:ья|ьи|ье|ью|ьей|ей)|арбитров|' +
  'игрок(?:а|и|ов|у)?|сборн(?:ая|ой|ую)|также|только|будет|будут|было|были|стала|чтобы|что|сегодня|очень|тренер(?:а|ы|у|ом)?|' +
  'чемпионат(?:а|е|у)?|обслуж(?:ит|ат|ивать)|из-за|его|нет|год|году)(?![\\p{L}])', 'iu');
export const notBulgarian = (title, src, link) => NOT_BG_LETTERS.test(String(title)) || RU_WORDS.test(String(title)) ||
  /\.(?:ru|ua|by|kz|rs|mk|me|ba)$/i.test(String(src || '').trim()) || /^https?:\/\/[^/]*\.(?:ru|ua|by|kz|rs|mk|me|ba)(?:[/:?#]|$)/i.test(String(link || ''));

// one feed item → an article row (or null when it isn't about refereeing / is before the season)
// q.ctx 'intl': an international outlet's article in English for the World sections (q.lang en)
export function toArticle(raw, kind, q, now = Date.now()) {
  if (q && q.ctx === 'intl') return toIntlArticle(raw, q, now);
  let title = String(raw.title || '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  let src = String(raw.source || '').trim(), link = raw.link || '';
  if (kind === 'google') {
    const i = title.lastIndexOf(' - ');
    if (i > 15) { if (!src) src = title.slice(i + 3).trim(); title = title.slice(0, i).trim(); }
  } else link = unBing(link);
  if (!src) { try { src = new URL(link).hostname.replace(/^www\./, ''); } catch { /* keep empty */ } }
  let desc = String(raw.desc || '').trim();
  // Google's description only repeats the headline and the outlet's name
  const bare = src && desc.endsWith(src) ? desc.slice(0, -src.length).trim() : desc;
  if (desc && (norm(bare).startsWith(norm(title).slice(0, 40)) || norm(title).startsWith(norm(bare)))) desc = '';
  if (desc.length > 300) desc = desc.slice(0, 297) + '…';
  if (notBulgarian(title, src, link)) return null;
  const a = analyze(title, desc, q);
  if (!a) return null;
  let d = raw.date instanceof Date ? raw.date.getTime() : NaN;
  if (!isFinite(d) || d > now + 864e5) d = now;
  if (d < Date.parse(SEASON_START + 'T00:00:00Z')) return null;
  const base = norm(title).slice(0, 90);
  if (base.length < 8) return null;
  return { aid: base + '|' + norm(src || 'unknown').slice(0, 30), title, link, descr: desc, src, published_at: new Date(d).toISOString(),
    scope: a.scope, divs: a.divs, comps: a.comps, cats: a.cats, score: a.score, hinted: a.hinted, clubs: a.clubs, vh: a.vh, lang: 'bg' };
}

function toIntlArticle(raw, q, now) {
  let title = String(raw.title || '').replace(/\s+/g, ' ').trim(), src = String(raw.source || '').trim();
  const i = title.lastIndexOf(' - ');
  if (i > 15) { if (!src) src = title.slice(i + 3).trim(); title = title.slice(0, i).trim(); }
  if (!title || !topOutlet(q.lang, raw.srcUrl, src)) return null;            // the big outlets only
  if (/[Ѐ-ӿ]/.test(title)) return null;                            // not in the edition's language
  if (!looksEnglish(title, bilingual(raw.srcUrl))) return null;              // English only (marca.com, sport.es… also write Spanish)
  let desc = String(raw.desc || '').trim();
  const bare = src && desc.endsWith(src) ? desc.slice(0, -src.length).trim() : desc;
  if (desc && (norm(bare).startsWith(norm(title).slice(0, 40)) || norm(title).startsWith(norm(bare)))) desc = '';
  if (desc.length > 300) desc = desc.slice(0, 297) + '…';
  const hint = leagueHint(raw.srcUrl);                                        // premierleague.com → "Premier League"
  const a = analyzeIntl(title, [desc, hint].filter(Boolean).join(' · '), q.lang);
  if (!a) return null;
  let d = raw.date instanceof Date ? raw.date.getTime() : NaN;
  if (!isFinite(d) || d > now + 864e5) d = now;
  if (d < Date.parse(SEASON_START + 'T00:00:00Z')) return null;
  const base = norm(title).slice(0, 90);
  if (base.length < 8) return null;
  return { aid: base + '|' + norm(src || 'unknown').slice(0, 30), title, link: raw.link || '', descr: desc, src, published_at: new Date(d).toISOString(),
    scope: a.scope, divs: a.divs, comps: a.comps, cats: a.cats, score: a.score, hinted: false, clubs: a.clubs, vh: a.vh, lang: q.lang };
}
export { analyzeIntl };

// 2-week search windows from the season start up to now, newest first
export function windows(now = Date.now(), days = 14) {
  const out = [], step = days * 864e5, from = Date.parse(SEASON_START + 'T00:00:00Z');
  for (let s = from; s <= now; s += step) out.push([s - 864e5, Math.min(s + step, now) + 2 * 864e5]);
  return out.reverse();
}
