// International media for the World sections: the refereeing stories of the five big leagues, the European cups and
// the national teams as the big outlets of those countries write them — in English (BBC, Sky Sports, ESPN, The Guardian,
// The Athletic…), Spanish (Marca, AS, Mundo Deportivo…), Italian (Gazzetta, Corriere dello Sport…), German (kicker,
// Bild, Sportschau…) and French (L'Équipe, RMC Sport…).
// Searched on Google News in each country's edition; only articles from the outlets listed in MEDIA are kept.
// Plain JS so it runs in the Edge Function and can be tested with Node.

/* ───────────── searches ───────────── */
const ED = { en: 'hl=en-GB&gl=GB&ceid=GB:en', es: 'hl=es&gl=ES&ceid=ES:es', it: 'hl=it&gl=IT&ceid=IT:it', de: 'hl=de&gl=DE&ceid=DE:de', fr: 'hl=fr&gl=FR&ceid=FR:fr' };
export const ACCEPT_LANG = { en: 'en-GB,en;q=0.9', es: 'es-ES,es;q=0.9', it: 'it-IT,it;q=0.9', de: 'de-DE,de;q=0.9', fr: 'fr-FR,fr;q=0.9' };
const Q = (lang, q) => ({ q, ctx: 'intl', lang });
const EN = '(referee OR VAR OR "red card" OR penalty)';
export const INTL_QUERIES = [
  Q('en', `${EN} "Premier League"`),
  Q('en', `${EN} (Arsenal OR Liverpool OR Chelsea OR "Manchester City" OR "Manchester United" OR Tottenham)`),
  Q('en', `${EN} (Newcastle OR "Aston Villa" OR Everton OR Brighton OR "Nottingham Forest" OR "Crystal Palace" OR Fulham OR Brentford OR Bournemouth OR Leeds OR Sunderland)`),
  Q('en', `(PGMOL OR "Howard Webb" OR "Key Match Incidents" OR "Michael Oliver" OR "Anthony Taylor" OR "Simon Hooper" OR "Chris Kavanagh" OR "Paul Tierney" OR "Stuart Attwell" OR "Jarred Gillett" OR "Sam Barrott")`),
  Q('en', `${EN} "Champions League"`),
  Q('en', `${EN} ("Europa League" OR "Conference League")`),
  Q('en', `${EN} ("World Cup qualifier" OR "World Cup qualifying" OR "Nations League" OR "Euro 2028" OR "World Cup")`),
  Q('en', `(referee OR VAR) ("La Liga" OR "Real Madrid" OR Barcelona OR Atletico OR Negreira)`),
  Q('en', `(referee OR VAR) ("Serie A" OR Juventus OR "Inter Milan" OR "AC Milan" OR Napoli OR Roma)`),
  Q('en', `(referee OR VAR) (Bundesliga OR "Bayern Munich" OR Dortmund OR Leverkusen)`),
  Q('en', `(referee OR VAR) ("Ligue 1" OR PSG OR Marseille OR Lyon)`),
  Q('en', `("VAR controversy" OR "refereeing decision" OR "referee error" OR "VAR error" OR "VAR blunder" OR "penalty decision")`),
  Q('es', `(árbitro OR arbitraje OR VAR OR penalti OR "tarjeta roja") LaLiga`),
  Q('es', `(árbitro OR arbitraje OR VAR OR penalti OR expulsión) ("Real Madrid" OR Barcelona OR Atlético)`),
  Q('es', `(árbitro OR VAR OR penalti OR expulsión) (Sevilla OR Betis OR Villarreal OR Athletic OR "Real Sociedad" OR Valencia OR Osasuna OR Celta OR Espanyol)`),
  Q('es', `("Comité Técnico de Árbitros" OR CTA OR Negreira OR "Tiempo de revisión" OR "audios del VAR" OR colegiado)`),
  Q('es', `(árbitro OR VAR OR penalti) ("Champions League" OR "Liga de Campeones" OR "Europa League" OR "Conference League" OR "selección española")`),
  Q('it', `(arbitro OR arbitraggio OR VAR OR rigore OR espulsione OR moviola) "Serie A"`),
  Q('it', `(arbitro OR VAR OR rigore OR moviola) (Juventus OR Inter OR Milan OR Napoli OR Roma OR Lazio OR Atalanta OR Fiorentina OR Bologna)`),
  Q('it', `(AIA OR Rocchi OR "Open VAR" OR designazioni OR "sala VAR" OR "errore arbitrale")`),
  Q('it', `(arbitro OR VAR OR rigore) ("Champions League" OR "Europa League" OR "Conference League" OR Nazionale)`),
  Q('de', `(Schiedsrichter OR VAR OR Videobeweis OR Elfmeter OR "Rote Karte" OR Platzverweis) Bundesliga`),
  Q('de', `(Schiedsrichter OR Schiri OR VAR OR Elfmeter) (Bayern OR Dortmund OR BVB OR Leverkusen OR Leipzig OR Stuttgart OR Frankfurt OR Bremen)`),
  Q('de', `("Kölner Keller" OR Schiedsrichterchef OR "Knut Kircher" OR "DFB-Schiedsrichter" OR Fehlentscheidung OR Schiedsrichter-Ansetzung)`),
  Q('de', `(Schiedsrichter OR VAR OR Elfmeter) ("Champions League" OR "Europa League" OR "Conference League" OR Nationalmannschaft)`),
  Q('fr', `(arbitre OR arbitrage OR VAR OR penalty OR "carton rouge" OR expulsion) "Ligue 1"`),
  Q('fr', `(arbitre OR arbitrage OR VAR OR penalty) (PSG OR OM OR Marseille OR Monaco OR Lyon OR Lille OR Lens OR Nice OR Rennes)`),
  Q('fr', `(arbitre OR arbitrage OR VAR OR penalty) ("Ligue des champions" OR "Ligue Europa" OR "Ligue Conférence" OR "équipe de France")`),
  Q('fr', `("Direction technique de l'arbitrage" OR DTNA OR "Antony Gautier" OR "erreur d'arbitrage" OR "arbitrage vidéo")`),
];
const ymd = d => new Date(d).toISOString().slice(0, 10);
export const intlUrl = (q, from, to) => 'https://news.google.com/rss/search?q=' +
  encodeURIComponent(`${q.q} after:${ymd(from)} before:${ymd(to)}`) + '&' + ED[q.lang];

