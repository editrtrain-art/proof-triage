// Adaptateurs de registre (v0.3) : même contrat que ops-tasks-json, sur des fixtures SYNTHÉTIQUES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistry, detectFormat, writableFormat, resolveFormat } from '../src/sources/index.mjs';
import { load } from '../src/sources/markdown.mjs';
import { selectOverdue } from '../src/core/select.mjs';

const fx = (f) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));
const md = (text) => { const f = join(mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-md-')), 'b.md'); writeFileSync(f, text); return f; };

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

test('markdown : une ligne vide dans les notes ne coupe pas la tâche ; une ligne non indentée, si', () => {
  const r = load(md('- [ ] Livrer [due:2026-09-01]\n  Rapport écrit : docs/r.md.\n\n  commit abc1234def\nTexte libre\n  pas une note'));
  assert.equal(r.tasks[0].notes, 'Rapport écrit : docs/r.md.\ncommit abc1234def');
});

test('markdown : un id explicite l\'emporte sur un id déduit ; un titre sans lettre latine reçoit un id stable', () => {
  const r = load(md('- [ ] Foo\n- [ ] Autre [id:foo]\n- [ ] مهمة\n- [ ] 任务'));
  assert.deepEqual(r.tasks.map((t) => t.id), ['foo-2', 'foo', 'tache-3', 'tache-4']);
});

test('échéance : chiffres complétés (2026-9-1), forme inconnue ignorée plutôt que mal comparée', () => {
  const r = load(md('- [ ] A [due:2026-9-1]\n- [ ] B [due:demain]'));
  assert.deepEqual(r.tasks.map((t) => t.due), ['2026-09-01', undefined]);
});

test('writableFormat : seul un adaptateur qui sait écrire est accepté ; le format de la config ne vaut que pour SON registre', () => {
  assert.equal(writableFormat(fx('registry-sample.json')), 'ops-tasks-json');
  assert.throws(() => writableFormat(fx('tasks-sample.md')), /lecture seule/);
  assert.throws(() => writableFormat(fx('tasks-sample.md'), 'ops-tasks-json'), /lisible|JSON/);
  assert.equal(resolveFormat({ forced: undefined, configFormat: 'markdown', fromConfig: false }), undefined);
  assert.equal(resolveFormat({ forced: undefined, configFormat: 'markdown', fromConfig: true }), 'markdown');
  assert.equal(resolveFormat({ forced: 'github-issues', configFormat: 'markdown', fromConfig: true }), 'github-issues');
});

test('format forcé et format inconnu', () => {
  assert.equal(loadRegistry(fx('registry-sample.json'), 'ops-tasks-json').meta.format, 'ops-tasks-json');
  assert.throws(() => loadRegistry(fx('tasks-sample.md'), 'trello'), /format inconnu/);
});
