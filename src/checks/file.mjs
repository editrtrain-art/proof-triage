// Contrôle d'existence d'un chemin cité dans une note (entrée NON FIABLE).
// Refus avant tout accès disque : absolu, lecteur, UNC, « .. », segment refusé (.secrets par défaut).
// Puis chemin canonique (liens et jonctions résolus) qui doit rester sous la racine. Jamais de lecture du contenu.
import { existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

export function checkFile(p, { root, refuseSegments = ['.secrets'] }) {
  const s = String(p);
  const deny = refuseSegments.map((r) => r.toLowerCase());
  const bad = (segs) => segs.some((x) => x === '..' || deny.includes(x.toLowerCase()));
  if (/^(?:[A-Za-z]:|[\\/])/.test(s) || isAbsolute(s) || bad(s.split(/[\\/]/))) return { state: 'refused' };

  const full = resolve(root, s);
  if (!existsSync(full)) return { state: 'absent' };
  const real = relative(realpathSync.native(root), realpathSync.native(full));
  if (real === '..' || real.startsWith(`..${sep}`) || isAbsolute(real) || bad(real.split(sep))) return { state: 'refused' };
  return { state: 'present', real: real.split(sep).join('/') };
}
