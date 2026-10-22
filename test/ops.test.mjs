import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp, validate, taskHash } from '../src/core/ops.mjs';

const TODAY = '2026-10-22';
const doc = () => ({
  schemaVersion: 1,
  tasks: [
    { id: 'a', title: 'A', due: '2026-09-01', owner: 'claude', status: 'todo', priority: 'P2', tags: [], notes: 'Début.', doneDate: null },
    { id: 'b', title: 'B', due: '2026-09-02', owner: 'user', status: 'done', priority: 'P1', tags: [], notes: '', doneDate: '2026-09-03' },
  ],
});
const task = (d, id) => d.tasks.find((t) => t.id === id);

test('close : done + doneDate du jour, note ajoutée au format « · JJ/MM : … », original intact', () => {
  const d0 = doc();
  const d = applyOp(d0, { kind: 'close', id: 'a', note: 'livré, preuve vue' }, { today: TODAY });
  assert.deepEqual([task(d, 'a').status, task(d, 'a').doneDate], ['done', TODAY]);
  assert.equal(task(d, 'a').notes, 'Début. · 22/10 : livré, preuve vue');
  assert.equal(task(d0, 'a').status, 'todo');
});

test('cancel : cancelled + doneDate (convention du registre), annuler plutôt que supprimer', () => {
  const d = applyOp(doc(), { kind: 'cancel', id: 'a', note: 'sans objet' }, { today: TODAY });
  assert.deepEqual([task(d, 'a').status, task(d, 'a').doneDate], ['cancelled', TODAY]);
  assert.equal(d.tasks.length, 2);
});

test('close ou cancel d\'une tâche déjà close → erreur', () => {
  assert.throws(() => applyOp(doc(), { kind: 'close', id: 'b' }, { today: TODAY }), /déjà/);
  assert.throws(() => applyOp(doc(), { kind: 'cancel', id: 'b' }, { today: TODAY }), /déjà/);
});

test('reschedule : nouvelle échéance ISO, statut inchangé, note ajoutée', () => {
  const d = applyOp(doc(), { kind: 'reschedule', id: 'a', due: '2026-11-05', note: 'replanifiée' }, { today: TODAY });
  assert.deepEqual([task(d, 'a').due, task(d, 'a').status], ['2026-11-05', 'todo']);
  assert.match(task(d, 'a').notes, /22\/10 : replanifiée/);
  assert.throws(() => applyOp(doc(), { kind: 'reschedule', id: 'a', due: '05/11/2026' }, { today: TODAY }), /AAAA-MM-JJ/);
});

test('add : tâche todo complète, id unique exigé, champs obligatoires', () => {
  const d = applyOp(doc(), { kind: 'add', id: 'c', title: 'C', due: '2026-11-01', owner: 'claude', priority: 'P2', notes: 'n', source: 's', tags: ['x'] }, { today: TODAY });
  assert.deepEqual(task(d, 'c'), { id: 'c', title: 'C', due: '2026-11-01', owner: 'claude', status: 'todo', priority: 'P2', source: 's', tags: ['x'], notes: 'n', doneDate: null });
  assert.throws(() => applyOp(doc(), { kind: 'add', id: 'a', title: 'A2', due: '2026-11-01', owner: 'claude' }, { today: TODAY }), /existe/);
  assert.throws(() => applyOp(doc(), { kind: 'add', id: 'd', due: '2026-11-01', owner: 'claude' }, { today: TODAY }), /title/);
  assert.throws(() => applyOp(doc(), { kind: 'add', id: 'd', title: 'D', due: '2026-11-01', owner: 'robot' }, { today: TODAY }), /owner/);
});

test('delete : refusé sans confirm, retire la tâche avec confirm', () => {
  assert.throws(() => applyOp(doc(), { kind: 'delete', id: 'a' }, { today: TODAY }), /confirm/);
  assert.equal(applyOp(doc(), { kind: 'delete', id: 'a', confirm: true }, { today: TODAY }).tasks.length, 1);
});

test('id inconnu ou opération inconnue → erreur', () => {
  assert.throws(() => applyOp(doc(), { kind: 'close', id: 'zz' }, { today: TODAY }), /inconnue/);
  assert.throws(() => applyOp(doc(), { kind: 'purge', id: 'a' }, { today: TODAY }), /opération/);
});

test('validate : statut inconnu, done sans doneDate, id en double, échéance non ISO', () => {
  assert.deepEqual(validate(doc()), []);
  const d = doc();
  d.tasks.push({ id: 'a', title: 'dup', status: 'todo' });
  d.tasks.push({ id: 'x', title: 'X', status: 'fini' });
  d.tasks.push({ id: 'y', title: 'Y', status: 'done', doneDate: null });
  d.tasks.push({ id: 'z', title: 'Z', status: 'todo', due: '22/10' });
  const errs = validate(d).join('\n');
  for (const m of [/id en double : a/, /x : statut/, /y : doneDate/, /z : due/]) assert.match(errs, m);
});

test('taskHash : stable, change dès qu\'un champ change', () => {
  const t = doc().tasks[0];
  assert.equal(taskHash(t), taskHash({ ...t }));
  assert.notEqual(taskHash(t), taskHash({ ...t, notes: 'autre' }));
});
