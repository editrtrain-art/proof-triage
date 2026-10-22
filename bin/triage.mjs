#!/usr/bin/env node
// CLI mince : lit les options et la config, assemble les modules, écrit le rapport. Aucune logique de verdict ici.
// Lecture seule sur le registre : il est ouvert une fois, son empreinte est revérifiée en fin de run.
import { parseArgs } from 'node:util';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, unchanged } from '../src/sources/ops-tasks-json.mjs';
import { selectOverdue } from '../src/core/select.mjs';
import { claims } from '../src/core/extract.mjs';
import { decide } from '../src/core/verdict.mjs';
import { checkFile } from '../src/checks/file.mjs';
import { checkCommit } from '../src/checks/commit.mjs';
import { checkUrl } from '../src/checks/url.mjs';
import { toReport } from '../src/report/json.mjs';
import { toMarkdown } from '../src/report/md.mjs';
import { auditName, slug } from '../src/lib/audit-name.mjs';

const fail = (msg) => { console.error(`proof-triage : ${msg}`); process.exit(2); };

const { values: o } = parseArgs({
  options: {
    config: { type: 'string', default: join(dirname(fileURLToPath(import.meta.url)), '..', 'proof-triage.config.json') },
    registry: { type: 'string' },
    limit: { type: 'string', default: '20' },
    today: { type: 'string', default: new Date().toLocaleDateString('sv-SE') },
    net: { type: 'boolean', default: false },
    explain: { type: 'string' },
    simulate: { type: 'string', multiple: true, default: [] },
  },
});

if (!existsSync(o.config)) fail(`config introuvable (${o.config}) : copier proof-triage.config.example.json en proof-triage.config.json et l'adapter.`);
const cfg = JSON.parse(readFileSync(o.config, 'utf8'));
const root = resolve(dirname(o.config), cfg.root);
const registry = o.registry ? resolve(o.registry) : resolve(root, cfg.registry);
const limit = Number(o.limit);
if (!/^\d{4}-\d{2}-\d{2}$/.test(o.today)) fail(`--today attend AAAA-MM-JJ, reçu « ${o.today} »`);
if (!Number.isInteger(limit) || limit < 1) fail(`--limit attend un entier positif, reçu « ${o.limit} »`);

// --simulate kind=state : force l'état de tous les contrôles d'un type (démo du contre-factuel).
const KINDS = {
  file: { map: 'files', states: ['present', 'absent', 'refused'] },
  commit: { map: 'commits', states: ['found', 'absent', 'refused', 'error'] },
  url: { map: 'urls', states: ['ok', 'gone', 'antibot', 'server', 'unreachable', 'redirected', 'refused', 'other'] },
};
const simulate = o.simulate.map((s) => {
  const [kind, state] = s.split('=');
  if (!KINDS[kind]?.states.includes(state)) fail(`--simulate attend file|commit|url=<état connu>, reçu « ${s} »`);
  return { map: KINDS[kind].map, state };
});

const reg = load(registry);
let tasks;
if (o.explain) {
  const t = reg.byId.get(o.explain);
  if (!t) fail(`tâche inconnue : ${o.explain}`);
  tasks = [t];
} else {
  tasks = selectOverdue(reg.tasks, { today: o.today, limit });
}

const rows = [];
for (const t of tasks) {
  const c = claims(t);
  const results = { files: {}, commits: {}, urls: {} };
  const cited = c.paths.filter((p) => p.role !== 'context').map((p) => p.value);
  for (const s of c.shas) results.commits[s.value] = await checkCommit(s.value, { root, repos: cfg.repos || [], paths: cited });
  // Un chemin absent à la racine est cherché dans le dépôt d'un commit trouvé qui le touche (et seulement là).
  const under = (p) => Object.values(results.commits).filter((r) => r.state === 'found' && r.repo !== '.' && r.touches.includes(p)).map((r) => r.repo);
  for (const p of c.paths) results.files[p.value] = checkFile(p.value, { root, refuseSegments: cfg.refuseSegments, under: under(p.value) });
  if (o.net) for (const u of c.urls) results.urls[u.value] = await checkUrl(u.value);
  for (const { map, state } of simulate) {
    const keys = { files: c.paths, commits: c.shas, urls: c.urls }[map];
    for (const k of keys) results[map][k.value] = { state, touches: [] };
  }
  const v = decide(t, c, results, { today: o.today, byId: reg.byId });
  rows.push({ id: t.id, title: t.title, owner: t.owner, due: t.due, priority: t.priority, status: t.status, ...v });
}

const meta = {
  today: o.today,
  registryHash: reg.hash,
  limit,
  overdueTotal: selectOverdue(reg.tasks, { today: o.today }).length,
  net: o.net,
  simulate: o.simulate,
};
if (!unchanged(registry, reg.hash)) fail('le registre a changé pendant le run (écriture extérieure) : aucun rapport écrit, relancer.');
const report = toReport(rows, meta);

if (o.explain) {
  if (o.simulate.length) console.log(`> simulation : ${o.simulate.join(', ')}\n`);
  console.log(toMarkdown(report));
} else {
  const window = `top${limit}${o.net ? '-net' : ''}${o.simulate.length ? '-sim' : ''}`;
  const name = auditName({ tool: 'proof-triage', target: slug(basename(registry, '.json')), window, date: o.today });
  const dir = join(process.env.AUDIT_DIR || resolve(root, cfg.outDir || 'AUDIT'), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(dir, 'triage.md'), toMarkdown(report));
  console.log(`${rows.length} tâches triées sur ${meta.overdueTotal} en retard → ${dir}`);
  console.log(Object.entries(report.meta.counts).map(([k, n]) => `${k} : ${n}`).join(' · '));
}
