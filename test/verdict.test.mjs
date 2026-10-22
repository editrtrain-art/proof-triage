// Un cas par ligne de la table §4 d'ARCHITECTURE.md, plus les pièges du challenge du 22/10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claims } from '../src/core/extract.mjs';
import { decide } from '../src/core/verdict.mjs';

const TODAY = '2026-10-22';
const byId = new Map([['z-annulee-ancienne', { id: 'z-annulee-ancienne', status: 'cancelled' }]]);
const run = (task, results = {}) => {
  const t = { id: 't', owner: 'claude', due: '2026-09-01', ...task };
  return decide(t, claims(t), { files: {}, commits: {}, urls: {}, ...results }, { today: TODAY, byId });
};
const present = { 'docs/a.md': { state: 'present', real: 'docs/a.md' } };
const touching = { abc1234: { state: 'found', repo: 'site', touches: ['docs/a.md'] } };
const unrelated = { abc1234: { state: 'found', repo: 'site', touches: [] } };

test('ligne 0 : preuve ET blocage → à-vérifier (contradiction)', () => {
  const v = run({ notes: 'Livrable écrit : docs/a.md (commit abc1234). RESTENT 2 gestes USER : valider.' }, { files: present, commits: touching });
  assert.equal(v.verdict, 'à-vérifier');
  assert.ok(v.flags.includes('contradiction'));
});

test('ligne 0 : commit cité absent → à-vérifier (contradiction)', () => {
  const v = run({ notes: 'Corrigé, commit deadbee1.' }, { commits: { deadbee1: { state: 'absent', touches: [] } } });
  assert.equal(v.verdict, 'à-vérifier');
  assert.ok(v.flags.includes('contradiction'));
});

test('ligne 0 : URL citée gone → à-vérifier (contradiction)', () => {
  const v = run({ notes: 'Publié : docs/a.md sur https://ex.com/p' }, { files: present, urls: { 'https://ex.com/p': { state: 'gone', status: 404 } } });
  assert.equal(v.verdict, 'à-vérifier');
  assert.ok(v.flags.includes('contradiction'));
});

test('hexa sans le mot commit, absent → ignoré (pas de contradiction) ; trouvé → compte', () => {
  const absent = run({ notes: 'Alerte 1a1322e21f94bbe2 reçue.' }, { commits: { '1a1322e21f94bbe2': { state: 'absent', touches: [] } } });
  assert.ok(!absent.flags.includes('contradiction'));
  assert.ok(!absent.evidence.some((e) => e.kind === 'commit'));
  const found = run({ notes: 'Rapport écrit : docs/a.md (correctif abc1234).' }, { files: present, commits: touching });
  assert.deepEqual([found.verdict, found.confidence], ['clore', 'haute']);
});

test('ligne 1 : migratedTo renseigné → sans-objet, moyenne', () => {
  const v = run({ migratedTo: 'autre/registre.json', notes: '' });
  assert.deepEqual([v.verdict, v.confidence], ['sans-objet', 'moyenne']);
});

test('ligne 1 : formule explicite « remplacée par » → sans-objet', () => {
  assert.equal(run({ notes: 'Remplacée par la tâche a-b-c.' }).verdict, 'sans-objet');
});

test('piège : citer une tâche annulée ne rend pas sans-objet', () => {
  const v = run({ notes: 'Voir la tâche z-annulee-ancienne (annulée).' });
  assert.notEqual(v.verdict, 'sans-objet');
  assert.ok(v.evidence.some((e) => e.kind === 'link' && e.state === 'cancelled'));
});

test('ligne 2 : blocage explicite → bloquée-user, moyenne, le pourquoi cite le passage', () => {
  const v = run({ owner: 'user', notes: 'GATÉ par la validation du contrat.' });
  assert.deepEqual([v.verdict, v.confidence], ['bloquée-user', 'moyenne']);
  assert.match(v.why, /GATÉ par la validation du contrat/);
});

test('piège : « RESTE » seul n\'est pas un blocage', () => {
  assert.equal(run({ notes: 'RESTE à relire la section 2.' }).verdict, 'replanifier');
});

test('ligne 3 : livrable présent ET commit qui touche ce chemin → clore, haute', () => {
  const v = run({ notes: 'Rapport écrit : docs/a.md, commit abc1234.' }, { files: present, commits: touching });
  assert.deepEqual([v.verdict, v.confidence], ['clore', 'haute']);
});

