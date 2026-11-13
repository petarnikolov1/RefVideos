// The news feed: court and judiciary stories are not about referees ("съдия" is also a judge), and the leading outlets
// (Sportal, Gong, Blitz, Topsport, Dsport, БНТ, bTV…) are told apart from the rest. Runs the page's own code.
// node tests/feed.test.mjs
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('not found: ' + a); return html.slice(i, j); };
const P = await import('data:text/javascript,' + encodeURIComponent(cut('const RX_COURT', '// a youth headline is about the clubs') + cut('const MEDIA = [', 'const cutTitle') +
  '\nexport { notRefereeing, mediaTier, LEADING };'));
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

// real headlines that were saved
for (const t of ['При 69,44 процента активност приключи изборният ден за членове на Висшия съдебен съвет от квотата на съдиите в Монтана',
  'Разпитаха пред съдия част от екипажа на „Челси 3“, чакат експертизи', 'Командоси взеха проби от пробойната на „Челси 3“, екипажът е разпитан пред съдия',
  'Спортният арбитраж решава съдбата на финала за Купата на африканските нации през ноември'])
  ok(P.notRefereeing({ title: t }), 'hidden (a judge, not a referee): ' + t.slice(0, 70));
for (const t of ['Вижте как футболист рита в главата съдия, Дани Петканов зове прокуратурата', 'Моуриньо се оправда със съдията за боя от Атлетико',
  'Апелативната комисия на БФС отхвърли жалба на Септември (Сф) и остави в сила наказанието на Галин Иванов',
  'Обсада на „Септември“ след 1:3 за „Родопа“ срещу „Несебър“ – съдии и гости напуснаха с полицейски ескорт',
  'Why was Slavko Vincic arrested in 2020? The 2026 World Cup final referee’s arrest explained', 'Courtois speaks out about referees and VAR'])
  ok(!P.notRefereeing({ title: t }), 'kept: ' + t.slice(0, 70));

// the leading outlets, by the names Google News gives them
for (const s of ['Sportal.bg', 'Gong.bg', 'Blitz.bg', 'Topsport.bg', 'Dsport.bg', 'БНТ Новини', 'bTV Спорт', 'www.24chasa.bg', '7DniSport.bg', 'nova.bg', 'Български Футболен Съюз'])
  ok(P.mediaTier(s) === P.LEADING, 'leading: ' + s);
for (const s of ['EraNova.bg', 'Novsport', 'Plovdiv24.bg', 'Palms Sport', 'Facebook', 'https://novini247.com/'])
  ok(P.mediaTier(s) < P.LEADING, 'not leading: ' + s);

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
