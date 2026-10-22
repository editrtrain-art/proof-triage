// Vue triage.md, lisible en 5 minutes. Tout texte venu du registre passe par esc().
const ORDER = ['clore', 'sans-objet', 'bloquée-user', 'à-vérifier', 'replanifier'];
const CONF = { haute: 0, moyenne: 1, basse: 2 };
const KIND = { file: 'fichier', commit: 'commit', url: 'url', blocker: 'blocage', obsolete: 'sans-objet', condition: 'condition', link: 'tâche citée' };

/** Une ligne, Markdown et HTML neutralisés. */
export const esc = (s) => String(s ?? '').replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\\`*_{}[\]()<>#+!|~]/g, '\\$&');

/** Ids des cases cochées par le user. Seule une ligne de tâche (en tête de ligne) compte ; les extraits de notes sont en sous-puce et échappés. */
export const checkedIds = (md) => [...md.matchAll(/^- \[[xX]\] \*\*((?:\\.|[^*\\])+)\*\*/gm)].map((m) => m[1].replace(/\\(.)/g, '$1'));

const rank = (r) => [ORDER.indexOf(r.verdict) === -1 ? ORDER.length : ORDER.indexOf(r.verdict), CONF[r.confidence] ?? 3];
const byRank = (a, b) => { const [x, y] = [rank(a), rank(b)]; return x[0] - y[0] || x[1] - y[1]; };

export function toMarkdown({ meta, rows }) {
  const out = [
    `# Tri sur preuves — ${meta.today}`,
    '',
    `${rows.length} tâches triées sur ${meta.overdueTotal} en retard · registre \`${String(meta.registryHash).slice(0, 12)}\` · réseau : ${meta.net ? 'activé' : 'coupé'}`,
    '',
    ORDER.filter((v) => meta.counts[v]).map((v) => `${v} : ${meta.counts[v]}`).join(' · '),
    '',
    ...(Object.keys(meta.suggestions || {}).length ? [`suggestions : ${Object.entries(meta.suggestions).map(([k, n]) => `${k} ${n}`).join(' · ')} (à faire avec bin/task.mjs, jamais par --apply)`, ''] : []),
    'Le tri n\'a rien écrit dans le registre. Cocher `[x]` une ligne valide sa décision ; `triage --apply <ce dossier>` n\'applique ensuite que clore (→ done) et sans-objet (→ cancelled), après sauvegarde, et jamais sur une tâche modifiée depuis le tri.',
  ];
  let current;
  for (const r of [...rows].sort(byRank)) {
    if (r.verdict !== current) out.push('', `## ${r.verdict} (${meta.counts[r.verdict]})`, '');
    current = r.verdict;
    const flags = r.flags.length ? ` · ${r.flags.join(', ')}` : '';
    out.push(`- [ ] **${esc(r.id)}** — ${esc(r.title)} (${esc(r.owner)}, échéance ${esc(r.due)}, ${esc(r.priority)}) · confiance ${r.confidence ?? '—'}${flags}`);
    out.push(`  - ${esc(r.why)}`);
    if (r.suggestion) out.push(`  - suggestion : ${r.suggestion.kind}${r.suggestion.id ? ` ${esc(r.suggestion.id)}` : ''} · ${esc(r.suggestion.why)}`);
    for (const e of r.evidence) {
      const detail = e.detail ? ` (${esc(e.detail)})` : '';
      out.push(`  - ${KIND[e.kind] || e.kind} ${esc(e.value ?? 'sans date')}${detail} → **${esc(e.state)}** · « ${esc(e.snippet)} »`);
    }
  }
  return out.join('\n') + '\n';
}
