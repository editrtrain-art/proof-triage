// Tri de bout en bout sur une liste Markdown et un export GitHub Issues (fixtures SYNTHÉTIQUES) ; l'écriture reste JSON.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = (f) => fileURLToPath(new URL(`../bin/${f}`, import.meta.url));
const FX = (f) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));
let base, audit, cfg;
const run = (bin, ...args) => spawnSync(process.execPath, [BIN(bin), '--config', cfg, '--today', '2026-10-22', ...args], { encoding: 'utf8', env: { ...process.env, AUDIT_DIR: audit } });
const rows = (name) => Object.fromEntries(JSON.parse(readFileSync(join(audit, name, 'report.json'), 'utf8')).rows.map((r) => [r.id, `${r.verdict} ${r.confidence ?? ''}`.trim()]));

before(() => {
  base = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-formats-'));
  audit = join(base, 'audit');
  mkdirSync(join(base, 'docs'));
  writeFileSync(join(base, 'docs', 'rapport.md'), 'r');
  writeFileSync(join(base, 'docs', 'guide.md'), 'g');
  copyFileSync(FX('tasks-sample.md'), join(base, 'tasks.md'));
  copyFileSync(FX('issues-sample.json'), join(base, 'issues.json'));
  cfg = join(base, 'cfg.json');
  writeFileSync(cfg, JSON.stringify({ root: base, registry: 'tasks.md', repos: [], outDir: 'AUDIT' }));
});
after(() => rmSync(base, { recursive: true, force: true }));

test('tri d\'une liste Markdown : verdicts, meta.format, nom de sortie', () => {
  const r = run('triage.mjs', '--limit', '10');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(rows('proof-triage-tasks-top10-2026-10-22'), {
    'md-rapport': 'à-vérifier basse', 'signer-le-contrat': 'bloquée-user moyenne', 'puce-etoile': 'à-vérifier',
  });
  assert.equal(JSON.parse(readFileSync(join(audit, 'proof-triage-tasks-top10-2026-10-22', 'report.json'), 'utf8')).meta.format, 'markdown');
});

test('tri d\'un export GitHub Issues (format déduit, --registry)', () => {
  const r = run('triage.mjs', '--registry', join(base, 'issues.json'), '--limit', '10');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(rows('proof-triage-issues-top10-2026-10-22'), { 'issue-12': 'à-vérifier basse', 'issue-13': 'bloquée-user moyenne' });
});

test('--format forcé inconnu → code 2', () => {
  assert.equal(run('triage.mjs', '--format', 'trello').status, 2);
});

test('écriture refusée hors registre JSON : task et --apply → code 2, fichier intact', () => {
  const before = readFileSync(join(base, 'tasks.md'), 'utf8');
  const t = run('task.mjs', 'close', 'md-rapport');
  assert.equal(t.status, 2);
  assert.match(t.stderr, /ops-tasks-json/);
  const dir = join(audit, 'proof-triage-tasks-top10-2026-10-22');
  writeFileSync(join(dir, 'triage.md'), readFileSync(join(dir, 'triage.md'), 'utf8').replace(/^- \[ \]/gm, '- [x]'));
  const a = run('triage.mjs', '--apply', dir);
  assert.equal(a.status, 2);
  assert.match(a.stderr, /ops-tasks-json/);
  assert.equal(readFileSync(join(base, 'tasks.md'), 'utf8'), before);
});
