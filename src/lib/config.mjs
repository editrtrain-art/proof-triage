// Config locale partagée par les CLI : proof-triage.config.json (ignoré par git). Aucun chemin machine dans le code.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditName, slug } from './audit-name.mjs';

export const DEFAULT_CONFIG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'proof-triage.config.json');
export const localToday = () => new Date().toLocaleDateString('sv-SE');
const minusDays = (iso, n) => new Date(Date.parse(iso) - n * 86400000).toISOString().slice(0, 10);

export function loadConfig(configPath, registryOpt) {
  if (!existsSync(configPath)) throw new Error(`config introuvable (${configPath}) : copier proof-triage.config.example.json en proof-triage.config.json et l'adapter.`);
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  const root = resolve(dirname(configPath), cfg.root);
  const registry = registryOpt ? resolve(registryOpt) : resolve(root, cfg.registry);
  const target = slug(basename(registry, extname(registry)));
  // AUDIT_DIR remplace la racine des sorties (tests) ; le nom suit <outil>-<cible>-<fenetre>-<date>.
  const outRoot = process.env.AUDIT_DIR || resolve(root, cfg.outDir || 'AUDIT');
  const outDir = (window, date) => join(outRoot, auditName({ tool: 'proof-triage', target, window, date }));
  // Rétention des sauvegardes du registre : seuls les dossiers proof-triage-<registre>-backup-<AAAA-MM-JJ> plus vieux
  // que backupKeepDays (30 par défaut) sont retirés ; aucun autre dossier n'est jamais touché.
  const prefix = `proof-triage-${target}-backup-`;
  const pruneBackups = (today, keepDays = cfg.backupKeepDays ?? 30) => {
    if (!existsSync(outRoot)) return [];
    const limit = minusDays(today, keepDays);
    return readdirSync(outRoot)
      .filter((d) => d.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(d.slice(prefix.length)) && d.slice(prefix.length) < limit)
      .map((d) => { rmSync(join(outRoot, d), { recursive: true, force: true }); return d; });
  };
  return { cfg, root, registry, outDir, pruneBackups };
}
