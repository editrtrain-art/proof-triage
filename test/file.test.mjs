import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFile } from '../src/checks/file.mjs';

let base, root;
before(() => {
  base = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-file-'));
  root = join(base, 'root');
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, '.secrets'));
  mkdirSync(join(base, 'outside'));
  writeFileSync(join(root, 'docs', 'a.md'), 'x');
  writeFileSync(join(root, '.secrets', 'k.env'), 'SECRET=1');
  writeFileSync(join(base, 'outside', 'f.md'), 'x');
  symlinkSync(join(base, 'outside'), join(root, 'escape'), 'junction');
});
after(() => rmSync(base, { recursive: true, force: true }));

test('fichier relatif existant sous la racine → present, chemin réel relatif (aucun chemin machine)', () => {
  assert.deepEqual(checkFile('docs/a.md', { root }), { state: 'present', real: 'docs/a.md' });
});

test('dossier existant (barre finale) → present', () => {
  assert.equal(checkFile('docs/', { root }).state, 'present');
});

test('fichier absent → absent', () => {
  assert.equal(checkFile('docs/b.md', { root }).state, 'absent');
});

test('chemins absolus et remontées refusés sans toucher au disque', () => {
  for (const p of ['D:/x/y.md', 'C:\\x\\y.md', '/etc/passwd', '\\\\srv\\share\\x.md', '../outside/f.md', 'docs/../../outside/f.md', '..']) {
    assert.equal(checkFile(p, { root }).state, 'refused', p);
  }
});

test('segment .secrets refusé, casse comprise, même s\'il existe', () => {
  assert.equal(checkFile('.secrets/k.env', { root }).state, 'refused');
  assert.equal(checkFile('docs/.SECRETS/k.env', { root }).state, 'refused');
});

test('segments refusés configurables', () => {
  assert.equal(checkFile('docs/a.md', { root, refuseSegments: ['docs'] }).state, 'refused');
});

test('lien ou jonction qui sort de la racine → refused (chemin canonique contrôlé)', () => {
  assert.equal(checkFile('escape/f.md', { root }).state, 'refused');
});
