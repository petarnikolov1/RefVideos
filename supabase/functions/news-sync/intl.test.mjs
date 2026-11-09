// Tests for the international media filter (intl.js): node intl.test.mjs
import { analyzeIntl, topOutlet, INTL_QUERIES, intlUrl } from './intl.js';
import { parseRss, toArticle } from './news.js';

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const keep = (t, lang, comps) => {
  const a = analyzeIntl(t, '', lang);
  ok(!!a && (!comps || comps.every(c => a.comps.includes(c))), `keep [${lang}] ${t} → ${a ? a.comps.join('+') + ' ' + a.cats.join(',') : 'dropped'}`);
  return a;
};
const drop = (t, lang) => { const a = analyzeIntl(t, '', lang); ok(!a, `drop [${lang}] ${t}${a ? ' → kept ' + a.comps.join('+') : ''}`); };

// English
keep('Arsenal denied penalty as VAR fails to intervene in Chelsea draw', 'en', ['eng']);
keep('Howard Webb admits Liverpool goal should not have been disallowed', 'en', ['eng']);
keep('Referee for Manchester derby named as Michael Oliver', 'en', ['eng']);
keep('Chelsea fined by FA for failing to control players after referee row', 'en', ['eng']);
keep('Arsenal beat the odds after red card for Rice', 'en', ['eng']);
keep('Real Madrid furious with referee after Champions League defeat to Arsenal', 'en', ['ucl']);
keep('England denied clear penalty in World Cup qualifier, says Tuchel', 'en', ['nat']);
const lev = keep('Levski Sofia furious with referee after Europa League defeat', 'en', ['uel']);
ok(lev && lev.divs.includes('eur') && lev.clubs.includes('levski'), 'a Bulgarian club abroad shows in the Bulgaria tab too');
drop('Arsenal 2-1 Chelsea LIVE: Saka scores penalty', 'en');
drop('Bukayo Saka scores penalty as Arsenal beat Chelsea', 'en');
drop('Celtic denied penalty by VAR in Scottish Premiership', 'en');
drop('England women denied penalty in Euro qualifier', 'en');
drop('Rugby: red card for Leicester', 'en');
drop('Leeds sign striker on loan', 'en');
drop('Arsenal v Chelsea prediction, odds and betting tips', 'en');
drop('Sheffield United denied penalty in Championship clash', 'en');
drop('Inter Miami furious with referee after MLS defeat', 'en');
drop('Liverpool injury news: Salah ruled out for six weeks', 'en');
drop('Nice weather for the derby as Arsenal prepare', 'en');
// real headlines of 8 November 2026 (Google News, Premier League search)
keep("Why Palmer was not awarded a penalty for Chelsea against Sunderland", 'en', ['eng']);
keep('Breaking down the two controversial penalty incidents in Sunderland v Chelsea', 'en', ['eng']);
keep('Premier League VAR review: Arsenal robbed of a penalty through misapplied law', 'en', ['eng']);
keep('Leeds 1-0 Tottenham: Tottenham set to complain to Pro Ref - but should Bogle have seen red?', 'en', ['eng']);
keep('Lampard says hair pull warranted Coventry penalty', 'en', ['eng']);
drop('Sunderland stun Chelsea as Le Fée’s penalty breathes life into Black Cats', 'en');
drop('Sunderland 1-0 Chelsea: Le Fee penalty ends Premier League winless run', 'en');
drop('Chelsea pay the penalty in latest defeat to Sunderland', 'en');
drop('Brighton 2-0 Brentford | Premier League highlights', 'en');
drop('[Podcasts] LA VAR : L\'OM a-t-il raison de croire encore à la qualification en Ligue Europa ?', 'fr');
keep('LOSC - Olivier Létang écope d\'une très lourde sanction après ses critiques sur l\'arbitrage face au PSG', 'fr', ['fra']);
keep('Zufferli in totale confusione, dà rigore al Bologna ma il fallo è chiaramente fuori area', 'it', ['ita']);
keep('Inter-Como moviola: tutti gli episodi arbitrali del big match di Serie A', 'it', ['ita']);
drop('Se il vicepresidente del Suriname a 65 anni segna su rigore in Serie A...', 'it');
keep('BVB-Dusel: Schiedsrichter gesteht Fehlentscheidung', 'de', ['ger']);
drop('"Frechheit": Wolfsburg tobt wegen Schiri im Hertha-Spiel', 'de');
keep('Alberola Rojas arbitrará el partido del Metropolitano', 'es', ['esp']);
keep('Valverde adelanta al Madrid con más polémica y el Valencia reclama un penalti de Huijsen', 'es', ['esp']);
// a league's own site: the league comes from the site
const pl = toArticle({ title: 'Matchweek 10 VAR decisions explained: Why Palmer didn\'t win a penalty - Premier League', link: 'https://news.google.com/x', date: new Date('2026-11-08'),
  desc: 'Matchweek 10 VAR decisions explained: Why Palmer didn\'t win a penalty  Premier League', source: 'Premier League', srcUrl: 'https://www.premierleague.com' }, 'google', { ctx: 'intl', lang: 'en' }, Date.parse('2026-11-08'));