/* ───────────── the outlets ───────────── */
// the big outlets of each language (by web address); everything else the searches find is left out
export const MEDIA = {
  en: ['bbc.co.uk', 'bbc.com', 'skysports.com', 'espn.com', 'espn.co.uk', 'espnfc.com', 'theguardian.com', 'nytimes.com', 'theathletic.com',
    'telegraph.co.uk', 'independent.co.uk', 'thetimes.co.uk', 'thetimes.com', 'reuters.com', 'apnews.com', 'mirror.co.uk', 'dailymail.co.uk',
    'standard.co.uk', 'talksport.com', 'goal.com', 'cbssports.com', 'nbcsports.com', 'foxsports.com', 'eurosport.com', 'eurosport.co.uk',
    'uefa.com', 'fifa.com', 'premierleague.com', 'football-italia.net', 'inews.co.uk', 'thesun.co.uk', 'football365.com', 'si.com', 'cnn.com', 'tntsports.co.uk'],
  es: ['marca.com', 'as.com', 'mundodeportivo.com', 'sport.es', 'elpais.com', 'elmundo.es', 'relevo.com', 'abc.es', 'cope.es', 'cadenaser.com',
    'elconfidencial.com', 'rtve.es', 'lavanguardia.com', 'eldesmarque.com', 'estadiodeportivo.com', 'superdeporte.es', 'laliga.com', 'larazon.es', '20minutos.es'],
  it: ['gazzetta.it', 'corrieredellosport.it', 'tuttosport.com', 'sport.sky.it', 'skysport.it', 'corriere.it', 'repubblica.it', 'sportmediaset.mediaset.it',
    'mediaset.it', 'rainews.it', 'rai.it', 'ilmessaggero.it', 'calciomercato.com', 'tuttomercatoweb.com', 'lastampa.it', 'ilfattoquotidiano.it', 'fanpage.it', 'legaseriea.it', 'dazn.com'],
  de: ['kicker.de', 'bild.de', 'sport1.de', 'sportschau.de', 'spiegel.de', 'faz.net', 'sueddeutsche.de', 'zeit.de', 'welt.de', 'sport.de', 'ran.de',
    'skysport.de', 't-online.de', 'n-tv.de', 'zdf.de', '11freunde.de', 'transfermarkt.de', 'bundesliga.com', 'tagesschau.de', 'fr.de', 'tz.de', 'merkur.de', 'abendzeitung-muenchen.de'],
  fr: ['lequipe.fr', 'bfmtv.com', 'rmcsport.bfmtv.com', 'leparisien.fr', 'lefigaro.fr', 'francefootball.fr', 'footmercato.net', 'beinsports.com', 'ouest-france.fr',
    'sofoot.com', 'eurosport.fr', '20minutes.fr', 'lemonde.fr', 'francetvinfo.fr', 'laprovence.com', 'leprogres.fr', 'ligue1.com', 'rmc.bfmtv.com', 'lavoixdunord.fr', 'nicematin.com'],
};
// the same outlets by the name Google gives them, for when no address comes with the item
const MEDIA_NAMES = /^(?:BBC(?: Sport| News)?|Sky Sports|ESPN(?: FC| UK)?|The Guardian|The New York Times|The Athletic|The Telegraph|The Independent|The Times|Reuters|AP News|Associated Press|Mirror|Daily Mail|Evening Standard|talkSPORT|GOAL|Goal\.com|CBS Sports|NBC Sports|FOX Sports|Eurosport|UEFA(?:\.com)?|FIFA|Premier League|Football Italia|inews|The Sun|Football365|TNT Sports|Sports Illustrated|CNN|MARCA|Marca|Diario AS|AS(?: \.com)?|Mundo Deportivo|SPORT|Sport|EL PAÍS|El País|EL MUNDO|El Mundo|Relevo|ABC|COPE|Cadena SER|El Confidencial|RTVE|La Vanguardia|ElDesmarque|Estadio Deportivo|Superdeporte|LaLiga|La Razón|20minutos|La Gazzetta dello Sport|Gazzetta|Corriere dello Sport|Tuttosport|Sky Sport|Corriere della Sera|la Repubblica|Sport Mediaset|Mediaset|Rai News|RaiNews|Il Messaggero|Calciomercato\.com|TUTTOmercatoWEB(?:\.com)?|La Stampa|Il Fatto Quotidiano|Fanpage|Lega Serie A|DAZN|kicker|BILD|Bild|SPORT1|Sport1|sportschau(?:\.de)?|DER SPIEGEL|Der Spiegel|FAZ|Frankfurter Allgemeine(?: Zeitung)?|Süddeutsche Zeitung|ZEIT ONLINE|Die Zeit|WELT|Welt|sport\.de|ran\.de|ran|Sky Sport Deutschland|t-online|n-tv(?:\.de)?|ZDF|ZDFheute|11FREUNDE|11 Freunde|Transfermarkt|Bundesliga|tagesschau(?:\.de)?|Frankfurter Rundschau|tz|Merkur|Abendzeitung München|L'Équipe|L'Equipe|RMC Sport|BFMTV|Le Parisien|Le Figaro|France Football|Foot Mercato|beIN SPORTS|Ouest-France|So Foot|SO FOOT|Eurosport France|20 Minutes|Le Monde|Franceinfo|franceinfo|La Provence|Le Progrès|Ligue 1|La Voix du Nord|Nice-Matin)$/;
const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
// a league's own site is about that league even when the headline doesn't say so
export const LEAGUE_SITE = { 'premierleague.com': 'Premier League', 'laliga.com': 'LaLiga', 'legaseriea.it': 'Serie A', 'bundesliga.com': 'Bundesliga', 'ligue1.com': 'Ligue 1', 'uefa.com': 'UEFA' };
export const leagueHint = srcUrl => { const h = hostOf(srcUrl); const k = Object.keys(LEAGUE_SITE).find(d => h === d || h.endsWith('.' + d)); return k ? LEAGUE_SITE[k] : ''; };
export function topOutlet(lang, srcUrl, srcName) {
  const h = hostOf(srcUrl);
  if (h) return (MEDIA[lang] || []).some(d => h === d || h.endsWith('.' + d));
  return MEDIA_NAMES.test(String(srcName || '').trim());
}

