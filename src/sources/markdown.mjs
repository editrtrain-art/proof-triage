// Adaptateur Markdown (v0.3), LECTURE SEULE. Une tâche par case en tête de ligne :
//   - [ ] Titre [due:AAAA-MM-JJ] [owner:claude|user] [prio:P1] [id:mon-id]
//     lignes indentées = notes de la tâche
// « - [x] » = done. Sans [id:], l'id est le titre en minuscules sans accents (suffixe -2, -3 en cas de doublon).
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
      const title = m[2].replace(META, '').trim();
      let id = meta.id || slugify(title);
      for (let n = 2; tasks.some((t) => t.id === id); n++) id = `${meta.id || slugify(title)}-${n}`;
      current = { id, title, status: m[1] === ' ' ? 'todo' : 'done', due: meta.due, owner: meta.owner, priority: meta.prio, notes: '' };
      tasks.push(current);
    } else if (current && /^(\s{2,}|\t)\S/.test(line)) {
      current.notes += (current.notes ? '\n' : '') + line.trim();
    } else {
      current = null;
    }
  }
  return registry(raw, 'markdown', tasks);
}
