#!/usr/bin/env node
// Démo web statique (v0.3) : lance le VRAI pipeline sur le registre SYNTHÉTIQUE test/fixtures/demo-registry.json,
// dans une racine jetable (fichiers + dépôt git aux dates figées : SHA stables, page déterministe), puis écrit
// <out>/index.html et rien d'autre. Seul ce dossier est publié (vercel.json : outputDirectory = demo).
//   node bin/demo.mjs [--out demo]
import { parseArgs } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../src/sources/index.mjs';
import { selectOverdue } from '../src/core/select.mjs';
import { triageTasks } from '../src/run.mjs';
import { toReport } from '../src/report/json.mjs';
import { toHtml } from '../src/report/html.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { values: o } = parseArgs({ options: { out: { type: 'string', default: join(HERE, '..', 'demo') } } });
const TODAY = '2026-10-22'; // figé : la page n'affiche que des retards en jours, jamais cette date
const REPLAY = 'guide-installation';

// Identité et dates figées, aucune variable GIT_* héritée : mêmes SHA sur tout poste.
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.invalid', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.invalid', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };

const root = mkdtempSync(join(tmpdir(), 'pt-demo-root-'));
try {
  const git = (...a) => execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...a], { encoding: 'utf8', env }).trim();
  const write = (f) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), `${f}\n`); };
  git('init', '-q');
  for (const f of ['docs/guide.md', 'docs/releve.md']) write(f);
  git('add', 'docs/guide.md', 'docs/releve.md');
  git('commit', '-q', '-m', 'docs: guide and weekly report');
  const sha = git('rev-parse', '--short=10', 'HEAD');
  write('docs/changelog-tooling.md');
  git('add', 'docs/changelog-tooling.md');
  git('commit', '-q', '-m', 'chore: tooling');
  const other = git('rev-parse', '--short=10', 'HEAD');
  for (const f of ['docs/release.md', 'docs/glossaire.md', 'docs/brouillon.md']) write(f);

  const registry = join(root, 'registry.json');
  writeFileSync(registry, readFileSync(join(HERE, '..', 'test', 'fixtures', 'demo-registry.json'), 'utf8').replaceAll('{{SHA_OTHER}}', other).replaceAll('{{SHA}}', sha));
  const reg = loadRegistry(registry);
  const ctx = { root, repos: ['.'], today: TODAY };
  const tasks = selectOverdue(reg.tasks, { today: TODAY });
  const rows = await triageTasks(tasks, reg, ctx);
  const [simulated] = await triageTasks([reg.byId.get(REPLAY)], reg, { ...ctx, simulate: [{ map: 'commits', state: 'absent' }] });
  const report = toReport(rows, { today: TODAY, registryHash: reg.hash, limit: tasks.length, overdueTotal: tasks.length, net: false, format: reg.meta.format });

  mkdirSync(o.out, { recursive: true });
  writeFileSync(join(o.out, 'index.html'), toHtml({ report, replay: { actual: rows.find((r) => r.id === REPLAY), simulated, simulate: 'commit=absent' } }));
  console.log(`démo écrite : ${join(o.out, 'index.html')} (${rows.length} tâches synthétiques)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
