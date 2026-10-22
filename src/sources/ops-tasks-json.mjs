// Adaptateur du registre ops-tasks.json. load() = lecture et normalisation minimale (le tri ne fait que ça).
// save() = la SEULE écriture (v0.2, commandes task et triage --apply) : refuse un registre modifié depuis la lecture,
// refuse un document invalide, sauvegarde les octets d'origine, puis écrit de façon atomique au format du registre.
import { readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { validate } from '../core/ops.mjs';

const PRIORITY = { high: 'P1', medium: 'P2', low: 'P3' };
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Le registre est-il resté identique depuis load() ? Une écriture extérieure en cours de run invalide le rapport. */
export const unchanged = (path, hash) => sha256(readFileSync(path)) === hash;

export function load(path) {
  const raw = readFileSync(path);
  const doc = JSON.parse(raw.toString('utf8'));
  const tasks = (doc.tasks || []).map((t) => ({
    ...t,
    priority: PRIORITY[t.priority] || t.priority || 'P9',
    owner: t.owner || 'unknown',
  }));
  return {
    meta: { schemaVersion: doc.schemaVersion, updated: doc.updated, count: tasks.length },
    tasks,
    byId: new Map(tasks.map((t) => [t.id, t])),
    hash: sha256(raw),
    doc: JSON.parse(raw.toString('utf8')),
  };
}

export function save(path, doc, { expectHash, backupDir, stamp }) {
  if (!unchanged(path, expectHash)) throw new Error('registre modifié depuis la lecture : rien écrit, relancer');
  const errs = validate(doc);
  if (errs.length) throw new Error(`document invalide, rien écrit : ${errs.slice(0, 5).join(' ; ')}`);
  mkdirSync(backupDir, { recursive: true });
  const backup = join(backupDir, `${basename(path, '.json')}-${stamp}.json`);
  copyFileSync(path, backup, constants.COPYFILE_EXCL);
  const text = JSON.stringify(doc, null, 2) + '\n';
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return { backup, hash: sha256(text) };
}
