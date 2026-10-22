// Contrat commun des adaptateurs : tâches normalisées pour le tri, index par id, empreinte SHA-256 des octets lus.
import { createHash } from 'node:crypto';

const PRIORITY = { high: 'P1', medium: 'P2', low: 'P3' };
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const normalize = (t) => ({ ...t, priority: PRIORITY[t.priority] || t.priority || 'P9', owner: t.owner || 'unknown' });

export function registry(raw, format, rawTasks, extra = {}) {
  const tasks = rawTasks.map(normalize);
  return { meta: { format, count: tasks.length, ...extra }, tasks, byId: new Map(tasks.map((t) => [t.id, t])), hash: sha256(raw) };
}