/* ───────────── refereeing filter ───────────── */
const W = '\\p{L}*';
const I = s => new RegExp('(?<![\\p{L}\\p{N}])(?:' + s + ')(?![\\p{L}\\p{N}])', 'iu');      // whole words, any case
const CSx = s => new RegExp('(?<![\\p{L}\\p{N}])(?:' + s + ')(?![\\p{L}\\p{N}])', 'u');     // names, as written
const any = (...res) => ({ test: s => res.some(r => r.test(s)) });                          // one of several patterns
export const RXI = {
  referee: I(`referee${W}|refs?|refereeing|match officials?|fourth official|linesm[ae]n|assistant referees?|` +
    `árbitr${W}|moviola|arbitraje|arbitral(?:es)?|colegiad${W}|trencilla|arbitr(?:o|i|aggio|aggi|ale|ali)|direttore di gara|guardalinee|quarto uomo|` +
    `schiedsrichter${W}|schiri${W}|unparteiisch${W}|linienrichter${W}|arbitre${W}|arbitrage${W}|arbitral${W}`),
  var: any(CSx('VAR|V\\.A\\.R\\.?'), I(`video assistant referee|videoarbitr${W}|videobeweis${W}|video-assistent${W}|kölner keller|sala var|var room|` +
    `semi-automated offside|fuera de juego semiautomático|fuorigioco semiautomatico|halbautomatisch${W} abseits|hors-jeu semi-automatique|on-?field review|pitchside monitor|goal-?line technology|hawk-?eye`)),
  red: I(`red cards?|sent off|send(?:ing)?[- ]off|second yellow|straight red|yellow cards?|tarjeta (?:roja|amarilla)|roja directa|doble amarilla|segunda amarilla|` +
    `expulsi(?:ón|on|ones)|expulsad${W}|cartellin${W} (?:rosso|giallo)|rosso diretto|doppia ammonizione|espulsion${W}|espuls[oai]|ammonizion${W}|` +
    `rote karte|rote(?:n)? karte|gelb-rot${W}|gelbe(?:n)? karte|platzverweis${W}|vom platz gestellt|carton (?:rouge|jaune)|cartons (?:rouges|jaunes)|expulsé${W}|deuxième (?:carton )?jaune`),
  penalty: I(`penalt(?:y|ies)|spot[- ]kicks?|penaltis?|pena máxima|rigor(?:e|i)|calcio di rigore|elfmeter${W}|strafsto(?:ß|ss)${W}|handelfmeter|penaltys`),
  offside: I(`offsides?|disallowed|chalked off|struck off|(?:goal|strike|equali[sz]er|winner|header) (?:was |is )?(?:ruled out|wiped out)|fuera de juego|gol anulado|anula${W} (?:un |el |su )?gol|` +
    `fuorigioco|fuori gioco|gol annullat${W}|annulla${W} (?:il |un )?gol|abseits${W}|aberkannt${W}|tor (?:nicht gegeben|zurückgenommen)|hors-jeu|but (?:refusé|annulé)|refus${W} (?:un |le )?but`),
  foul: I(`handball|hand ball|fouls?|fouled|diving|simulation|elbow${W}|stamp(?:ed|ing|s)?|mano (?:de|en el área)|por mano|piscinazo|simulación|fallo di mano|tocco di mano|` +
    `mano in area|fallo (?:su|da rigore)|simulazione|handspiel|foulspiel|schwalbe|ellbogen${W}|faute${W}|main (?:de|dans la surface)|plongeon`),
  committee: any(CSx('CTA|AIA|DTNA'), I(`pgmol|howard webb|key match incidents|mic'?d up|referees?(?:'|’)? chief|referee chief|referee appointments?|appointed (?:as |to )?referee|named (?:as )?referee|` +
    `will referee|to referee|in charge of (?:the )?(?:game|match|clash|derby|final|tie)|comité técnico de árbitros|designaci(?:ón|ones)|designad${W} para|tiempo de revisión|` +
    `designazion${W}|designat${W}|rocchi|open var|schiedsrichterchef${W}|schiedsrichter-ansetzung${W}|angesetzt|leitet das|pfeift das|knut kircher|dfb-schiedsrichter${W}|` +
    `direction technique de l'arbitrage|désign${W}|antony gautier`)),
  discipline: I(`bann?ed|bans?|suspen(?:ded|sion)${W}|fined|fines? (?:of|for)|charged (?:by|with|over|after|for)|fa charge|disciplinary|misconduct|` +
    `sanci(?:ón|ones|onad${W})|sanzion${W}|sanction${W}|multa${W}|comité de competición|squalific${W}|giudice sportivo|ammend${W}|deferit${W}|sperre${W}|gesperrt|geldstrafe${W}|sportgericht${W}|` +
    `kontrollausschuss|suspendu${W}|amende${W}|commission de discipline|sanctionn${W}`),
  fights: I(`brawl${W}|melee|mêlée|scuffle${W}|mass confrontation|bust-up|altercation|punch${W}|headbutt${W}|assault${W}|attack(?:ed|s)? (?:on )?(?:the )?(?:referee|official)|` +
    `racis${W}|racially|abused|pitch invader|objects? thrown|tángana|pelea${W}|agresi(?:ón|on)|rissa|aggression${W}|aggredit${W}|razzis${W}|rudelbildung|tumult${W}|` +
    `handgreiflich${W}|rassis${W}|angriff auf|bagarre${W}|échauffourée${W}|agress${W}`),
  dispStrong: I(`controvers${W}|fury|furious|fuming|outrage${W}|robbed|scandal${W}|blunder${W}|howler|shambles|farce|apolog${W}|admit${W} (?:\\p{L}+ )?(?:mistake|error)|wrongly|incorrect${W}|` +
    `polémic${W}|escándalo|robo|atraco|polemic${W}|scandalo|furia|furios${W}|skandal${W}|fehlentscheidung${W}|wütend|umstritten${W}|polémique${W}|scandale${W}|colère|furieu${W}`),
  dispWeak: I(`denunci${W}|lament${W}|critica${W}|kritisier${W}|dénonc${W}|errors?|mistakes?|wrong|error(?:es)?|errore|errori|fehler|erreur${W}|complain${W}|criticis${W}|criticiz${W}|slams?|blasts?|questions|protest${W}|queja${W}|` +
    `protesta${W}|kritik${W}|réclam${W}|critique${W}`),
  penExec: I(`saved?|saves|miss(?:es|ed)?|scor(?:es|ed|ing)|convert${W}|shoot-?outs?|on penalties|penalty takers?|takes? (?:the |a )?penalt${W}|from the (?:penalty )?spot|` +
    `tanda de penaltis|en los penaltis|desde los once metros|detiene|par[aó] (?:un|el) penalti|fall[aó] (?:un|el) penalti|marca de penalti|transform${W}|ai rigori|lotteria dei rigori|` +
    `parat${W}|para (?:un |il )?rigore|sbagli${W}|segna su rigore|calciat${W}|elfmeterschie(?:ß|ss)en|verschie(?:ß|ss)t|verschossen|hält (?:einen |den )?elfmeter|gehalten|verwandel${W}|` +
    `tirs au but|séance de tirs|arrêt${W}|rat(?:e|é) (?:un |son |le )?penalty|sur penalty|transformé|con un penalti|de penalti|desde el punto de penalti|su rigore|dal dischetto|` +
    `per elfmeter|vom punkt|from the spot|on penalties|\\p{L}+['’]s (?:late |stoppage-time |injury-time |first-half |second-half )?penalty|` +
    `penalty (?:ends|seals|secures|wins|earns|gives|hands|sinks|downs|breathes|clinches|rescues|snatches|offers|edges|lifts|sends)|late penalty|stoppage-time penalty|injury-time penalty|pay the penalty`),
  live: I(`live|as it happened|minute[- ]by[- ]minute|en directo|en vivo|minuto a minuto|in diretta|diretta|live-?ticker|liveticker|en direct`),
  bet: I(`podcasts?|betting|bet builder|predictions?|tips|best odds|odds (?:on|for)|pronósticos?|apuestas|cuote|pronostic${W}|tipps?|prognose${W}|wettquoten|wett-?tipps?|fpl|fantasy`),
  personal: I(`transfers?|signs?|signing|contract${W}|loan${W}|injur${W}|fichaje${W}|renov${W}|lesi(?:ón|ones|onad${W})|calciomercato|mercato|trasferiment${W}|infortun${W}|` +
    `wechsel${W}|vertrag${W}|verletz${W}|transfert${W}|blessure${W}|blessé${W}|sacked|sacking|destitu${W}|esonerat${W}|entlass${W}|limog${W}|interview${W}|entrevista${W}|intervista${W}`),
  women: I(`women'?s?|wsl|nwsl|femenin${W}|liga f|femminil${W}|frauen${W}|féminin${W}|d1 arkema|lionesses|matildas`),
  otherSport: I(`rugby|nfl|nba|nhl|mlb|cricket|tennis|basketball|baloncesto|pallacanestro|pallavolo|volleyball|voleibol|ice hockey|hockey|boxing|ufc|mma|formula (?:1|one)|f1|` +
    `motogp|golf|handball-${W}|handballer${W}|balonmano|pallamano|darts|snooker|baseball|futsal|beach soccer|esports?`),
  video: I(`videos?|watch|clip|highlights|vídeo|guarda|ansehen|regardez|vidéo`),
};
const DIRECT = ['red', 'penalty', 'offside', 'var', 'foul'];
const WGT = { red: 3, penalty: 3, offside: 2, var: 3, foul: 2, committee: 2, discipline: 2, fights: 3, dispute: 3 };

