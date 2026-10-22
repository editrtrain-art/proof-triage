// Démo web statique (v0.3) : générée par l'outil lui-même à partir d'un registre SYNTHÉTIQUE, publiable telle quelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toHtml } from '../src/report/html.mjs';
import { toReport } from '../src/report/json.mjs';

const BIN = fileURLToPath(new URL('../bin/demo.mjs', import.meta.url));
const COMMITTED = fileURLToPath(new URL('../demo/index.html', import.meta.url));
const META = { today: '2026-10-22', registryHash: 'h', limit: 20, overdueTotal: 1, net: false };
const row = (extra = {}) => ({ id: 'a', title: 'T', owner: 'claude', due: '2026-09-01', priority: 'P2', verdict: 'clore', confidence: 'haute', flags: [], why: 'w', evidence: [], ...extra });

function generate() {
  const out = mkdtempSync(join(process.env.AUDIT_DIR || tmpdir(), 'pt-demo-'));
  const r = spawnSync(process.execPath, [BIN, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { out, html: readFileSync(join(out, 'index.html'), 'utf8') };
}

test('toHtml échappe tout texte venu des notes (aucune balise injectée)', () => {
  const report = toReport([row({ title: '<script>alert(1)</script>', why: '<img src=x onerror=alert(1)>', evidence: [{ kind: 'file', value: '"><b>x', snippet: '<iframe>', state: 'present', detail: 'deliverable' }] })], META);
  const html = toHtml({ report, replay: null });
  for (const bad of ['<script>alert', '<img src=x', '<iframe>', '"><b>']) assert.ok(!html.includes(bad), bad);
  assert.match(html, /&lt;script&gt;/);
});

test('toHtml : retard en jours, jamais une date exacte', () => {
  const html = toHtml({ report: toReport([row()], META), replay: null });
  assert.match(html, /overdue 51 days/);
  assert.doesNotMatch(html, /2026-09-01|\b\d{1,2}\/\d{1,2}\b/);
});

test('bin/demo.mjs : une seule page, autonome, toutes les familles de verdict, rejeu du contre-factuel, aucune date', () => {
  const { out, html } = generate();
  try {
    assert.deepEqual(readdirSync(out), ['index.html']);
    for (const v of ['clore', 'sans-objet', 'bloquée-user', 'à-vérifier', 'replanifier']) assert.ok(html.includes(`data-verdict="${v}"`), v);
    assert.match(html, /Pretend the commit is missing/);
    assert.match(html, /réaffecter-user/);
    assert.doesNotMatch(html, /\d{4}-\d{2}-\d{2}|\b\d{1,2}\/\d{1,2}\b/);
    assert.doesNotMatch(html, /<script|https?:\/\/(?!github\.com\/editrtrain-art\/proof-triage)/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('vercel.json ne publie QUE demo/ (sinon Vercel sert la racine du dépôt), et demo/ ne contient que la page', () => {
  const cfg = JSON.parse(readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8'));
  assert.deepEqual([cfg.outputDirectory, cfg.framework, cfg.installCommand], ['demo', null, '']);
  assert.ok(!('buildCommand' in cfg) || cfg.buildCommand === null);
  assert.deepEqual(readdirSync(fileURLToPath(new URL('../demo/', import.meta.url))), ['index.html']);
});

test('bin/demo.mjs est déterministe et la page commitée est à jour', () => {
  const a = generate();
  const b = generate();
  try {
    assert.equal(a.html, b.html);
    assert.equal(readFileSync(COMMITTED, 'utf8'), a.html, 'demo/index.html est périmée : relancer node bin/demo.mjs');
  } finally {
    rmSync(a.out, { recursive: true, force: true });
    rmSync(b.out, { recursive: true, force: true });
  }
});
