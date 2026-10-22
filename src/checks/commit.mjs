// Le SHA cité est-il un commit d'un des dépôts configurés, et touche-t-il les chemins cités ?
// SHA validé par regex AVANT tout appel ; git par execFile sans shell, arguments fixes, env purgé des GIT_*,
// et GIT_CEILING_DIRECTORIES pour qu'un dossier non-dépôt ne remonte pas vers un dépôt parent.
// Une panne d'environnement (git absent, délai, aucun dépôt utilisable) donne « error », JAMAIS « absent » :
// « absent » déclenche une contradiction, il doit rester une preuve contre la tâche, pas contre le poste.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';

const run = promisify(execFile);
const SHA_RE = /^[0-9a-f]{7,40}$/;
// La cause d'une erreur est gardée (code, signal, délai, 1re ligne de stderr) : sans elle, une panne passe pour un mystère.
const cause = (e) => (e.killed ? 'délai dépassé' : `${e.code ?? ''}${e.signal ? ` ${e.signal}` : ''} ${String(e.stderr || e.message || '').trim().split('\n')[0]}`.trim());
const error = (reason) => ({ state: 'error', touches: [], reason });

async function git(dir, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  env.GIT_CEILING_DIRECTORIES = dirname(dir);
  // fsmonitor coupé : aucun programme externe lancé par git ; maxBuffer large : un gros commit ne doit pas passer pour « absent ».
  const { stdout } = await run('git', ['-C', dir, '-c', 'core.quotePath=false', '-c', 'core.fsmonitor=false', ...args],
    { shell: false, env, timeout: 10000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

// shortcut: un commit de fusion ne liste aucun fichier avec show --name-only ; il donne « found » sans touches. Améliorer si un SHA de fusion apparaît au tri.
export async function checkCommit(sha, { root, repos = [], paths = [] }) {
  if (!SHA_RE.test(String(sha))) return { state: 'refused', touches: [] };
  let usable = 0;
  const unusable = [];
  for (const raw of repos) {
    const repo = String(raw).replace(/\\/g, '/').replace(/^(?:\.\/)+|\/+$/g, '') || '.';
    const dir = resolve(root, repo);
    try { await git(dir, ['rev-parse', '--git-dir']); } catch (e) { unusable.push(`${repo} : ${cause(e)}`); continue; }
    usable++;
    let type;
    try {
      type = (await git(dir, ['cat-file', '-t', sha])).trim();
    } catch (e) {
      if (typeof e.code === 'number' && !e.killed) continue; // git a répondu : objet inconnu ou ambigu dans ce dépôt
      return error(`${repo} cat-file : ${cause(e)}`);
    }
    if (type !== 'commit') continue;
    let files;
    try { files = (await git(dir, ['show', '--name-only', '--format=', sha])).split('\n').map((f) => f.trim()).filter(Boolean); } catch (e) { return error(`${repo} show : ${cause(e)}`); }
    const touches = paths.filter((p) => files.includes(p) || files.some((f) => `${repo}/${f}` === p));
    return { state: 'found', repo, touches };
  }
  return usable ? { state: 'absent', touches: [] } : error(`aucun dépôt utilisable (${unusable.join(' ; ')})`);
}