test('ligne 3b : livrable présent ET commit sans lien au chemin → clore, moyenne', () => {
  const v = run({ notes: 'Rapport écrit : docs/a.md, commit abc1234.' }, { files: present, commits: unrelated });
  assert.deepEqual([v.verdict, v.confidence], ['clore', 'moyenne']);
});

test('ligne 3b : livrable présent ET URL ok → clore, moyenne', () => {
  const v = run({ notes: 'Page publiée : docs/a.md sur https://ex.com/p' }, { files: present, urls: { 'https://ex.com/p': { state: 'ok', status: 200 } } });
  assert.deepEqual([v.verdict, v.confidence], ['clore', 'moyenne']);
});

test('piège : le chemin du champ source n\'est jamais une preuve', () => {
  const v = run({ owner: 'user', source: 'docs/a.md', notes: 'Relire, commit abc1234.' }, { files: present, commits: touching });
  assert.notEqual(v.verdict, 'clore');
});

test('piège : livrable présent sans commit ni URL → pas clore (à-vérifier, avancement)', () => {
  const v = run({ notes: 'Rapport écrit : docs/a.md.' }, { files: present });
  assert.deepEqual([v.verdict, v.confidence], ['à-vérifier', 'basse']);
  assert.ok(v.flags.includes('avancement'));
});

test('ligne 4 : chemin mentionné présent, sans preuve suffisante → à-vérifier, basse', () => {
  const v = run({ notes: 'Brouillon dans docs/a.md, à finir.' }, { files: present });
  assert.deepEqual([v.verdict, v.confidence], ['à-vérifier', 'basse']);
});

test('ligne 4 : commit trouvé sans livrable présent → à-vérifier, pas replanifier', () => {
  assert.equal(run({ notes: 'Avancé, commit abc1234.' }, { commits: unrelated }).verdict, 'à-vérifier');
});

test('ligne 5 : owner claude, aucune preuve, aucun blocage → replanifier, basse', () => {
  const v = run({ notes: 'Rien de fait.' });
  assert.deepEqual([v.verdict, v.confidence], ['replanifier', 'basse']);
});

test('ligne 5 : un chemin refusé n\'est pas une preuve', () => {
  const v = run({ notes: 'Écrit dans ../hors/r.md.' }, { files: { '../hors/r.md': { state: 'refused' } } });
  assert.equal(v.verdict, 'replanifier');
  assert.ok(v.evidence.some((e) => e.kind === 'file' && e.state === 'refused'));
});

test('ligne 6 : owner user, rien → à-vérifier', () => {
  const v = run({ owner: 'user', notes: 'À faire.' });
  assert.deepEqual([v.verdict, v.confidence], ['à-vérifier', null]);
});

test('drapeau condition-échue : date calculable dépassée seulement', () => {
  assert.ok(run({ notes: 'Fenêtre jusqu\'au 30/09, sinon perdu.' }).flags.includes('condition-échue'));
  assert.ok(!run({ notes: 'Fenêtre jusqu\'au 30/11, sinon perdu.' }).flags.includes('condition-échue'));
  assert.ok(!run({ notes: 'À livrer avant le 15/09.' }).flags.includes('condition-échue'));
});

test('une condition sans date ne s\'affiche pas en preuve (bruit)', () => {
  assert.ok(!run({ notes: 'Exige un dataset réel, sinon NEEDS_INPUT.' }).evidence.some((e) => e.kind === 'condition'));
});

test('récurrente : jamais clore, drapeau récurrente', () => {
  const v = run({ recurrence: 'weekly', notes: 'Relevé écrit : docs/a.md, commit abc1234.' }, { files: present, commits: touching });
  assert.equal(v.verdict, 'à-vérifier');
  assert.ok(v.flags.includes('récurrente'));
});

test('chaque preuve garde extrait → contrôle → résultat', () => {
  const v = run({ notes: 'Rapport écrit : docs/a.md, commit abc1234.' }, { files: present, commits: touching });
  const f = v.evidence.find((e) => e.kind === 'file');
  assert.deepEqual([f.value, f.state], ['docs/a.md', 'present']);
  assert.match(f.snippet, /Rapport écrit/);
  const c = v.evidence.find((e) => e.kind === 'commit');
  assert.match(c.detail, /site.*docs\/a\.md/);
});

test('contrôle non lancé (URL sans --net) → état unchecked, jamais une preuve', () => {
  const v = run({ notes: 'Page publiée : docs/a.md sur https://ex.com/p' }, { files: present });
  assert.equal(v.evidence.find((e) => e.kind === 'url').state, 'unchecked');
  assert.notEqual(v.verdict, 'clore');
});
