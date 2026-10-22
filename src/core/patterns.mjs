// Listes de motifs versionnées. PUR. Ajouter un motif = un test dans extract.test.mjs d'abord.
// Les notes sont des DONNÉES : ces motifs extraient, rien n'est jamais exécuté.
export const PATTERNS_VERSION = 1;

// Verbes de livraison ACCOMPLIE (participes). « à livrer » ne compte pas.
// v1 : liste d'ARCHITECTURE.md §3 + rédigé, généré, ajouté (relevés sur le registre réel le 22/10).
// « produit », « fait » et « commit » sont aussi des noms (« page produit », « en fait », « le commit de la review ») :
// ils ne comptent qu'en MAJUSCULES de statut (« VOLET CLAUDE FAIT ») ou sous la forme « commité ».
export const DELIVERY = /(?<!\p{L})(?:livr[ée]e?s?|[ée]crite?s?|cr[ée][ée]e?s?|ins[ée]r[ée]e?s?|publi[ée]e?s?|pos[ée]e?s?|commit+[ée]e?s?|r[ée]dig[ée]e?s?|g[ée]n[ée]r[ée]e?s?|ajout[ée]e?s?)(?!\p{L})/giu;
export const DELIVERY_UPPER = /(?<!\p{L})(?:PRODUITE?S?|FAITE?S?)(?!\p{L})/gu;
// Négation avant le verbe, mots intercalés compris : « aucun commit », « (non commité) », « pas encore livré », « n'a pas été écrit ».
export const NEGATION = /(?<!\p{L})(?:non|aucune?|rien|pas|sans|jamais)(?:\s+(?:encore|été|ete|toujours|vraiment))*[\s(]*$/iu;

// Blocages EXPLICITES. « RESTE » seul est un rappel ; « GATE » (quality gate) n'est pas « GATÉ ».
export const BLOCKERS = [
  /(?<!\p{L})GATÉ/u,
  /\bgated\b/i,
  /(?<!\p{L})bloqu[ée]e?s?\s+par(?!\p{L})/iu,
  /(?<!\p{L})en attente d[e'’u]/iu,
  /IRR[ÉE]DUCTIBLEMENT\s+USER/iu,
  /\bRESTE(?:NT)?\b.{0,80}\bUSER\b/u,
];

// Formules sans-objet explicites, en TÊTE de phrase (après une date ou « cette tâche est ») : sinon c'est
// un élément de la tâche qui est remplacé (« D-10 remplacée par D-17 »), pas la tâche. Citer une tâche annulée ne suffit pas.
const LEAD = String.raw`^\s*(?:[\d/-]+\s*:\s*)?(?:(?:cette\s+)?t[âa]che\s+(?:est\s+)?)?`;
export const OBSOLETE = [
  String.raw`remplac[ée]e?s?\s+par(?!\p{L})`,
  String.raw`annul[ée]e?s?\s+car(?!\p{L})`,
  String.raw`migr[ée]e?s?\s+vers(?!\p{L})`,
].map((f) => new RegExp(LEAD + f, 'iu'));

// Conséquences conditionnelles. « avant le JJ/MM » seul = échéance, absent d'ici.
export const CONDITION = /(?<!\p{L})(J\+(\d+)|sinon|fen[êe]tres?|expir\p{L}*)(?!\p{L})/iu;

// Tour du user : la suite de la tâche lui revient (relevé sur le registre réel le 22/10). Sert une SUGGESTION, jamais un verdict.
// « Décision prise par le user » ou « le user a validé » sont du passé : pas un tour du user.
export const USER_TURN = [
  /geste (?:du )?user/i,
  /(?<!\p{L})[àa] (?:valider|relire|arbitrer|trancher) par (?:le |la )?user/iu,
  /en attente de (?:la |une )?(?:décision|validation|arbitrage|relecture) du user/iu,
  /RESTE(?:NT)?(?: AU)? USER/i,
  /A-FAIRE-PAR-TOI|(?<!\p{L})[àa] faire par (?:toi|le user)/iu,
  /ENVOI USER/,
  /VOLET CLAUDE (?:FAIT|TERMIN)/i,
];

// Tour du user ACCOMPLI : annule un tour du user écrit avant lui (« validé par le user », « geste user fait »).
export const USER_DONE = [
  /(?:valid|relu|tranch|arbitr|fait|envoy)[ée]?e?s? par (?:le |la )?user/i,
  /le user a (?:valid|relu|tranch|arbitr|fait|envoy)/i,
  /geste (?:du )?user (?:fait|effectu)/i,
  /ENVOI USER (?:FAIT|EFFECTU)/i,
];

export const URL = /https?:\/\/[^\s<>"'`»)\]]+/g;
// Une URL ne prouve une livraison que dans une phrase de livraison, ou « en ligne sur … ».
// Comme un verbe de livraison, « en ligne » se nie (« pas encore en ligne ») ; « à mettre en ligne » est un projet, pas une livraison.
export const ONLINE = /(?<!\p{L})en ligne(?!\p{L})/giu;
export const TO_DO_BEFORE = /mettre\s*$/i;
// Relatif à la racine, ou absolu / ../ (extraits pour que le contrôle les REFUSE). Routes /x/y exclues.
export const PATH = /(?<![\w/:.@\\-])(?:[A-Za-z]:\/)?(?:\.{1,2}\/)*\.?[\w@][\w.@-]*(?:\/[\w.@-]+)+\/?/g;
export const PATH_TAIL = /(?:\.[A-Za-z][A-Za-z0-9]{0,5}|\/)$/;
export const SHA = /(?<![#\w./-])[0-9a-f]{7,40}(?![\w/-])(?!\.\w)/g;
// Un hexa ne vaut « commit » que si la phrase le dit ; sinon c'est un « hex » (alerte, empreinte, version) qui ne compte que si git le trouve.
export const COMMIT_WORD = /(?<!\p{L})(?:commit\p{L}*|pouss[ée]\p{L}*)(?!\p{L})/iu;
export const SHA256_BEFORE = /sha-?256\W{0,3}$/i;
export const LINK = /(?<![\w/.@-])[a-z0-9]+(?:-[a-z0-9]+){2,}(?![\w/@-])(?!\.\w)/g;
export const DATE = /(?<![\d/])(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)(?![\d/])/g;