// the competitions: league names, and the clubs of this season's five big leagues (as the media write them)
const NOT_EPL = /(?:scottish|russian|ukrainian|egyptian|indian|bangladesh|welsh|northern irish|irish|ghana(?:ian)?|kenyan|nigerian|south african|canadian|maltese|armenian|kazakh|belarusian|azerbaijani?|israeli|syrian|iraqi|jamaican|zambian|ugandan|tanzanian|caribbean|lebanese|palestinian|hong kong|kuwait(?:i)?|bahrain(?:i)?) premier league/i;
const LG = {
  eng: I(`premier league|epl|pgmol|howard webb|key match incidents`),
  esp: I(`la ?liga|liga española|liga ea sports|primera división|negreira|comité técnico de árbitros|clásico|derbi madrileño`),
  ita: any(CSx('Serie A|SERIE A|AIA'), I(`rocchi|open var|campionato italiano`)),
  ger: I(`bundesliga|kölner keller|dfb-schiedsrichter${W}|knut kircher`),
  fra: I(`ligue 1|championnat de france|dtna|direction technique de l'arbitrage|antony gautier`),
  ucl: I(`champions league|liga de campeones|ligue des champions|königsklasse|ucl`),
  uel: I(`europa league|liga europa|ligue europa|uel`),
  uecl: I(`conference league|liga conferencia|ligue conférence|uecl`),
  nat: any(CSx('Nazionale|Azzurri|Les Bleus|La Roja|Three Lions|Équipe de France|DFB-Team|DFB-Elf|Nationalmannschaft|Seleção|WM(?: 20\\d\\d)?|EM 20\\d\\d'), I(`world cup|weltmeisterschaft|wm-qualifikation|wm-quali${W}|mundial(?:es)?|copa del mundo|coppa del mondo|mondiali|qualificazioni mondiali|coupe du monde|mondial|` +
    `nations league|liga de (?:las )?naciones|ligue des nations|euro 20\\d\\d|eurocopa|europei|em-qualifikation|copa am[ée]rica|afcon|africa cup of nations|coupe d'afrique|` +
    `national team|selecci(?:ón|on) (?:española|nacional)|équipe de france|world cup qualif${W}`)),
};
// second tiers, women's and other countries' leagues named "Bundesliga" / "La Liga"; the Club World Cup is not a national-team competition
const NOT_TOP = any(CSx('Championship|League One|League Two|EFL|Premiership|MLS'), I(`scottish|serie b|2\\. bundesliga|zweite bundesliga|österreich${W} bundesliga|austrian bundesliga|` +
  `admiral bundesliga|laliga hypermotion|liga hypermotion|segunda división|ligue 2|saudi pro league|eredivisie|liga portugal|süper lig|super lig|liga mx|brasileir${W}`));
