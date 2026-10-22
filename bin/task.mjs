#!/usr/bin/env node
// Commande task (v0.2) : add | close | cancel | reschedule | reassign | delete, une opération par appel.
// Validation avant écriture, sauvegarde datée sous AUDIT/, refus si le registre a bougé entre lecture et écriture.
// Annuler plutôt que supprimer : delete exige --confirm.
import { parseArgs } from 'node:util';
import { load, save } from '../src/sources/ops-tasks-json.mjs';
import { applyOp } from '../src/core/ops.mjs';
import { loadConfig, DEFAULT_CONFIG, localToday } from '../src/lib/config.mjs';

const fail = (msg) => { console.error(`proof-triage : ${msg}`); process.exit(2); };
const USAGE = 'usage : task add|close|cancel|reschedule|reassign|delete <id> [--note …] [--due AAAA-MM-JJ] [--owner claude|user] [--title …] [--confirm]';
const KINDS = ['add', 'close', 'cancel', 'reschedule', 'reassign', 'delete'];

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', default: DEFAULT_CONFIG },
      registry: { type: 'string' },
      today: { type: 'string', default: localToday() },
      note: { type: 'string' },
      due: { type: 'string' },
      title: { type: 'string' },
      owner: { type: 'string' },
      priority: { type: 'string' },
      source: { type: 'string' },
      notes: { type: 'string' },
      tags: { type: 'string' },
      recurrence: { type: 'string' },
      confirm: { type: 'boolean', default: false },
    },
  });
} catch (e) {
  fail(`${e.message}\n${USAGE}`);
}
const { values: o, positionals: [kind, id] } = parsed;
if (!KINDS.includes(kind) || !id) fail(USAGE);
if (!/^\d{4}-\d{2}-\d{2}$/.test(o.today)) fail(`--today attend AAAA-MM-JJ, reçu « ${o.today} »`);

let conf;
try { conf = loadConfig(o.config, o.registry); } catch (e) { fail(e.message); }
const reg = load(conf.registry);
const op = { kind, id, note: o.note, due: o.due, title: o.title, owner: o.owner, priority: o.priority, source: o.source, notes: o.notes, confirm: o.confirm, recurrence: o.recurrence,
  tags: o.tags?.split(',').map((t) => t.trim()).filter(Boolean) };
try {
  const next = applyOp(reg.doc, op, { today: o.today });
  const r = save(conf.registry, next, { expectHash: reg.hash, backupDir: conf.outDir('backup', o.today) });
  console.log(`✓ ${kind} ${id} · sauvegarde : ${r.backup}`);
  const pruned = conf.pruneBackups(o.today);
  if (pruned.length) console.log(`${pruned.length} sauvegarde(s) de plus de 30 j retirée(s)`);
} catch (e) {
  fail(e.message);
}
