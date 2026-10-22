// Purge des sauvegardes du registre : seulement les dossiers proof-triage-<registre>-backup-<date> plus vieux que la rétention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/lib/config.mjs';

test('pruneBackups : retire les sauvegardes de plus de 30 jours de CE registre, ne touche à rien d\'autre', () => {
  const base = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-prune-'));
  const audit = join(base, 'AUDIT');
  const saved = process.env.AUDIT_DIR;
  delete process.env.AUDIT_DIR;
  try {
    for (const d of ['proof-triage-ops-tasks-backup-2026-09-01', 'proof-triage-ops-tasks-backup-2026-09-22', 'proof-triage-ops-tasks-backup-2026-10-01',
      'proof-triage-other-backup-2026-01-01', 'proof-triage-ops-tasks-top20-2026-01-01', 'psi-ops-tasks-backup-2026-01-01', 'proof-triage-ops-tasks-backup-latest']) {
      mkdirSync(join(audit, d), { recursive: true });
      writeFileSync(join(audit, d, 'f.json'), '{}');
    }
    const cfg = join(base, 'cfg.json');
    writeFileSync(cfg, JSON.stringify({ root: base, registry: 'ops-tasks.json', outDir: 'AUDIT' }));
    const removed = loadConfig(cfg).pruneBackups('2026-10-22');
    assert.deepEqual(removed, ['proof-triage-ops-tasks-backup-2026-09-01']);
    assert.deepEqual(readdirSync(audit).sort(), ['proof-triage-ops-tasks-backup-2026-09-22', 'proof-triage-ops-tasks-backup-2026-10-01', 'proof-triage-ops-tasks-backup-latest',
      'proof-triage-ops-tasks-top20-2026-01-01', 'proof-triage-other-backup-2026-01-01', 'psi-ops-tasks-backup-2026-01-01']);
    assert.deepEqual(loadConfig(cfg).pruneBackups('2026-10-22'), []);
  } finally {
    if (saved !== undefined) process.env.AUDIT_DIR = saved;
    rmSync(base, { recursive: true, force: true });
  }
});

test('pruneBackups : rétention configurable (backupKeepDays) et dossier absent sans erreur', () => {
  const base = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-prune-'));
  try {
    const cfg = join(base, 'cfg.json');
    writeFileSync(cfg, JSON.stringify({ root: base, registry: 'ops-tasks.json', outDir: 'AUDIT-absent', backupKeepDays: 7 }));
    const saved = process.env.AUDIT_DIR;
    delete process.env.AUDIT_DIR;
    try {
      assert.deepEqual(loadConfig(cfg).pruneBackups('2026-10-22'), []);
      mkdirSync(join(base, 'AUDIT-absent', 'proof-triage-ops-tasks-backup-2026-10-10'), { recursive: true });
      assert.deepEqual(loadConfig(cfg).pruneBackups('2026-10-22'), ['proof-triage-ops-tasks-backup-2026-10-10']);
    } finally {
      if (saved !== undefined) process.env.AUDIT_DIR = saved;
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
