import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claims } from '../src/core/extract.mjs';

const task = (notes, extra = {}) => ({ id: 'x', due: '2026-09-01', notes, ...extra });
const values = (list) => list.map((c) => c.value);

test('chemin du champ source = context, jamais une preuve', () => {
  const c = claims(task('Relire.', { source: 'docs/rapport.md §3' }));
  assert.deepEqual(c.paths.map((p) => [p.value, p.role]), [['docs/rapport.md', 'context']]);
});

test('chemin dans la même phrase qu\'un verbe de livraison = deliverable, sinon mention', () => {
  const c = claims(task('Brouillon dans docs/a.md. Guide écrit → docs/b.md, prêt.'));
  assert.deepEqual(c.paths.map((p) => [p.value, p.role]), [['docs/a.md', 'mention'], ['docs/b.md', 'deliverable']]);
});

test('le point final ne colle pas au chemin, le séparateur | coupe la phrase', () => {
  const c = claims(task('Créé docs/a.md. | 07/09 : voir docs/b.md'));
  assert.deepEqual(c.paths.map((p) => [p.value, p.role]), [['docs/a.md', 'deliverable'], ['docs/b.md', 'mention']]);
});

test('rédigé, généré, ajouté, fait comptent comme livraison (relevé sur le registre réel)', () => {
  for (const n of ['Relance rédigée : docs/a.md.', 'VISUELS GÉNÉRÉS : docs/a.png', 'Entrées ajoutées dans docs/a.json', 'DIAGNOSTIC FAIT : docs/a.md']) {
    assert.equal(claims(task(n)).paths[0].role, 'deliverable', n);
  }
});

test('une livraison niée ne compte pas ; « écrit (non commité) » reste une livraison', () => {
  assert.equal(claims(task('Lecture seule de docs/a.md, aucun commit.')).paths[0].role, 'mention');
  assert.equal(claims(task('Rien publié dans docs/a.md.')).paths[0].role, 'mention');
  assert.equal(claims(task('docs/a.mjs écrit (non commité).')).paths[0].role, 'deliverable');
});

test('« à livrer » n\'est pas un verbe de livraison accompli', () => {
  const c = claims(task('Reste à livrer docs/a.md'));
  assert.equal(c.paths[0].role, 'mention');
});

test('le séparateur || coupe aussi les mises à jour', () => {
  const c = claims(task('Voir docs/a.md || 11/09 : X publié docs/b.md'));
  assert.deepEqual(c.paths.map((p) => [p.value, p.role]), [['docs/a.md', 'mention'], ['docs/b.md', 'deliverable']]);
});

test('un domaine sans schéma n\'est pas un chemin (zoho.com/x.html, old.reddit.com/u/)', () => {
  assert.deepEqual(claims(task('Formulaire zoho.com/recruit/signup.html et old.reddit.com/user/x/edit/ ; fichier .agents/skills/a.md')).paths.map((p) => p.value), ['.agents/skills/a.md']);
});

test('un chemin cité plusieurs fois garde son rôle le plus fort (deliverable > mention > context)', () => {
  const c = claims(task('Brouillon dans docs/a.md. | 12/09 : docs/a.md publié.', { source: 'docs/a.md' }));
  assert.deepEqual(c.paths.map((p) => [p.value, p.role]), [['docs/a.md', 'deliverable']]);
  assert.match(c.paths[0].snippet, /publié/);
});

test('routes de site, URL, dates et r/xxx ne sont pas des chemins', () => {
  const c = claims(task('Page /guides/x/ et /go/y ; https://ex.com/a/b.html le 30/09/2024 sur r/ShadowBan.'));
  assert.deepEqual(c.paths, []);
});

test('chemins absolus, ../ et .secrets sont extraits (le contrôle les refusera)', () => {
  const c = claims(task('Écrit dans ../hors/r.md et D:/ailleurs/x.md et .secrets/k.env.'));
  assert.deepEqual(values(c.paths), ['../hors/r.md', 'D:/ailleurs/x.md', '.secrets/k.env']);
});

