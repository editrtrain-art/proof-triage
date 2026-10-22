// Adaptateurs de registre (v0.3) : même contrat que ops-tasks-json, sur des fixtures SYNTHÉTIQUES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadRegistry, detectFormat } from '../src/sources/index.mjs';
import { selectOverdue } from '../src/core/select.mjs';

const fx = (f) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));

test('detectFormat : .md → markdown, tableau JSON → github-issues, objet avec tasks → ops-tasks-json', () => {
  assert.equal(detectFormat(fx('tasks-sample.md')), 'markdown');
  assert.equal(detectFormat(fx('issues-sample.json')), 'github-issues');
  assert.equal(detectFormat(fx('registry-sample.json')), 'ops-tasks-json');
});

test('markdown : cases, métadonnées entre crochets, notes indentées, fait = done, empreinte du fichier', () => {
  const r = loadRegistry(fx('tasks-sample.md'));
  assert.equal(r.meta.format, 'markdown');
  assert.equal(r.hash, createHash('sha256').update(readFileSync(fx('tasks-sample.md'))).digest('hex'));
  const t = r.byId.get('md-rapport');
  assert.deepEqual([t.title, t.due, t.owner, t.priority, t.status], ['Livrer le rapport', '2026-09-01', 'claude', 'P1', 'todo']);
  assert.equal(t.notes, 'Rapport écrit : docs/rapport.md.\nRelu une première fois.');
  assert.equal(r.byId.get('tache-faite').status, 'done');
  assert.equal(r.byId.get('signer-le-contrat').owner, 'user');
  assert.equal(r.byId.get('puce-etoile').priority, 'P1');
  assert.equal(r.tasks.length, 6);
});

test('markdown : sélection des retards identique au registre JSON (todo en retard, done et sans échéance exclus)', () => {
  const ids = selectOverdue(loadRegistry(fx('tasks-sample.md')).tasks, { today: '2026-10-22', limit: 10 }).map((t) => t.id);
  assert.deepEqual(ids, ['md-rapport', 'signer-le-contrat', 'puce-etoile']);
});

test('github-issues : export gh issue list, jalon = échéance, étiquettes = priorité et owner, corps = notes', () => {
  const r = loadRegistry(fx('issues-sample.json'));
  assert.equal(r.meta.format, 'github-issues');
  const a = r.byId.get('issue-12');
  assert.deepEqual([a.title, a.due, a.priority, a.owner, a.status], ['Écrire le guide', '2026-09-05', 'P1', 'claude', 'todo']);
  assert.match(a.notes, /Guide écrit : docs\/guide\.md\./);
  assert.deepEqual([r.byId.get('issue-13').owner, r.byId.get('issue-14').status, r.byId.get('issue-15').due, r.byId.get('issue-15').notes], ['user', 'done', undefined, '']);
});

test('format forcé et format inconnu', () => {
  assert.equal(loadRegistry(fx('registry-sample.json'), 'ops-tasks-json').meta.format, 'ops-tasks-json');
  assert.throws(() => loadRegistry(fx('tasks-sample.md'), 'trello'), /format inconnu/);
});