ok(pl && pl.comps.includes('eng'), 'premierleague.com\'s VAR explainer is a Premier League story');
// Spanish
keep('El Real Madrid denuncia el arbitraje de Gil Manzano ante el Barcelona', 'es', ['esp']);
keep('Polémica en el Metropolitano: el VAR anula un gol al Atlético', 'es', ['esp']);
keep('Tiempo de revisión: el CTA explica el penalti del Betis', 'es', ['esp']);
drop('Como en casa: el Getafe gana con un penalti', 'es');
drop('El Barcelona ficha a un delantero: contrato hasta 2030', 'es');
drop('Tanda de penaltis: el Sevilla pasa en la Copa', 'es');
// Italian
keep('Moviola Inter-Juventus: il rigore era netto, sbaglia l\'arbitro', 'it', ['ita']);
keep('Rocchi: "Il VAR doveva intervenire su Lazio-Roma"', 'it', ['ita']);
keep('Champions, polemica per il rigore negato al Napoli', 'it', ['ucl']);
drop('Calciomercato Juventus: trattativa per il centrocampista', 'it');
drop('Serie B, rigore e rosso: il Palermo vince', 'it');
// German
keep('Bayern: Elfmeter-Ärger nach Videobeweis gegen Dortmund', 'de', ['ger']);
keep('Kölner Keller greift ein: Tor von Leverkusen aberkannt', 'de', ['ger']);
drop('2. Bundesliga: Rote Karte für Schalke-Profi', 'de');
drop('Handball-Bundesliga: Schiedsrichter im Fokus', 'de');
// French
keep('PSG : l\'arbitrage de Marseille fait polémique après le carton rouge', 'fr', ['fra']);
keep('Ligue 1 : le but refusé de Lens pour hors-jeu fait débat', 'fr', ['fra']);
drop('Ligue 2 : carton rouge et penalty pour Saint-Étienne', 'fr');
drop('Mercato : le PSG prolonge son défenseur, contrat jusqu\'en 2030', 'fr');

// outlets
ok(topOutlet('en', 'https://www.bbc.co.uk', 'BBC') && topOutlet('en', 'https://www.skysports.com', 'Sky Sports') && topOutlet('es', 'https://www.marca.com', 'MARCA')
  && topOutlet('it', 'https://www.gazzetta.it', 'La Gazzetta dello Sport') && topOutlet('de', 'https://www.kicker.de', 'kicker') && topOutlet('fr', 'https://www.lequipe.fr', "L'Équipe"), 'the big outlets are kept');
ok(!topOutlet('en', 'https://www.someblog.co.uk', 'Some Blog') && !topOutlet('es', 'https://www.bbc.co.uk', 'BBC') && topOutlet('en', '', 'Sky Sports') && !topOutlet('en', '', 'Random FC News'),
  'other sites are left out (an outlet counts for its own language only)');
// searches
ok(INTL_QUERIES.length >= 25 && ['en', 'es', 'it', 'de', 'fr'].every(l => INTL_QUERIES.some(q => q.lang === l)), `${INTL_QUERIES.length} searches in five languages`);
ok(intlUrl(INTL_QUERIES[12], Date.parse('2026-11-01'), Date.parse('2026-11-08')).endsWith('&hl=es&gl=ES&ceid=ES:es'), 'each search uses its country\'s Google News edition');

// a Google News item from an international outlet
const xml = `<rss><channel><item><title>Arsenal denied penalty as VAR fails to intervene - BBC Sport</title><link>https://news.google.com/rss/articles/abc</link>
<pubDate>Sat, 07 Nov 2026 18:00:00 GMT</pubDate><description>Arsenal denied penalty as VAR fails to intervene BBC Sport</description><source url="https://www.bbc.co.uk">BBC Sport</source></item>
<item><title>Arsenal denied penalty as VAR fails to intervene in draw - Random Gooner Blog</title><link>https://news.google.com/rss/articles/def</link>
<pubDate>Sat, 07 Nov 2026 18:00:00 GMT</pubDate><source url="https://randomgooner.blogspot.com">Random Gooner Blog</source></item></channel></rss>`;
const items = parseRss(xml);
ok(items[0].srcUrl === 'https://www.bbc.co.uk', 'the outlet\'s address is read from the feed');
const art = toArticle(items[0], 'google', { ctx: 'intl', lang: 'en' }, Date.parse('2026-11-08'));
ok(art && art.lang === 'en' && art.scope === 'world' && art.comps.includes('eng') && art.src === 'BBC Sport' && art.title === 'Arsenal denied penalty as VAR fails to intervene', 'a BBC article becomes a World article in English');
ok(!toArticle(items[1], 'google', { ctx: 'intl', lang: 'en' }, Date.parse('2026-11-08')), 'a blog is left out');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
