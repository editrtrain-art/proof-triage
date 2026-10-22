// Un cas par ligne de la table §4 d'ARCHITECTURE.md, plus les pièges relevés au challenge de conception.
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

test('piège : une URL seulement mentionnée qui répond ne prouve rien (cas relevé sur un registre réel)', () => {
  const v = run({ notes: 'DIAGNOSTIC FAIT : docs/a.md. Le lien http://ex.com/c redirige.' }, { files: present, urls: { 'http://ex.com/c': { state: 'ok', status: 200 } } });
  assert.notEqual(v.verdict, 'clore');
});

test('piège : une URL seulement mentionnée et morte n\'est pas une contradiction', () => {
  const v = run({ notes: 'Le lien http://ex.com/c est mort.' }, { urls: { 'http://ex.com/c': { state: 'gone', status: 404 } } });
  assert.ok(!v.flags.includes('contradiction'));
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

test('suggestion : tâche de Claude dont la suite revient au user → réaffecter-user, verdict inchangé', () => {
  const plain = run({ notes: 'Glossaire écrit : docs/a.md.' }, { files: present });
  const v = run({ notes: 'Glossaire écrit : docs/a.md, à valider par le user.' }, { files: present });
  assert.equal(v.verdict, plain.verdict);
  assert.equal(v.suggestion.kind, 'réaffecter-user');
  assert.match(v.suggestion.why, /à valider par le user/);
  assert.ok(v.flags.includes('geste-user-restant'));
});

test('suggestion : la suite est une AUTRE tâche du user encore ouverte → dépend-de, pas de réaffectation', () => {
  const deps = new Map([...byId, ['compte-trial-user', { id: 'compte-trial-user', status: 'todo', owner: 'user' }]]);
  const t = { id: 't', owner: 'claude', due: '2026-09-01', notes: 'BLOQUÉE par compte-trial-user (geste user).' };
  const v = decide(t, claims(t), { files: {}, commits: {}, urls: {} }, { today: TODAY, byId: deps });
  assert.deepEqual([v.suggestion.kind, v.suggestion.id], ['dépend-de', 'compte-trial-user']);
});

test('suggestion : un tour du user déjà accompli plus loin dans les notes n\'en déclenche pas', () => {
  assert.equal(run({ notes: 'v0.1 écrite, à valider par le user. | 21/10 : validé par le user, reste l\'intégration.' }).suggestion, null);
  assert.equal(run({ notes: 'Geste user fait le 20/10, Claude reprend.' }).suggestion, null);
  assert.equal(run({ notes: 'ENVOI USER fait.' }).suggestion, null);
  // l'ordre compte : un nouveau tour du user APRÈS une validation redonne la suggestion
  assert.equal(run({ notes: 'Validé par le user. | 22/10 : v0.2 écrite, à valider par le user.' }).suggestion.kind, 'réaffecter-user');
});

test('suggestion : une validation niée ou à venir n\'efface pas le tour du user écrit avant elle', () => {
  assert.equal(run({ notes: 'v0.1 écrite, à valider par le user. | 21/10 : pas encore validé par le user.' }).suggestion?.kind, 'réaffecter-user');
  assert.equal(run({ notes: 'v0.1 écrite, à relire par le user. | 21/10 : sera relue par le user demain.' }).suggestion?.kind, 'réaffecter-user');
});

test('suggestion : rien sur une tâche close (--explain d\'une tâche done)', () => {
  assert.equal(run({ status: 'done', notes: 'À valider par le user.' }).suggestion, null);
});

test('dépend-de : la tâche citée doit être dans la MÊME phrase, même si les phrases se ressemblent sur 160 caractères', () => {
  const deps = new Map([...byId, ['compte-trial-user', { id: 'compte-trial-user', status: 'todo', owner: 'user' }]]);
  const long = 'x'.repeat(170);
  const t = { id: 't', owner: 'claude', due: '2026-09-01', notes: `${long} à valider par le user. ${long} voir compte-trial-user.` };
  assert.equal(decide(t, claims(t), { files: {}, commits: {}, urls: {} }, { today: TODAY, byId: deps }).suggestion.kind, 'réaffecter-user');
});

test('suggestion : rien pour une tâche sans-objet (cas relevé : lot remplacé par un autre)', () => {
  const v = run({ notes: 'Remplacé par le lot R11. Procédure 00-LANCEMENT-A-FAIRE-PAR-TOI.md.' });
  assert.equal(v.verdict, 'sans-objet');
  assert.equal(v.suggestion, null);
});

test('suggestion : rien pour une tâche déjà au user, ni sans tour du user', () => {
  assert.equal(run({ owner: 'user', notes: 'À valider par le user.' }).suggestion, null);
  assert.equal(run({ notes: 'Rien de fait.' }).suggestion, null);
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
