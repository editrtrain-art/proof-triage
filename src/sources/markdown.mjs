// Adaptateur Markdown (v0.3), LECTURE SEULE. Une tâche par case en tête de ligne :
//   - [ ] Titre [due:AAAA-MM-JJ] [owner:claude|user] [prio:P1] [id:mon-id]
//     lignes indentées = notes de la tâche (une ligne vide ne les coupe pas ; une ligne non indentée, si)
// « - [x] » = done. Un [id:] explicite l'emporte ; sinon l'id est le titre en minuscules sans accents
// (suffixe -2, -3 en cas de doublon), ou « tache-<rang> » si le titre n'a aucune lettre latine.
import { readFileSync } from 'node:fs';
import { registry } from './normalize.mjs';

const TASK = /^[-*] \[([ xX])\] (.+)$/;
const META = /\s*\[(due|owner|prio|id):([^\]]+)\]/g;
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function load(path) {
  const raw = readFileSync(path);
  const tasks = [];
  let current = null;
  for (const line of raw.toString('utf8').split(/\r?\n/)) {
    const m = line.match(TASK);
    if (m) {
      const meta = Object.fromEntries([...m[2].matchAll(META)].map((x) => [x[1], x[2].trim()]));
      current = { explicitId: meta.id, title: m[2].replace(META, '').trim(), status: m[1] === ' ' ? 'todo' : 'done', due: meta.due, owner: meta.owner, priority: meta.prio, notes: '' };
      tasks.push(current);
    } else if (current && /^(\s{2,}|\t)\S/.test(line)) {
      current.notes += (current.notes ? '\n' : '') + line.trim();
    } else if (line.trim()) {
      current = null;
    }
  }
  // Ids : les explicites d'abord, puis les déduits, sans jamais prendre un id déjà pris.
  const taken = new Set(tasks.map((t) => t.explicitId).filter(Boolean));
  tasks.forEach((t, i) => {
    if (t.explicitId) return;
    const base = slugify(t.title) || `tache-${i + 1}`;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    t.explicitId = id;
  });
  return registry(raw, 'markdown', tasks.map(({ explicitId, ...t }) => ({ id: explicitId, ...t })));
}
