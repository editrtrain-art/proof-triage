// Recopié de tools/lib/audit-name.mjs (slug, auditName ; 2026-10-22), sans la racine machine :
// le dossier parent vient de la config ou d'AUDIT_DIR, jamais d'ici.
// RÈGLE du 2026-10-09 : une sortie se nomme <outil>-<cible>-<fenetre>-<date>, jamais par la date seule.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Segment de nom sûr : minuscules, chiffres, point et tiret. */
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');

export function auditName({ tool, target, window, date }) {
  for (const [k, v] of Object.entries({ tool, target, window, date })) {
    if (v === undefined || v === null || String(v).trim() === '') throw new Error(`auditName : « ${k} » manquant (règle <outil>-<cible>-<fenetre>-<date>)`);
  }
  if (!DATE_RE.test(String(date))) throw new Error(`auditName : date invalide « ${date} » (attendu AAAA-MM-JJ)`);
  return [slug(tool), slug(target), slug(window), date].join('-');
}
