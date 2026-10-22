// Opérations sur le registre (v0.2). PUR : un document entre, un NOUVEAU document sort ; aucune écriture ici
// (l'écriture, la sauvegarde et le contrôle de concurrence sont dans src/sources/ops-tasks-json.mjs).
// Annuler plutôt que supprimer : delete exige confirm.
import { createHash } from 'node:crypto';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const STATUSES = ['todo', 'doing', 'open', 'parked', 'done', 'cancelled'];
const OWNERS = ['claude', 'user'];
const CLOSED = ['done', 'cancelled'];

/** Empreinte d'une tâche telle qu'elle est dans le fichier : sert à refuser une décision prise sur une version périmée. */
export const taskHash = (t) => createHash('sha256').update(JSON.stringify(t)).digest('hex');

const stamp = (today) => `${today.slice(8, 10)}/${today.slice(5, 7)}`;
const withNote = (notes, note, today) => (!note ? notes : notes ? `${notes} · ${stamp(today)} : ${note}` : `${stamp(today)} : ${note}`);

export function applyOp(doc, op, { today }) {
  const d = structuredClone(doc);
  const i = d.tasks.findIndex((t) => t.id === op.id);
  if (op.kind === 'add') {
    if (i !== -1) throw new Error(`la tâche ${op.id} existe déjà`);
    for (const k of ['id', 'title']) if (!op[k]) throw new Error(`add : ${k} manquant`);
    if (!ISO.test(op.due || '')) throw new Error('add : due attendu en AAAA-MM-JJ');
    if (!OWNERS.includes(op.owner)) throw new Error(`add : owner attendu ${OWNERS.join('|')}`);
    d.tasks.push({ id: op.id, title: op.title, due: op.due, owner: op.owner, status: 'todo', priority: op.priority || 'P2', source: op.source || '', tags: op.tags || [], notes: op.notes || '', doneDate: null });
    return d;
  }
  if (i === -1) throw new Error(`tâche inconnue : ${op.id}`);
  const t = d.tasks[i];
  switch (op.kind) {
    case 'close':
    case 'cancel':
      if (CLOSED.includes(t.status)) throw new Error(`${op.id} est déjà ${t.status}`);
      t.status = op.kind === 'close' ? 'done' : 'cancelled';
      t.doneDate = today;
      t.notes = withNote(t.notes || '', op.note, today);
      return d;
    case 'reschedule':
      if (!ISO.test(op.due || '')) throw new Error('reschedule : due attendu en AAAA-MM-JJ');
      t.due = op.due;
      t.notes = withNote(t.notes || '', op.note, today);
      return d;
    case 'delete':
      if (!op.confirm) throw new Error('delete exige confirm (préférer cancel)');
      d.tasks.splice(i, 1);
      return d;
    default:
      throw new Error(`opération inconnue : ${op.kind}`);
  }
}

/** Contrôle minimal du schéma avant toute écriture. Une liste vide = valide. */
export function validate(doc) {
  const errs = [];
  if (!Array.isArray(doc?.tasks)) return ['tasks absent'];
  const seen = new Set();
  for (const t of doc.tasks) {
    if (seen.has(t.id)) errs.push(`id en double : ${t.id}`);
    seen.add(t.id);
    if (!STATUSES.includes(t.status)) errs.push(`${t.id} : statut « ${t.status} » inconnu`);
    if (t.status === 'done' && !ISO.test(t.doneDate || '')) errs.push(`${t.id} : doneDate manquante pour une tâche done`);
    if (t.due && !ISO.test(t.due)) errs.push(`${t.id} : due « ${t.due} » hors AAAA-MM-JJ`);
  }
  return errs;
}
