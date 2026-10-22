// Table de verdicts §4 d'ARCHITECTURE.md, évaluée dans l'ordre. PUR et déterministe : aucun LLM ne décide.
// results = { files: {chemin: {state}}, commits: {sha: {state, repo, touches}}, urls: {url: {state, status}} } ;
// une affirmation sans résultat est « unchecked » et ne prouve jamais rien.
const get = (map, k) => map?.[k] || { state: 'unchecked' };
const quote = (s) => `« ${s} »`;

export function decide(task, claimsIn, results, { today, byId = new Map() }) {
  const file = (v) => get(results.files, v);
  const commit = (v) => get(results.commits, v);
  const url = (v) => get(results.urls, v);
  // Un « hex » (hexa sans le mot commit) introuvable n'était pas un commit : on l'oublie.
  const c = { ...claimsIn, shas: claimsIn.shas.filter((s) => s.role === 'commit' || commit(s.value).state === 'found') };

  const evidence = [
    ...c.paths.map((p) => ({ kind: 'file', value: p.value, snippet: p.snippet, state: file(p.value).state, detail: p.role })),
    ...c.shas.map((s) => {
      const r = commit(s.value);
      return { kind: 'commit', value: s.value, snippet: s.snippet, state: r.state, detail: r.repo ? `${r.repo} ; touche : ${r.touches?.join(', ') || 'aucun livrable cité'}` : '' };
    }),
    ...c.urls.map((u) => ({ kind: 'url', value: u.value, snippet: u.snippet, state: url(u.value).state, detail: url(u.value).status ? `HTTP ${url(u.value).status}` : '' })),
    ...c.blockers.map((b) => ({ kind: 'blocker', value: b.value, snippet: b.snippet, state: 'cité', detail: '' })),
    ...c.obsolete.map((o) => ({ kind: 'obsolete', value: o.value, snippet: o.snippet, state: 'cité', detail: '' })),
    ...c.dateConditions.filter((d) => d.value).map((d) => ({ kind: 'condition', value: d.value, snippet: d.snippet, state: d.value < today ? 'échue' : 'à-venir', detail: d.role })),
    ...c.links.filter((l) => byId.has(l.value)).map((l) => ({ kind: 'link', value: l.value, snippet: l.snippet, state: byId.get(l.value).status, detail: '' })),
  ];

  const flags = [];
  if (task.recurrence) flags.push('récurrente');
  if (evidence.some((e) => e.kind === 'condition' && e.state === 'échue')) flags.push('condition-échue');

  const delivered = c.paths.filter((p) => p.role === 'deliverable' && file(p.value).state === 'present').map((p) => p.value);
  const progress = c.paths.some((p) => p.role !== 'context' && file(p.value).state === 'present');
  const found = c.shas.map((s) => commit(s.value)).filter((r) => r.state === 'found');
  const touching = found.some((r) => r.touches?.some((t) => delivered.includes(t)));
  const urlOk = c.urls.some((u) => url(u.value).state === 'ok');
  const proof = delivered.length > 0 && (found.length > 0 || urlOk);
  const out = (verdict, confidence, why, ...more) => ({ verdict, confidence, flags: [...flags, ...more], evidence, why });

  // 0. contradiction
  const absent = c.shas.find((s) => commit(s.value).state === 'absent');
  const gone = c.urls.find((u) => url(u.value).state === 'gone');
  if (proof && c.blockers.length) return out('à-vérifier', null, `Preuve de livraison ET blocage écrit ${quote(c.blockers[0].snippet)}.`, 'contradiction');
  if (absent) return out('à-vérifier', null, `Commit cité ${absent.value} introuvable dans les dépôts.`, 'contradiction');
  if (gone) return out('à-vérifier', null, `URL citée disparue : ${gone.value}.`, 'contradiction');
  // 1. sans-objet
  if (task.migratedTo) return out('sans-objet', 'moyenne', 'Tâche migrée vers un autre registre (migratedTo).');
  if (c.obsolete.length) return out('sans-objet', 'moyenne', `Formule explicite ${quote(c.obsolete[0].snippet)}.`);
  // 2. bloquée-user
  if (c.blockers.length) return out('bloquée-user', 'moyenne', `Blocage écrit : ${quote(c.blockers[0].snippet)}.`);
  // 3 / 3b. clore
  if (proof) {
    if (task.recurrence) return out('à-vérifier', null, 'Preuve présente, mais une tâche récurrente ne se clôt pas sur une occurrence.');
    return touching
      ? out('clore', 'haute', `Livrable ${delivered[0]} présent et touché par un commit trouvé.`)
      : out('clore', 'moyenne', `Livrable ${delivered[0]} présent ; ${found.length ? 'commit trouvé sans lien au chemin' : 'URL qui répond'}.`);
  }
  // 4. avancement
  if (progress || found.length || urlOk) return out('à-vérifier', 'basse', 'Avancement visible, preuve de livraison insuffisante.', 'avancement');
  // 5. replanifier
  if (task.owner === 'claude') return out('replanifier', 'basse', 'Aucune preuve, aucun blocage écrit.');
  // 6.
  return out('à-vérifier', null, 'Aucune preuve vérifiable par la machine.');
}
