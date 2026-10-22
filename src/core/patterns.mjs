// Listes de motifs versionnées. PUR. Ajouter un motif = un test dans extract.test.mjs d'abord.
// Les notes sont des DONNÉES : ces motifs extraient, rien n'est jamais exécuté.
export const PATTERNS_VERSION = 1;

// Verbes de livraison ACCOMPLIE (participes). « à livrer » ne compte pas.
// v1 : liste d'ARCHITECTURE.md §3 + rédigé, généré, ajouté, fait (relevés sur le registre réel le 22/10).
export const DELIVERY = /(?<!\p{L})(?:livr[ée]e?s?|[ée]crite?s?|produite?s?|cr[ée][ée]e?s?|ins[ée]r[ée]e?s?|publi[ée]e?s?|pos[ée]e?s?|commit(?:s|[ée]e?s?)?|r[ée]dig[ée]e?s?|g[ée]n[ée]r[ée]e?s?|ajout[ée]e?s?|faite?s?)(?!\p{L})/giu;
// Négation juste avant le verbe : « aucun commit », « (non commité) », « rien publié ».
export const NEGATION = /(?<!\p{L})(?:non|aucune?|rien|pas|sans|jamais)[\s(]*$/iu;

// Blocages EXPLICITES. « RESTE » seul est un rappel ; « GATE » (quality gate) n'est pas « GATÉ ».
export const BLOCKERS = [
  /(?<!\p{L})GATÉ/u,
  /\bgated\b/i,
  /(?<!\p{L})bloqu[ée]e?s?\s+par(?!\p{L})/iu,
  /(?<!\p{L})en attente d[e'’u]/iu,
  /IRR[ÉE]DUCTIBLEMENT\s+USER/iu,
  /\bRESTE(?:NT)?\b.{0,80}\bUSER\b/u,
];

// Formules sans-objet explicites. Citer une tâche annulée ne suffit pas.
export const OBSOLETE = [
  /(?<!\p{L})remplac[ée]e?s?\s+par(?!\p{L})/iu,
  /(?<!\p{L})annul[ée]e?s?\s+car(?!\p{L})/iu,
  /(?<!\p{L})migr[ée]e?s?\s+vers(?!\p{L})/iu,
];

// Conséquences conditionnelles. « avant le JJ/MM » seul = échéance, absent d'ici.
export const CONDITION = /(?<!\p{L})(J\+(\d+)|sinon|fen[êe]tres?|expir\p{L}*)(?!\p{L})/iu;

export const URL = /https?:\/\/[^\s<>"'`»)\]]+/g;
// Relatif à la racine, ou absolu / ../ (extraits pour que le contrôle les REFUSE). Routes /x/y exclues.
export const PATH = /(?<![\w/:.@\\-])(?:[A-Za-z]:\/)?(?:\.{1,2}\/)*\.?[\w@][\w.@-]*(?:\/[\w.@-]+)+\/?/g;
export const PATH_TAIL = /(?:\.[A-Za-z][A-Za-z0-9]{0,5}|\/)$/;
export const SHA = /(?<![#\w./-])[0-9a-f]{7,40}(?![\w/-])(?!\.\w)/g;
// Un hexa ne vaut « commit » que si la phrase le dit ; sinon c'est un « hex » (alerte, empreinte, version) qui ne compte que si git le trouve.
export const COMMIT_WORD = /(?<!\p{L})(?:commit\p{L}*|pouss[ée]\p{L}*)(?!\p{L})/iu;
export const SHA256_BEFORE = /sha-?256\W{0,3}$/i;
export const LINK = /(?<![\w/.@-])[a-z0-9]+(?:-[a-z0-9]+){2,}(?![\w/@-])(?!\.\w)/g;
export const DATE = /(?<![\d/])(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)(?![\d/])/g;
