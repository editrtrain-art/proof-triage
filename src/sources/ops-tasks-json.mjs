// Adaptateur du registre ops-tasks.json. load() = lecture et normalisation minimale (le tri ne fait que ça).
// save() = la SEULE écriture (v0.2, commandes task et triage --apply) : refuse un registre modifié depuis la lecture,
// refuse un document invalide, sauvegarde les octets d'origine, puis écrit de façon atomique au format du registre.
import { readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync, rmSync, constants } from 'node:fs';
import { join, basename } from 'node:path';
import { validate } from '../core/ops.mjs';
import { registry, sha256 } from './normalize.mjs';

/** Le registre est-il resté identique depuis load() ? Une écriture extérieure en cours de run invalide le rapport. */
export const unchanged = (path, hash) => sha256(readFileSync(path)) === hash;

export function load(path) {
  const raw = readFileSync(path);
  const doc = JSON.parse(raw.toString('utf8'));
  // tasks = copies normalisées pour le tri ; doc reste brut pour l'écriture (seul format qui s'écrit).
  return { ...registry(raw, 'ops-tasks-json', doc.tasks || [], { schemaVersion: doc.schemaVersion, updated: doc.updated }), doc };
}

const CHANGED = 'registre modifié depuis la lecture : rien écrit, relancer';

export function save(path, doc, { expectHash, backupDir, stamp = new Date().toISOString().slice(11, 23).replace(/[:.]/g, '') }) {
  if (!unchanged(path, expectHash)) throw new Error(CHANGED);
  const errs = validate(doc);
  if (errs.length) throw new Error(`document invalide, rien écrit : ${errs.slice(0, 5).join(' ; ')}`);
  mkdirSync(backupDir, { recursive: true });
  const backup = join(backupDir, `${basename(path, '.json')}-${stamp}.json`);
  copyFileSync(path, backup, constants.COPYFILE_EXCL);
  const text = JSON.stringify(doc, null, 2) + '\n';
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, text);
    // shortcut: second contrôle juste avant le renommage ; il réduit la fenêtre de concurrence sans la fermer (pas de verrou).
    // Ajouter un fichier verrou si un autre écrivain automatique du registre apparaît.
    if (!unchanged(path, expectHash)) throw new Error(CHANGED);
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
  return { backup, hash: sha256(text) };
}
