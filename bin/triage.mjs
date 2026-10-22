#!/usr/bin/env node
// CLI mince : lit les options et la config, assemble les modules, écrit le rapport. Aucune logique de verdict ici.
// Le tri est en lecture seule sur le registre : il est ouvert une fois, son empreinte est revérifiée en fin de run.
// --apply <dossier> (v0.2) est la seule voie d'écriture du tri : cases cochées par le user, une sauvegarde, rien d'autre.
import { parseArgs } from 'node:util';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load, save, unchanged } from '../src/sources/ops-tasks-json.mjs';
import { selectOverdue } from '../src/core/select.mjs';
import { claims } from '../src/core/extract.mjs';
import { decide } from '../src/core/verdict.mjs';
import { applyOp, taskHash } from '../src/core/ops.mjs';
import { planApply } from '../src/core/apply.mjs';
import { checkFile } from '../src/checks/file.mjs';
import { checkCommit } from '../src/checks/commit.mjs';
import { checkUrl } from '../src/checks/url.mjs';
import { toReport, SCHEMA_VERSION } from '../src/report/json.mjs';
import { toMarkdown, checkedIds } from '../src/report/md.mjs';
import { loadConfig, DEFAULT_CONFIG, localToday } from '../src/lib/config.mjs';

const fail = (msg) => { console.error(`proof-triage : ${msg}`); process.exit(2); };

const { values: o } = parseArgs({
  options: {
    config: { type: 'string', default: DEFAULT_CONFIG },
    registry: { type: 'string' },
    limit: { type: 'string', default: '20' },
    today: { type: 'string', default: localToday() },
    net: { type: 'boolean', default: false },
    explain: { type: 'string' },
    simulate: { type: 'string', multiple: true, default: [] },
    apply: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

let conf;
try { conf = loadConfig(o.config, o.registry); } catch (e) { fail(e.message); }
const { cfg, root, registry } = conf;
const limit = Number(o.limit);
if (!/^\d{4}-\d{2}-\d{2}$/.test(o.today)) fail(`--today attend AAAA-MM-JJ, reçu « ${o.today} »`);
if (!Number.isInteger(limit) || limit < 1) fail(`--limit attend un entier positif, reçu « ${o.limit} »`);

if (o.apply) {
  const reportFile = join(o.apply, 'report.json');
  const mdFile = join(o.apply, 'triage.md');
  if (!existsSync(reportFile) || !existsSync(mdFile)) fail(`--apply attend un dossier de tri (report.json + triage.md) : ${o.apply}`);
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  if (report.meta?.tool !== 'proof-triage' || report.schemaVersion !== SCHEMA_VERSION) fail('report.json n\'est pas un tri proof-triage au schéma attendu');
  if (report.meta.simulate?.length) fail(`ce tri a été produit avec --simulate (${report.meta.simulate.join(', ')}) : preuves fictives, --apply refusé`);
  const reg = load(registry);
  const { ops, skipped } = planApply(report, checkedIds(readFileSync(mdFile, 'utf8')), reg.doc);
  for (const op of ops) console.log(`${o['dry-run'] ? '(simulation) ' : ''}${op.kind} ${op.id}`);
  for (const s of skipped) console.log(`ignorée ${s.id} : ${s.reason}`);
  if (!ops.length) { console.log('rien à appliquer'); process.exit(0); }
  if (o['dry-run']) process.exit(0);
  try {
    const next = ops.reduce((d, op) => applyOp(d, op, { today: o.today }), reg.doc);
    const r = save(registry, next, { expectHash: reg.hash, backupDir: conf.outDir('backup', o.today) });
    console.log(`✓ ${ops.length} décision(s) appliquée(s) · sauvegarde : ${r.backup}`);
    const pruned = conf.pruneBackups(o.today);
    if (pruned.length) console.log(`${pruned.length} sauvegarde(s) de plus de 30 j retirée(s)`);
  } catch (e) {
    fail(e.message);
  }
  process.exit(0);
}

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
const rawById = new Map(reg.doc.tasks.map((t) => [t.id, t]));
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
  // taskHash : empreinte de la tâche brute, pour que --apply refuse une décision prise sur une version périmée.
  rows.push({ id: t.id, title: t.title, owner: t.owner, due: t.due, priority: t.priority, status: t.status, taskHash: taskHash(rawById.get(t.id)), ...v });
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
  const dir = conf.outDir(`top${limit}${o.net ? '-net' : ''}${o.simulate.length ? '-sim' : ''}`, o.today);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(dir, 'triage.md'), toMarkdown(report));
  console.log(`${rows.length} tâches triées sur ${meta.overdueTotal} en retard → ${dir}`);
  console.log(Object.entries(report.meta.counts).map(([k, n]) => `${k} : ${n}`).join(' · '));
}
