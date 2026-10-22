// Adaptateur GitHub Issues (v0.3), LECTURE SEULE, sur un EXPORT local (aucun appel réseau, aucun jeton) :
//   gh issue list --state all --limit 1000 --json number,title,state,body,milestone,labels,assignees > issues.json
// Jalon (dueOn) = échéance ; étiquette P0-P4 = priorité ; étiquette owner:claude|owner:user = propriétaire (user par défaut) ;
// corps = notes ; OPEN = todo, CLOSED = done.
import { readFileSync } from 'node:fs';
import { registry } from './normalize.mjs';

export function load(path) {
  const raw = readFileSync(path);
  const issues = JSON.parse(raw.toString('utf8'));
  const tasks = issues.map((i) => {
    const labels = (i.labels || []).map((l) => l.name);
    return {
      id: `issue-${i.number}`,
      title: i.title,
      status: String(i.state).toUpperCase() === 'OPEN' ? 'todo' : 'done',
      due: i.milestone?.dueOn ? String(i.milestone.dueOn).slice(0, 10) : undefined,
      owner: labels.includes('owner:claude') ? 'claude' : 'user',
      priority: labels.find((l) => /^P[0-4]$/.test(l)),
      tags: labels,
      notes: i.body || '',
    };
  });
  return registry(raw, 'github-issues', tasks);
}
