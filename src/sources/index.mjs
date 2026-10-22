// Choix de l'adaptateur de registre : forcé (--format, config « format ») ou déduit du fichier.
// Ajouter un format = ajouter un fichier ici, sans toucher à core/.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import * as opsTasksJson from './ops-tasks-json.mjs';
import * as markdown from './markdown.mjs';
import * as githubIssues from './github-issues.mjs';

export const ADAPTERS = { 'ops-tasks-json': opsTasksJson, markdown, 'github-issues': githubIssues };

export function detectFormat(path) {
  if (['.md', '.markdown'].includes(extname(path).toLowerCase())) return 'markdown';
  const j = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(j)) return 'github-issues';
  if (Array.isArray(j?.tasks)) return 'ops-tasks-json';
  throw new Error(`format de registre non reconnu : ${path}`);
}

export function loadRegistry(path, format = detectFormat(path)) {
  const adapter = ADAPTERS[format];
  if (!adapter) throw new Error(`format inconnu : ${format} (connus : ${Object.keys(ADAPTERS).join(', ')})`);
  const r = adapter.load(path);
  return { ...r, meta: { ...r.meta, format } };
}
