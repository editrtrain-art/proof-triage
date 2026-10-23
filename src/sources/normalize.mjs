// Contrat commun des adaptateurs : tâches normalisées pour le tri, index par id, empreinte SHA-256 des octets lus.
import { createHash } from 'node:crypto';

const PRIORITY = { high: 'P1', medium: 'P2', low: 'P3' };
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Échéance comparée comme texte AAAA-MM-JJ : « 2026-9-1 » est complété ; une forme inconnue est ignorée
// (la tâche sort du tri des retards) plutôt que comparée à tort.
const normDue = (d) => { const m = String(d ?? '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : undefined; };

export const normalize = (t) => ({ ...t, due: normDue(t.due), priority: PRIORITY[t.priority] || t.priority || 'P9', owner: t.owner || 'unknown' });

export function registry(raw, format, rawTasks, extra = {}) {
  const tasks = rawTasks.map(normalize);
  return { meta: { format, count: tasks.length, ...extra }, tasks, byId: new Map(tasks.map((t) => [t.id, t])), hash: sha256(raw) };
}
