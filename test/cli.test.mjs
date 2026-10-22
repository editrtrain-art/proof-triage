// Bout en bout sur la fixture SYNTHÉTIQUE, dans une racine jetable qui est un dépôt git. Jamais le vrai registre.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/triage.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/registry-sample.json', import.meta.url));
const G = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false'];
let base, root, audit, cfg, registry;

const git = (...a) => execFileSync('git', ['-C', root, ...G, ...a], { encoding: 'utf8' }).trim();
const cli = (...args) => spawnSync(process.execPath, [BIN, '--config', cfg, '--today', '2026-10-22', ...args], { encoding: 'utf8', env: { ...process.env, AUDIT_DIR: audit } });
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

before(() => {
  base = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-cli-'));
  root = join(base, 'root');
  audit = join(base, 'audit');
  mkdirSync(join(root, 'docs'), { recursive: true });
  git('init', '-q');
  writeFileSync(join(root, 'docs', 'rapport.md'), 'r');
  git('add', 'docs/rapport.md');
  git('commit', '-q', '-m', 'rapport');
  const sha = git('rev-parse', '--short=10', 'HEAD');
  writeFileSync(join(root, 'docs', 'other.md'), 'o');
  git('add', 'docs/other.md');
  git('commit', '-q', '-m', 'other');
  const other = git('rev-parse', '--short=10', 'HEAD');
  for (const f of ['script.mjs', 'page.md', 'brouillon.md']) writeFileSync(join(root, 'docs', f), 'x');
  registry = join(root, 'registry.json');
  writeFileSync(registry, readFileSync(FIXTURE, 'utf8').replaceAll('{{SHA_OTHER}}', other).replaceAll('{{SHA}}', sha));
  cfg = join(base, 'proof-triage.config.json');
  writeFileSync(cfg, JSON.stringify({ root, registry: 'registry.json', repos: ['.'], outDir: 'AUDIT' }));
});
after(() => rmSync(base, { recursive: true, force: true }));

test('tri complet : un verdict attendu par tâche en retard, exclusions respectées, registre intact', () => {
  const before = sha256(registry);
  const r = cli('--limit', '100');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sha256(registry), before);

  const dir = join(audit, 'proof-triage-registry-top100-2026-10-22');
  assert.ok(existsSync(join(dir, 'triage.md')));
  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  assert.equal(report.meta.tool, 'proof-triage');
  assert.equal(report.meta.registryHash, before);
  assert.equal(report.meta.overdueTotal, 19);

  const got = Object.fromEntries(report.rows.map((x) => [x.id, [x.verdict, x.confidence, ...x.flags.filter((f) => f !== 'avancement')].join(' ')]));
  assert.deepEqual(got, {
    'a-clore-haute': 'clore haute',
    'v-priorite': 'replanifier basse',
    'b-clore-url': 'à-vérifier basse',
    'c-source-seule': 'à-vérifier ',
    'd-reste-sans-user': 'replanifier basse',
    'e-bloquee': 'bloquée-user moyenne',
    'f-commit-sans-lien': 'clore moyenne',
    'g-cite-annulee': 'replanifier basse',
    'h-avant-le': 'replanifier basse',
    'i-chemins-refuses': 'replanifier basse',
    'j-migree': 'sans-objet moyenne',
    'k-remplacee': 'sans-objet moyenne',
    'l-contradiction': 'à-vérifier  contradiction',
    'm-commit-absent': 'à-vérifier  contradiction',
    'n-condition': 'à-vérifier  condition-échue',
    'o-jplus': 'replanifier basse condition-échue',
    'p-recurrente': 'à-vérifier  récurrente',
    'q-avancement': 'à-vérifier basse',
    'w-secrets': 'à-vérifier ',
  });
});

test('--explain rejoue une tâche ; --simulate commit=absent fait basculer clore en à-vérifier, sans rien écrire', () => {
  const plain = cli('--explain', 'a-clore-haute');
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /## clore/);
  const sim = cli('--explain', 'a-clore-haute', '--simulate', 'commit=absent');
  assert.equal(sim.status, 0, sim.stderr);
  assert.match(sim.stdout, /## à-vérifier/);
  assert.match(sim.stdout, /contradiction/);
  assert.match(sim.stdout, /simulation : commit=absent/);
  assert.ok(!existsSync(join(audit, 'proof-triage-registry-top20-2026-10-22')));
});

test('--explain sur un id inconnu, --simulate mal formé, config absente → code 2 et message', () => {
  assert.equal(cli('--explain', 'nope').status, 2);
  assert.equal(cli('--explain', 'a-clore-haute', '--simulate', 'commit').status, 2);
  assert.equal(cli('--explain', 'a-clore-haute', '--simulate', 'commit=abesnt').status, 2);
  const r = spawnSync(process.execPath, [BIN, '--config', join(base, 'absent.json')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /proof-triage\.config\.example\.json/);
});
