import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditName } from '../src/lib/audit-name.mjs';
import { toReport } from '../src/report/json.mjs';
import { toMarkdown, esc } from '../src/report/md.mjs';

const row = (id, verdict, confidence = null, extra = {}) => ({
  id, title: `Titre ${id}`, owner: 'claude', due: '2026-09-01', priority: 'P2', verdict, confidence, flags: [], why: 'parce que', evidence: [], ...extra,
});
const META = { today: '2026-10-22', registryHash: 'a'.repeat(64), limit: 20, overdueTotal: 230, net: false };

test('auditName (recopié) : <outil>-<cible>-<fenetre>-<date>, refuse une date invalide ou un champ vide', () => {
  assert.equal(auditName({ tool: 'proof-triage', target: 'ops-tasks', window: 'top20', date: '2026-10-22' }), 'proof-triage-ops-tasks-top20-2026-10-22');
  assert.throws(() => auditName({ tool: 'proof-triage', target: 'ops-tasks', window: 'top20', date: '22/10/2026' }));
  assert.throws(() => auditName({ tool: 'proof-triage', target: '', window: 'top20', date: '2026-10-22' }));
});

test('report.json : schemaVersion 1, meta.tool = proof-triage, meta complète, lignes et décompte', () => {
  const r = toReport([row('a', 'clore', 'haute'), row('b', 'replanifier', 'basse')], META);
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.meta.tool, 'proof-triage');
  assert.equal(r.meta.registryHash, META.registryHash);
  assert.deepEqual(r.meta.counts, { clore: 1, replanifier: 1 });
  assert.equal(r.rows.length, 2);
});

test('triage.md : ordre clore (haute d\'abord) → sans-objet → bloquée-user → reste', () => {
  const md = toMarkdown(toReport([row('r', 'replanifier', 'basse'), row('b', 'bloquée-user', 'moyenne'), row('c2', 'clore', 'moyenne'),
    row('s', 'sans-objet', 'moyenne'), row('c1', 'clore', 'haute'), row('v', 'à-vérifier')], META));
  const pos = (id) => md.indexOf(`Titre ${id}`);
  assert.ok(pos('c1') < pos('c2') && pos('c2') < pos('s') && pos('s') < pos('b') && pos('b') < pos('v') && pos('v') < pos('r'), md);
});

test('triage.md : en-tête avec date, décompte, empreinte courte, réseau', () => {
  const md = toMarkdown(toReport([row('a', 'clore', 'haute')], META));
  assert.match(md, /2026-10-22/);
  assert.match(md, /clore : 1/);
  assert.match(md, /aaaaaaaaaaaa/);
  assert.ok(!md.includes('a'.repeat(64)));
  assert.match(md, /réseau : coupé/);
});

test('triage.md : chaque preuve en trois temps (extrait → contrôle → résultat)', () => {
  const ev = [{ kind: 'file', value: 'docs/a.md', snippet: 'Rapport produit : docs/a.md', state: 'present', detail: 'deliverable' }];
  const md = toMarkdown(toReport([row('a', 'clore', 'haute', { evidence: ev })], META));
  assert.match(md, /fichier docs\/a\.md \(deliverable\) → \*\*present\*\* · « Rapport produit : docs\/a\.md »/);
});

test('esc neutralise le Markdown et le HTML venus des notes, sur une seule ligne', () => {
  const s = esc('<script>x</script> [lien](http://evil) | `code` *gras*\nligne 2');
  assert.ok(!/[<>\n]/.test(s.replace(/\\[<>]/g, '')), s);
  for (const ch of ['[', ']', '(', ')', '|', '`', '*']) assert.ok(s.includes(`\\${ch}`), ch);
});