test('SHA : hexa 7-40 avec chiffre ET lettre, hors couleur, hors nom de fichier', () => {
  const c = claims(task('commit 8f1c590 et deadbee1. Couleur #ff00aa1, date 2026091, mot deadbeef, fichier abc1234.md.'));
  assert.deepEqual(values(c.shas), ['8f1c590', 'deadbee1']);
});

test('SHA : rôle commit si la phrase dit commit/commité/poussé, sinon hex ; préfixe sha256 exclu', () => {
  const c = claims(task('Archive sha256 4f21b733… prête, commit abc1234. Alerte 1a1322e21f94bbe2 reçue. COMMITÉ ET POUSSÉ (2443bbd).'));
  assert.deepEqual(c.shas.map((s) => [s.value, s.role]), [['abc1234', 'commit'], ['1a1322e21f94bbe2', 'hex'], ['2443bbd', 'commit']]);
});

test('URL extraites sans ponctuation finale, dédoublonnées', () => {
  const c = claims(task('En ligne sur https://example.com/page. Revoir https://example.com/page'));
  assert.deepEqual(values(c.urls), ['https://example.com/page']);
});

test('blocages explicites reconnus, avec extrait', () => {
  for (const n of ['GATÉ par le contrat.', 'Bloqué par la banque.', 'En attente de la signature.', 'IRRÉDUCTIBLEMENT USER.', 'RESTENT 2 gestes USER : valider.']) {
    const c = claims(task(n));
    assert.equal(c.blockers.length, 1, n);
    assert.ok(c.blockers[0].snippet.length > 0);
  }
});

test('« RESTE » seul et « quality gate » ne sont pas des blocages', () => {
  assert.deepEqual(claims(task('RESTE à relire la section 2. Passé le quality GATE.')).blockers, []);
});

test('formules sans-objet explicites ; une simple citation d\'une tâche annulée ne compte pas', () => {
  assert.equal(claims(task('Remplacée par la tâche b-c-d.')).obsolete.length, 1);
  assert.equal(claims(task('Annulé car hors périmètre.')).obsolete.length, 1);
  assert.equal(claims(task('Migrée vers le nouveau registre.')).obsolete.length, 1);
  assert.deepEqual(claims(task('Voir la tâche z-annulee-ancienne (annulée).')).obsolete, []);
});

test('conditions datées : sinon/fenêtre/expire prennent la date de la phrase', () => {
  const c = claims(task('Fenêtre ouverte jusqu\'au 30/09, sinon l\'offre tombe.'));
  assert.deepEqual(values(c.dateConditions), ['2026-09-30']);
});

test('J+N se calcule depuis la date de la phrase ou la dernière date du même segment', () => {
  assert.deepEqual(values(claims(task('Publié le 01/09 ; mesurer à J+7.')).dateConditions), ['2026-09-08']);
  assert.deepEqual(values(claims(task('Le 2026-09-28, relancer à J+3.')).dateConditions), ['2026-10-01']);
});

test('« avant le JJ/MM » seul est une échéance, pas une condition', () => {
  assert.deepEqual(claims(task('À livrer avant le 15/09.')).dateConditions, []);
});

test('une condition sans date calculable donne value null', () => {
  assert.deepEqual(values(claims(task('Sinon on perd la fenêtre.')).dateConditions), [null]);
});

test('ids de tâches cités (kebab, 3 segments mini, au moins une lettre)', () => {
  const c = claims(task('Voir z-annulee-ancienne et `a-b-c`, pas 2026-09-07 ni docs/x-y-z.md.'));
  assert.deepEqual(values(c.links), ['z-annulee-ancienne', 'a-b-c']);
});

test('notes absentes : tout est vide, rien ne casse', () => {
  const c = claims({ id: 'x' });
  for (const k of ['paths', 'shas', 'urls', 'blockers', 'obsolete', 'dateConditions', 'links']) assert.deepEqual(c[k], [], k);
});
