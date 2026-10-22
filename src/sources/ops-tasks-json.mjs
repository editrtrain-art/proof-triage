// Adaptateur du registre ops-tasks.json : LECTURE SEULE, normalisation minimale.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PRIORITY = { high: 'P1', medium: 'P2', low: 'P3' };

export function load(path) {
  const raw = readFileSync(path);
  const j = JSON.parse(raw.toString('utf8'));
  const tasks = (j.tasks || []).map((t) => ({
    ...t,
    priority: PRIORITY[t.priority] || t.priority || 'P9',
    owner: t.owner || 'unknown',
  }));
  return {
    meta: { schemaVersion: j.schemaVersion, updated: j.updated, count: tasks.length },
    tasks,
    byId: new Map(tasks.map((t) => [t.id, t])),
    hash: createHash('sha256').update(raw).digest('hex'),
  };
}
