// Orchestration du tri, partagée par le CLI et la démo : affirmations → contrôles → verdict, une tâche à la fois.
// Les contrôles touchent le disque, git et (avec net) le réseau ; la décision reste dans core/verdict.mjs.
import { claims } from './core/extract.mjs';
import { decide } from './core/verdict.mjs';
import { taskHash } from './core/ops.mjs';
import { checkFile } from './checks/file.mjs';
import { checkCommit } from './checks/commit.mjs';
import { checkUrl } from './checks/url.mjs';

/**
 * tasks : tâches normalisées à trier ; reg : registre chargé (byId, doc éventuel) ;
 * ctx : {root, repos, refuseSegments, today, net, simulate: [{map, state}]}.
 */
export async function triageTasks(tasks, reg, { root, repos = [], refuseSegments, today, net = false, simulate = [] }) {
  // Empreinte par tâche sur sa forme brute (registre JSON) ou normalisée (autres formats, qui ne s'écrivent pas).
  const rawById = new Map((reg.doc?.tasks || reg.tasks).map((t) => [t.id, t]));
  const rows = [];
  for (const t of tasks) {
    const c = claims(t);
    const results = { files: {}, commits: {}, urls: {} };
    const cited = c.paths.filter((p) => p.role !== 'context').map((p) => p.value);
    for (const s of c.shas) results.commits[s.value] = await checkCommit(s.value, { root, repos, paths: cited });
    // Un chemin absent à la racine est cherché dans le dépôt d'un commit trouvé qui le touche (et seulement là).
    const under = (p) => Object.values(results.commits).filter((r) => r.state === 'found' && r.repo !== '.' && r.touches.includes(p)).map((r) => r.repo);
    for (const p of c.paths) results.files[p.value] = checkFile(p.value, { root, refuseSegments, under: under(p.value) });
    if (net) for (const u of c.urls) results.urls[u.value] = await checkUrl(u.value);
    for (const { map, state } of simulate) {
      const keys = { files: c.paths, commits: c.shas, urls: c.urls }[map];
      for (const k of keys) results[map][k.value] = { state, touches: [] };
    }
    const v = decide(t, c, results, { today, byId: reg.byId });
    // taskHash : empreinte de la tâche brute, pour que --apply refuse une décision prise sur une version périmée.
    rows.push({ id: t.id, title: t.title, owner: t.owner, due: t.due, priority: t.priority, status: t.status, taskHash: taskHash(rawById.get(t.id)), ...v });
  }
  return rows;
}
