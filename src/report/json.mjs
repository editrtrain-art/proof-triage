// Contrat report.json, lu par le futur panneau du tableau de bord. Changer la forme = monter schemaVersion.
export const SCHEMA_VERSION = 1;

export function toReport(rows, meta) {
  const counts = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  return { schemaVersion: SCHEMA_VERSION, meta: { tool: 'proof-triage', ...meta, counts }, rows };
}
