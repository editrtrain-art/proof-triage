import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load, unchanged } from '../src/sources/ops-tasks-json.mjs';
import { selectOverdue } from '../src/core/select.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/registry-sample.json', import.meta.url));

test('load renvoie meta, tâches, index par id et empreinte SHA-256 du fichier', () => {
  const r = load(FIXTURE);
  assert.equal(r.meta.schemaVersion, 1);
  assert.equal(r.tasks.length, 24);
  assert.equal(r.byId.get('a-clore-haute').title, 'Livrer le rapport');
  assert.equal(r.hash, createHash('sha256').update(readFileSync(FIXTURE)).digest('hex'));
});

test('unchanged : vrai si le fichier n\'a pas bougé depuis load, faux après une écriture extérieure', () => {
  const dir = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-reg-'));
  try {
    const f = join(dir, 'registry.json');
    writeFileSync(f, readFileSync(FIXTURE));
    const { hash } = load(f);
    assert.equal(unchanged(f, hash), true);
    writeFileSync(f, readFileSync(FIXTURE, 'utf8').replace('Livrer le rapport', 'Livrer le rapport modifié'));
    assert.equal(unchanged(f, hash), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('load normalise priorité (high → P1) et owner vide (→ unknown)', () => {
  const { byId } = load(FIXTURE);
  assert.equal(byId.get('v-priorite').priority, 'P1');
  assert.equal(byId.get('w-secrets').owner, 'unknown');
});

test('selectOverdue garde todo/doing/open en retard, exclut parked, done, cancelled, futur, sans échéance', () => {
  const { tasks } = load(FIXTURE);
  const ids = selectOverdue(tasks, { today: '2026-10-22', limit: 100 }).map((t) => t.id);
  for (const out of ['r-parked', 's-done', 't-futur', 'u-sans-due', 'z-annulee-ancienne']) assert.ok(!ids.includes(out), out);
  assert.equal(ids.length, 19);
});

test('selectOverdue trie par échéance croissante puis priorité, et coupe à limit', () => {
  const { tasks } = load(FIXTURE);
  const ids = selectOverdue(tasks, { today: '2026-10-22', limit: 3 }).map((t) => t.id);
  assert.deepEqual(ids, ['a-clore-haute', 'v-priorite', 'b-clore-url']);
});

test('selectOverdue : une tâche due le jour même n\'est pas en retard', () => {
  const { tasks } = load(FIXTURE);
  const ids = selectOverdue(tasks, { today: '2026-09-02', limit: 100 }).map((t) => t.id);
  assert.deepEqual(ids, ['a-clore-haute', 'v-priorite']);
});
