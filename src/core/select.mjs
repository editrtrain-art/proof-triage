// Sélection des tâches en retard. PUR.
export const OPEN_STATUSES = ['todo', 'doing', 'open'];

export function selectOverdue(tasks, { today, limit = Infinity, statuses = OPEN_STATUSES }) {
  return tasks
    .filter((t) => statuses.includes(t.status) && t.due && t.due < today)
    .sort((a, b) => a.due.localeCompare(b.due) || String(a.priority).localeCompare(String(b.priority)))
    .slice(0, limit);
}
