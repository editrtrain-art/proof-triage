// Écriture du registre (v0.2) : contrôle de concurrence, validation, sauvegarde des octets d'origine, format conservé.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load, save } from '../src/sources/ops-tasks-json.mjs';
import { applyOp } from '../src/core/ops.mjs';

const ORIGINAL = JSON.stringify({ schemaVersion: 1, tasks: [{ id: 'a', title: 'A', due: '2026-09-01', owner: 'claude', status: 'todo', notes: '', doneDate: null }] }, null, 2) + '\n';
let dir, file, backups;
beforeEach(() => {
  dir = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-save-'));
  file = join(dir, 'ops-tasks.json');
  backups = join(dir, 'backups');
  writeFileSync(file, ORIGINAL);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('save : écrit le nouveau document au format du registre (2 espaces, \\n final) et sauvegarde les octets d\'origine', () => {
  const { doc, hash } = load(file);
  const next = applyOp(doc, { kind: 'close', id: 'a' }, { today: '2026-10-22' });
  const r = save(file, next, { expectHash: hash, backupDir: backups, stamp: '193005000' });
  assert.equal(readFileSync(file, 'utf8'), JSON.stringify(next, null, 2) + '\n');
  assert.equal(readFileSync(r.backup, 'utf8'), ORIGINAL);
  assert.deepEqual(readdirSync(backups), ['ops-tasks-193005000.json']);
  assert.equal(load(file).hash, r.hash);
});

test('save refuse si le registre a changé depuis la lecture : rien n\'est écrit, aucune sauvegarde', () => {
  const { doc, hash } = load(file);
  writeFileSync(file, ORIGINAL.replace('"A"', '"A modifiée"'));
  assert.throws(() => save(file, doc, { expectHash: hash, backupDir: backups, stamp: 'x' }), /modifié/);
  assert.match(readFileSync(file, 'utf8'), /A modifiée/);
  assert.ok(!existsSync(backups));
});

test('save refuse un document invalide : rien n\'est écrit', () => {
  const { doc, hash } = load(file);
  doc.tasks[0].status = 'fini';
  assert.throws(() => save(file, doc, { expectHash: hash, backupDir: backups, stamp: 'x' }), /statut/);
  assert.equal(readFileSync(file, 'utf8'), ORIGINAL);
});

test('load expose le document brut (non normalisé) pour l\'écriture', () => {
  const { doc, byId } = load(file);
  assert.equal(doc.tasks[0].priority, undefined);
  assert.equal(byId.get('a').priority, 'P9');
});
