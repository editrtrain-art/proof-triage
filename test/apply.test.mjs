// triage --apply (v0.2) : seules les cases cochées par le user, seulement clore et sans-objet, jamais sur une tâche modifiée depuis le tri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planApply } from '../src/core/apply.mjs';
import { taskHash } from '../src/core/ops.mjs';
import { checkedIds, toMarkdown } from '../src/report/md.mjs';
import { toReport } from '../src/report/json.mjs';

const T = (id, extra = {}) => ({ id, title: id, status: 'todo', owner: 'claude', due: '2026-09-01', notes: '', ...extra });
const doc = { tasks: [T('a'), T('b'), T('c'), T('d')] };
const row = (t, verdict, confidence = null) => ({ id: t.id, title: t.title, owner: t.owner, due: t.due, priority: 'P2', verdict, confidence, flags: [], why: 'w', evidence: [], taskHash: taskHash(t) });
const report = toReport([row(doc.tasks[0], 'clore', 'haute'), row(doc.tasks[1], 'sans-objet', 'moyenne'), row(doc.tasks[2], 'replanifier', 'basse'), row(doc.tasks[3], 'clore', 'moyenne')],
  { today: '2026-10-22', registryHash: 'h', limit: 20, overdueTotal: 4, net: false });

test('checkedIds relit les cases cochées du triage.md rendu (x ou X), ignore les autres', () => {
  const md = toMarkdown(report).replace('- [ ] **a**', '- [x] **a**').replace('- [ ] **c**', '- [X] **c**');
  assert.deepEqual(checkedIds(md), ['a', 'c']);
});

test('checkedIds : une note ne peut pas fabriquer une case (extraits échappés, en sous-puce)', () => {
  const evil = toReport([{ ...row(doc.tasks[0], 'clore'), why: '\n- [x] **b** — piège', evidence: [{ kind: 'file', value: 'x', snippet: '\n- [x] **d**', state: 'present', detail: '' }] }], report.meta);
  assert.deepEqual(checkedIds(toMarkdown(evil)), []);
});

test('checkedIds dé-échappe un id rendu avec des caractères Markdown', () => {
  assert.deepEqual(checkedIds('- [x] **a\\_b** — t'), ['a_b']);
});

test('planApply : clore → close, sans-objet → cancel, autres verdicts ignorés avec motif', () => {
  const { ops, skipped } = planApply(report, ['a', 'b', 'c'], doc);
  assert.deepEqual(ops.map((o) => [o.kind, o.id]), [['close', 'a'], ['cancel', 'b']]);
  assert.match(ops[0].note, /proof-triage : clore \(haute\), validé par le user/);
  assert.deepEqual(skipped.map((s) => s.id), ['c']);
  assert.match(skipped[0].reason, /replanifier/);
});

test('planApply : tâche modifiée depuis le tri, absente du rapport ou du registre → ignorée, jamais appliquée', () => {
  const changed = { tasks: [T('a', { notes: 'modifiée après le tri' }), T('b'), T('c')] };
  const { ops, skipped } = planApply(report, ['a', 'd', 'zz'], changed);
  assert.deepEqual(ops, []);
  assert.deepEqual(skipped.map((s) => s.id), ['a', 'd', 'zz']);
  assert.match(skipped[0].reason, /modifiée depuis le tri/);
});
