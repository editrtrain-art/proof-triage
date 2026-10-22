// Config locale partagée par les CLI : proof-triage.config.json (ignoré par git). Aucun chemin machine dans le code.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditName, slug } from './audit-name.mjs';

export const DEFAULT_CONFIG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'proof-triage.config.json');
export const localToday = () => new Date().toLocaleDateString('sv-SE');

export function loadConfig(configPath, registryOpt) {
  if (!existsSync(configPath)) throw new Error(`config introuvable (${configPath}) : copier proof-triage.config.example.json en proof-triage.config.json et l'adapter.`);
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  const root = resolve(dirname(configPath), cfg.root);
  const registry = registryOpt ? resolve(registryOpt) : resolve(root, cfg.registry);
  const target = slug(basename(registry, '.json'));
  // AUDIT_DIR remplace la racine des sorties (tests) ; le nom suit <outil>-<cible>-<fenetre>-<date>.
  const outRoot = process.env.AUDIT_DIR || resolve(root, cfg.outDir || 'AUDIT');
  const outDir = (window, date) => join(outRoot, auditName({ tool: 'proof-triage', target, window, date }));
  return { cfg, root, registry, outDir };
}
