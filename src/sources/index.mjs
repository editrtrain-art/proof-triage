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

// Le format de la config ne vaut que pour LE registre de la config ; --format l'emporte toujours.
export const resolveFormat = ({ forced, configFormat, fromConfig }) => forced || (fromConfig ? configFormat : undefined);

/** Format d'un registre qu'on va ÉCRIRE : seul un adaptateur qui sait écrire (save) est accepté, et le fichier doit l'être vraiment. */
export function writableFormat(path, forced) {
  let detected;
  try { detected = detectFormat(path); } catch (e) { throw new Error(`registre illisible : ${e.message}`); }
  const fmt = forced || detected;
  if (!ADAPTERS[fmt]) throw new Error(`format inconnu : ${fmt}`);
  if (fmt !== detected) throw new Error(`registre illisible au format ${fmt} (le fichier est au format ${detected})`);
  if (!ADAPTERS[fmt].save) throw new Error(`écriture : format ${fmt} en lecture seule (seul ops-tasks-json s'écrit)`);
  return fmt;
}

export function loadRegistry(path, format = detectFormat(path)) {
  const adapter = ADAPTERS[format];
  if (!adapter) throw new Error(`format inconnu : ${format} (connus : ${Object.keys(ADAPTERS).join(', ')})`);
  const r = adapter.load(path);
  return { ...r, meta: { ...r.meta, format } };
}
