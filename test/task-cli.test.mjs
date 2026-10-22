// Commande task (v0.2) de bout en bout, sur une COPIE de la fixture synthétique.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/task.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/registry-sample.json', import.meta.url));
let base, root, audit, cfg, registry;
const task = (...args) => spawnSync(process.execPath, [BIN, ...args, '--config', cfg, '--today', '2026-10-22'], { encoding: 'utf8', env: { ...process.env, AUDIT_DIR: audit } });
const reg = () => JSON.parse(readFileSync(registry, 'utf8'));
const find = (id) => reg().tasks.find((t) => t.id === id);

before(() => {
  base = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-task-'));
  root = join(base, 'root');
  audit = join(base, 'audit');
  registry = join(base, 'root-registry.json');
  writeFileSync(registry, readFileSync(FIXTURE));
  cfg = join(base, 'proof-triage.config.json');
  writeFileSync(cfg, JSON.stringify({ root: base, registry: 'root-registry.json', repos: [], outDir: 'AUDIT' }));
});
after(() => rmSync(base, { recursive: true, force: true }));

test('close : done + doneDate, note ajoutée, sauvegarde sous <AUDIT>/proof-triage-<registre>-backup-<date>/', () => {
  const r = task('close', 'a-clore-haute', '--note', 'preuve vue');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([find('a-clore-haute').status, find('a-clore-haute').doneDate], ['done', '2026-10-22']);
  assert.match(find('a-clore-haute').notes, /22\/10 : preuve vue$/);
  assert.equal(readdirSync(join(audit, 'proof-triage-root-registry-backup-2026-10-22')).length, 1);
});

test('cancel, reschedule et add', () => {
  assert.equal(task('cancel', 'k-remplacee').status, 0);
  assert.equal(find('k-remplacee').status, 'cancelled');
  assert.equal(task('reschedule', 'v-priorite', '--due', '2026-11-30').status, 0);
  assert.equal(find('v-priorite').due, '2026-11-30');
  const r = task('add', 'nouvelle-tache', '--title', 'Nouvelle', '--due', '2026-11-02', '--owner', 'user', '--tags', 'a,b');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([find('nouvelle-tache').status, find('nouvelle-tache').tags], ['todo', ['a', 'b']]);
});

test('refus : delete sans --confirm, id déjà existant, commande inconnue, échéance mal formée → code 2, registre intact', () => {
  const before = readFileSync(registry, 'utf8');
  for (const args of [['delete', 'd-reste-sans-user'], ['add', 'a-clore-haute', '--title', 'X', '--due', '2026-11-02', '--owner', 'user'], ['purge', 'x'], ['reschedule', 'v-priorite', '--due', '30/11']]) {
    const r = task(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /proof-triage/);
  }
  assert.equal(readFileSync(registry, 'utf8'), before);
});

test('delete --confirm retire la tâche', () => {
  assert.equal(task('delete', 'd-reste-sans-user', '--confirm').status, 0);
  assert.equal(find('d-reste-sans-user'), undefined);
});