// the lower tiers named like the top ones ("2. Bundesliga", "Serie B"): taken out before the league names are looked for
const LOWER = new RegExp('(?<![\\p{L}\\p{N}])(?:2\\. bundesliga|zweite bundesliga|frauen-bundesliga|österreich\\p{L}* bundesliga|austrian bundesliga|admiral bundesliga|' +
  'laliga hypermotion|liga hypermotion|segunda división|serie b|serie c|ligue 2|national 1)(?![\\p{L}\\p{N}])', 'giu');
const CLUB_WC = I(`club world cup|mundial de clubes|mondiale per club|coppa del mondo per club|klub-wm|coupe du monde des clubs|intercontinental`);
const CLUBS = {
  eng: CSx('Arsenal|Brighton|Man(?:chester)? City|Liverpool|Chelsea|Everton|Bournemouth|Brentford|Leeds(?: United)?|Tottenham|Spurs|Newcastle|Aston Villa|Hull City|Hull|Ipswich|Fulham|' +
    'Nottingham Forest|Forest|Coventry|Sunderland|Man(?:chester)? United|Man Utd|Crystal Palace|Palace'),
  esp: CSx('Barcelona|Barça|Barca|Real Madrid|Atl[ée]tico(?: de)? Madrid|Atleti|Atl[ée]tico(?! (?:Mineiro|Nacional|Paranaense|San Luis|Tucumán|Junior|Ottawa|Goianiense|Huila|Bucaramanga|Morelia))|' +
    'Real Betis|Betis|Real Sociedad|Sevilla|Athletic Club|Athletic Bilbao|(?<![A-Z][a-z]+ )Athletic|Deportivo(?: de)? La Coruña|Depor|Racing(?: de)? Santander|Alavés|Alaves|Villarreal|' +
    'Celta(?: de)?(?: Vigo)?|Espanyol|Rayo Vallecano|Rayo|Getafe|Osasuna|Levante|Elche|Valencia|Málaga|Malaga'),
  ita: CSx('Lazio|AS Roma|(?<!(?:[Aa]|[Dd]i|[Dd]a|[Ii]n|[Pp]er) )Roma(?! (?:Capitale|Open|Termini))|Internazionale|Inter Milan|Inter(?! (?:Miami|Turku|Bratislava|Baku|Escaldes|Club))|' +
    'AC Milan|Milan(?!o)|Como|Frosinone|Juventus|Juve|Bologna|Cagliari|Napoli|Torino|Atalanta|' +
    'Genoa|Lecce|Fiorentina|Parma|Sassuolo|Monza|Venezia|Udinese'),
  ger: CSx('Bayern(?: Munich| München| Monaco)?|FC Bayern|Borussia Dortmund|Dortmund|BVB|RB Leipzig|Leipzig|SC Freiburg|Freiburg|Bayer Leverkusen|Leverkusen|Werder Bremen|Werder|' +
    'Elversberg|VfB Stuttgart|Stuttgart|Eintracht Frankfurt|Eintracht|Hamburger SV|Hamburg|HSV|Mainz(?: 05)?|Paderborn|Augsburg|Hoffenheim|FC Cologne|1\\. FC Köln|Köln|Cologne|' +
    'Union Berlin|Schalke(?: 04)?|Mönchengladbach|Gladbach'),
  fra: CSx('Paris Saint-Germain|PSG|Paris SG|Lille|LOSC|Paris FC|Lyon|OL|Stade Rennais|Rennes|Marseille|OM|(?<!Bayern )Monaco|OGC Nice|Nice|Lens|Toulouse|Brest|Lorient|Strasbourg|' +
    'Auxerre|Angers|Troyes|Le Mans|Le Havre'),
};
// words that are also ordinary words in a language: "Como" (Spanish "as"), "Angers" / "Nice" / "Lens" (English)
const AMBIG = { es: CSx('Como'), en: CSx('Angers|Nice|Lens') };
const clubHit = (k, title, lang) => {
  const a = AMBIG[lang];
  return CLUBS[k].test(a ? title.replace(new RegExp(a.source, 'gu'), ' ') : title);
};
// the referees of each league (full names: many surnames are ordinary words); a referee's name says the league, and that it is about refereeing
const REFS = {
  eng: CSx('Michael Oliver|Anthony Taylor|Simon Hooper|Chris Kavanagh|Paul Tierney|Stuart Attwell|Jarred Gillett|Sam Barrott|Robert Jones|Andy Madley|John Brooks|' +
    'Tim Robinson|Darren England|Craig Pawson|Peter Bankes|Tony Harrington|Thomas Bramall|Michael Salisbury|Rob Jones|Lewis Smith|Matt Donohue|Farai Hallam'),
  esp: CSx('Gil Manzano|Martínez Munuera|Hernández Hernández|Soto Grado|Sánchez Martínez|De Burgos Bengoetxea|Melero López|Busquets Ferrer|Cuadra Fernández|Munuera Montero|' +
    'Ortiz Arias|Alberola Rojas|Figueroa Vázquez|Muñiz Ruiz|Pulido Santana|Hernández Maeso|Díaz de Mera|Iglesias Villanueva|Quintero González|Galech Apezteguía'),
  ita: CSx('Daniele Doveri|Maurizio Mariani|Marco Guida|Davide Massa|Fabio Maresca|Daniele Chiffi|Federico La Penna|Simone Sozza|Marco Di Bello|Andrea Colombo|Michael Fabbri|' +
    'Matteo Marchetti|Luca Pairetto|Gianluca Manganiello|Livio Marinelli|Juan Luca Sacchi|Antonio Rapuano|Luca Zufferli|Ermanno Feliciani|Gianluca Aureliano'),
  ger: CSx('Felix Zwayer|Deniz Aytekin|Daniel Siebert|Tobias Stieler|Sascha Stegemann|Harm Osmers|Bastian Dankert|Marco Fritz|Christian Dingert|Tobias Welz|Robert Schröder|' +
    'Benjamin Brand|Patrick Ittrich|Florian Badstübner|Frank Willenborg|Robert Hartmann|Sven Jablonski|Martin Petersen|Timo Gerach|Florian Exner|Daniel Schlager'),
  fra: CSx('Clément Turpin|François Letexier|Benoît Bastien|Willy Delajod|Jérémie Pignard|Stéphanie Frappart|Ruddy Buquet|Eric Wattellier|Bastien Dechepy|Marc Bollengier|' +
    'Pierre Gaillouste|Thomas Léonard|Jérôme Brisard|Hakim Ben El Hadj|Florent Batta|Romain Lissorgue|Mathieu Vernice|Abdelatif Kherradji'),
  uefa: CSx('Szymon Marciniak|Danny Makkelie|Slavko Vin[čc]i[ćc]|István Kovács|Istvan Kovacs|Glenn Nyberg|Daniel Siebert|Sandro Schärer|Artur Soares Dias|Jesús Gil Manzano|' +
    'Halil Umut Meler|Maurizio Mariani|Serdar Gözübüyük|Ivan Kružliak|João Pinheiro|Joao Pinheiro|Espen Eskås|Irfan Peljto|Davide Massa|Felix Zwayer'),
};
const refName = t => Object.values(REFS).some(r => r.test(t));
// a derby says the league too
const DERBY = { eng: I(`manchester derby|merseyside derby|north london derby|tyne-wear derby|m23 derby`), esp: I(`el clásico|clásico|derbi madrileño|derbi sevillano|derbi vasco|derbi barceloní`),
  ita: I(`derby d'italia|derby della madonnina|derby di milano|derby della capitale|derby di roma|derby della mole`), ger: I(`revierderby|klassiker|nordderby`), fra: I(`le classique|classique|derby du rhône|derby de la côte`) };
