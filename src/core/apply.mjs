// Plan d'application des décisions cochées par le user (v0.2). PUR.
// Seuls clore → close et sans-objet → cancel sont automatiques ; une tâche modifiée depuis le tri n'est jamais touchée
// (sa décision portait sur une autre version). Les autres verdicts passent par la commande task.
import { taskHash } from './ops.mjs';

const ACTION = { clore: 'close', 'sans-objet': 'cancel' };

export function planApply(report, ids, doc) {
  const ops = [];
  const skipped = [];
  for (const id of ids) {
    const row = report.rows.find((r) => r.id === id);
    const task = doc.tasks.find((t) => t.id === id);
    if (!row) skipped.push({ id, reason: 'absente du rapport' });
    else if (!ACTION[row.verdict]) skipped.push({ id, reason: `verdict ${row.verdict} : aucune action automatique (utiliser bin/task.mjs)` });
    else if (!task) skipped.push({ id, reason: 'absente du registre' });
    else if (taskHash(task) !== row.taskHash) skipped.push({ id, reason: 'modifiée depuis le tri : relancer le tri' });
    else ops.push({ kind: ACTION[row.verdict], id, note: `proof-triage : ${row.verdict}${row.confidence ? ` (${row.confidence})` : ''}, validé par le user` });
  }
  return { ops, skipped };
}
