// Le SHA cité est-il un commit d'un des dépôts configurés, et touche-t-il les chemins cités ?
// SHA validé par regex AVANT tout appel ; git par execFile sans shell, arguments fixes, env purgé des GIT_*,
// et GIT_CEILING_DIRECTORIES pour qu'un dossier non-dépôt ne remonte pas vers un dépôt parent.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';

const run = promisify(execFile);
const SHA_RE = /^[0-9a-f]{7,40}$/;

async function git(dir, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  env.GIT_CEILING_DIRECTORIES = dirname(dir);
  const { stdout } = await run('git', ['-C', dir, '-c', 'core.quotePath=false', ...args], { shell: false, env, timeout: 10000, windowsHide: true });
  return stdout;
}

// shortcut: un commit de fusion ne liste aucun fichier avec show --name-only ; il donne « found » sans touches. Améliorer si un SHA de fusion apparaît au tri.
export async function checkCommit(sha, { root, repos = [], paths = [] }) {
  if (!SHA_RE.test(String(sha))) return { state: 'refused', touches: [] };
  for (const repo of repos) {
    const dir = resolve(root, repo);
    try {
      if ((await git(dir, ['cat-file', '-t', sha])).trim() !== 'commit') continue;
      const files = (await git(dir, ['show', '--name-only', '--format=', sha])).split('\n').map((f) => f.trim()).filter(Boolean);
      const touches = paths.filter((p) => files.includes(p) || files.some((f) => `${repo}/${f}` === p));
      return { state: 'found', repo, touches };
    } catch {
      // pas un dépôt, SHA inconnu ou ambigu ici : dépôt suivant
    }
  }
  return { state: 'absent', touches: [] };
}