// Bulgarian clubs and referees in the international media (shown in the Bulgaria tab too)
const BG_CLUBS = [['ludo', 'Ludogorets?(?: Razgrad)?'], ['levski', 'Levski(?: Sofia)?'], ['cska48', 'CSKA 1948'], ['cska', 'CSKA Sofia|CSKA-Sofia'],
  ['lokpd', 'Lokomotiv Plovdiv'], ['chm', 'Cherno More'], ['botpd', 'Botev Plovdiv'], ['arda', 'Arda Kardzhali|Arda(?! Turan| Güler)'], ['slavia', 'Slavia Sofia']]
  .map(([k, p]) => ({ k, re: CSx(p) }));
const BG_REF = new RegExp(CSx('Kabakov|Gidzhenov|Gidjenov|Chinkov|Trenchev|Mitrev|Draganov|Kabakow|Gidschenow').source + '|' +
  I(`bulgarian referee|bulgarian official|árbitro búlgaro|arbitro bulgaro|bulgarische[rn]? schiedsrichter${W}|arbitre bulgare|bulgarisch${W} unparteiisch${W}`).source, 'iu');

// Is this headline (in one of the five languages) about refereeing in the World sections? → classification, or null
export function analyzeIntl(title, desc, lang) {
  title = String(title || ''); desc = String(desc || '');
  const t = title + ' \n ' + desc;
  if (RXI.otherSport.test(t) || RXI.women.test(t) || RXI.bet.test(title)) return null;
  // which competitions: league names, then clubs (a second tier or another country's league named in the headline is left out)
  const comps = [], t2 = t.replace(LOWER, ' '), title2 = title.replace(LOWER, ' ');
  const clubWC = CLUB_WC.test(t);
  for (const k of ['ucl', 'uel', 'uecl']) if (LG[k].test(t) || (lang !== 'en' && new RegExp(`(?<![\\p{L}])${k === 'ucl' ? 'Champions' : k === 'uecl' ? 'Conference' : 'Europa'}(?![\\p{L}])`, 'u').test(title))) comps.push(k);
  if (!clubWC && LG.nat.test(t)) comps.push('nat');
  const top = [];
  for (const k of ['eng', 'esp', 'ita', 'ger', 'fra']) {
    if (k === 'eng' && NOT_EPL.test(t) && !clubHit('eng', title, lang)) continue;
    if (LG[k].test(t2) || clubHit(k, title, lang) || REFS[k].test(title) || DERBY[k].test(title)) top.push(k);
  }
  if (!comps.length && !top.length) return null;
  // a club of a big league in a second-tier or another country's story: not this league
  if ((NOT_TOP.test(title) || title2 !== title) && !comps.length && !top.some(k => LG[k].test(title2))) return null;
  comps.push(...top);
  if (clubWC && !top.length && !comps.length) return null;

  const cats = [];
  for (const k of ['red', 'penalty', 'offside', 'var', 'foul', 'committee', 'discipline', 'fights']) if (RXI[k].test(t)) cats.push(k);
  const refHit = RXI.referee.test(t) || BG_REF.test(t) || refName(t);
  if (RXI.dispStrong.test(t) || (RXI.dispWeak.test(t) && (refHit || cats.includes('var')))) cats.push('dispute');
  // 1. about refereeing: a referee, a decision, a card, a sanction, an incident
  if (!refHit && !cats.length) return null;
  // 2. transfers, injuries, contracts, sackings, interviews: only when the headline itself is about a referee or a decision
  const refInTitle = RXI.referee.test(title) || BG_REF.test(title) || refName(title);
  if (RXI.personal.test(title) && !(refInTitle || DIRECT.some(c => RXI[c].test(title)))) return null;
  // 3. the headline itself must say it
  const titleSignal = refInTitle || ['red', 'penalty', 'offside', 'var', 'foul', 'committee', 'discipline', 'fights'].some(k => RXI[k].test(title));
  if (!titleSignal) return null;
  // 4. a penalty only taken, saved or missed, and live blogs, are not refereeing stories
  const disputed = refInTitle || RXI.var.test(title) || RXI.dispStrong.test(title) || RXI.dispWeak.test(title);
  const onlyPenalty = cats.every(c => c === 'penalty' || c === 'dispute') && RXI.penalty.test(title);
  if (onlyPenalty && RXI.penExec.test(title) && !disputed) return null;
  if (RXI.live.test(title) && !refInTitle) return null;
  // 5. the World rule: a referee, or a decision on the pitch
  if (!(refHit || cats.some(c => DIRECT.includes(c)))) return null;

  const clubs = BG_CLUBS.filter(c => c.re.test(title)).map(c => c.k);
  const divs = clubs.length || BG_REF.test(title) ? ['eur'] : [];
  let score = 1;
  for (const c of cats) score += WGT[c] * ((c === 'dispute' ? RXI.dispStrong.test(title) : RXI[c].test(title)) ? 2 : 1);
  if (refInTitle) score += 2;
  if (!cats.length) cats.push('other');
  return { scope: 'world', divs, comps: [...new Set(comps)], cats, score, hinted: false, clubs, vh: RXI.video.test(title) };
}
