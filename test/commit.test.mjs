import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCommit } from '../src/checks/commit.mjs';

const G = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false'];
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...G, ...a], { encoding: 'utf8' }).trim();
let root, shaA, shaB, tree;

before(() => {
  root = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-commit-'));
  const site = join(root, 'site');
  mkdirSync(join(site, 'src'), { recursive: true });
  git(site, 'init', '-q');
  writeFileSync(join(site, 'src', 'a.md'), 'a');
  git(site, 'add', 'src/a.md');
  git(site, 'commit', '-q', '-m', 'a');
  shaA = git(site, 'rev-parse', 'HEAD');
  writeFileSync(join(site, 'src', 'b.md'), 'b');
  git(site, 'add', 'src/b.md');
  git(site, 'commit', '-q', '-m', 'b');
  shaB = git(site, 'rev-parse', 'HEAD');
  tree = git(site, 'rev-parse', 'HEAD^{tree}');
  mkdirSync(join(root, 'plain'));
});
after(() => rmSync(root, { recursive: true, force: true }));

test('commit trouvé : dépôt et chemins touchés (chemin relatif racine ou dépôt)', async () => {
  const r = await checkCommit(shaA.slice(0, 7), { root, repos: ['plain', 'site'], paths: ['site/src/a.md', 'src/a.md', 'site/src/b.md'] });
  assert.deepEqual(r, { state: 'found', repo: 'site', touches: ['site/src/a.md', 'src/a.md'] });
});

test('commit trouvé qui ne touche aucun chemin cité → touches vide', async () => {
  const r = await checkCommit(shaB, { root, repos: ['site'], paths: ['site/src/a.md'] });
  assert.deepEqual([r.state, r.touches], ['found', []]);
});

test('SHA inconnu → absent', async () => {
  assert.equal((await checkCommit('deadbee1', { root, repos: ['site'] })).state, 'absent');
});

test('objet qui n\'est pas un commit (arbre) → absent', async () => {
  assert.equal((await checkCommit(tree, { root, repos: ['site'] })).state, 'absent');
});

test('SHA mal formé → refused, sans appel git', async () => {
  for (const s of ['abc12', '--output=x', '8f1c590; rm -rf /', 'ABCDEF1', 'g123456']) {
    assert.equal((await checkCommit(s, { root, repos: ['site'] })).state, 'refused', s);
  }
});

test('un sous-dossier non-dépôt ne remonte pas vers le dépôt parent (aucun dépôt utilisable → error)', async () => {
  assert.equal((await checkCommit(shaA, { root, repos: ['site/src'] })).state, 'error');
});

test('panne d\'environnement (git introuvable) → error, jamais absent', async () => {
  const path = process.env.PATH;
  process.env.PATH = '';
  try {
    const r = await checkCommit(shaA, { root, repos: ['site'] });
    assert.equal(r.state, 'error');
    assert.match(r.reason, /aucun dépôt utilisable|ENOENT/);
  } finally {
    process.env.PATH = path;
  }
});

test('nom de dépôt normalisé (./site/) pour la correspondance des chemins touchés', async () => {
  const r = await checkCommit(shaA, { root, repos: ['./site/'], paths: ['site/src/a.md'] });
  assert.deepEqual([r.state, r.repo, r.touches], ['found', 'site', ['site/src/a.md']]);
});

test('les variables GIT_* de l\'environnement sont ignorées', async () => {
  process.env.GIT_DIR = join(root, 'plain');
  try {
    assert.equal((await checkCommit(shaA, { root, repos: ['site'] })).state, 'found');
  } finally {
    delete process.env.GIT_DIR;
  }
});
