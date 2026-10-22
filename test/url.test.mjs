import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, classify } from '../src/checks/url.mjs';

const lookup = async (host) => [{ address: host === 'inside.example' ? '192.168.1.10' : '93.184.216.34' }];
// Faux fetch : table url → { status, location } ; enregistre chaque appel.
function fakeFetch(table) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url: String(url), opts });
    const r = table[String(url)];
    if (!r) throw new Error('réseau');
    return { status: r.status, headers: new Map(r.location ? [['location', r.location]] : []), body: null };
  };
  f.calls = calls;
  return f;
}

test('classify (recopié de link-health) : 2xx ok, 404 gone, 403 antibot, 0 unreachable', () => {
  assert.deepEqual(['ok', 'gone', 'antibot', 'unreachable', 'server'], [200, 404, 403, 0, 503].map((s) => classify(s).state));
});

test('GET, jamais HEAD, redirections manuelles, sans cookie', async () => {
  const fetch = fakeFetch({ 'https://ex.com/p': { status: 200 } });
  const r = await checkUrl('https://ex.com/p', { fetch, lookup });
  assert.deepEqual([r.state, r.status], ['ok', 200]);
  assert.equal(fetch.calls[0].opts.method, 'GET');
  assert.equal(fetch.calls[0].opts.redirect, 'manual');
  assert.ok(!('cookie' in (fetch.calls[0].opts.headers || {})));
});

test('404 → gone ; erreur réseau → unreachable', async () => {
  assert.equal((await checkUrl('https://ex.com/x', { fetch: fakeFetch({ 'https://ex.com/x': { status: 404 } }), lookup })).state, 'gone');
  assert.equal((await checkUrl('https://ex.com/y', { fetch: fakeFetch({}), lookup })).state, 'unreachable');
});

test('redirection relative suivie et revalidée', async () => {
  const fetch = fakeFetch({ 'https://ex.com/a': { status: 301, location: '/b' }, 'https://ex.com/b': { status: 200 } });
  assert.equal((await checkUrl('https://ex.com/a', { fetch, lookup })).state, 'ok');
  assert.equal(fetch.calls.length, 2);
});

test('redirection vers une IP privée → refused, la cible n\'est jamais appelée', async () => {
  const fetch = fakeFetch({ 'https://ex.com/a': { status: 302, location: 'http://127.0.0.1/admin' } });
  assert.equal((await checkUrl('https://ex.com/a', { fetch, lookup })).state, 'refused');
  assert.equal(fetch.calls.length, 1);
});

test('boucle de redirections → redirected après le plafond', async () => {
  const fetch = fakeFetch({ 'https://ex.com/a': { status: 302, location: '/a' } });
  assert.equal((await checkUrl('https://ex.com/a', { fetch, lookup, maxRedirects: 3 })).state, 'redirected');
  assert.equal(fetch.calls.length, 4);
});

test('schémas, hôtes locaux, privés, lien-local et identifiants refusés sans appel', async () => {
  const fetch = fakeFetch({});
  for (const u of ['ftp://ex.com/f', 'file:///etc/passwd', 'http://localhost:3000/', 'http://app.localhost/', 'http://[::1]/', 'http://169.254.169.254/latest',
    'http://10.0.0.1/', 'http://172.20.0.1/', 'http://192.168.0.1/', 'http://0.0.0.0/', 'http://[::ffff:127.0.0.1]/', 'http://[fe80::1]/', 'http://[fd00::1]/',
    'https://user:pass@ex.com/', 'pas une url']) {
    assert.equal((await checkUrl(u, { fetch, lookup })).state, 'refused', u);
  }
  assert.equal(fetch.calls.length, 0);
});

test('nom d\'hôte public qui résout vers une IP privée → refused', async () => {
  const fetch = fakeFetch({ 'https://inside.example/': { status: 200 } });
  assert.equal((await checkUrl('https://inside.example/', { fetch, lookup })).state, 'refused');
  assert.equal(fetch.calls.length, 0);
});
