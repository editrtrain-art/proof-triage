// Contrôle d'une URL citée (opt-in --net). GET jamais HEAD seul (le HEAD ment, mémoire 23/09), sans cookie,
// redirections suivies à la main et chaque cible revalidée : http(s) seulement, aucun hôte local, privé ou lien-local,
// y compris un nom public qui résout vers une IP privée. Corps jamais lu.
import { isIP, isIPv4 } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

// Recopié de tools/affiliate/link-health.mjs (classify, 2026-10-22). Pure : ne fait que lire un statut.
/** Traduit un code HTTP en état exploitable. L'anti-bot est un état à part, jamais une mort. */
export function classify(status) {
  const s = Number(status) || 0;
  if (s === 0) return { state: 'unreachable', reason: 'aucune réponse (réseau, DNS ou délai dépassé)' };
  if (s >= 200 && s < 300) return { state: 'ok', reason: `HTTP ${s}` };
  if (s === 403 || s === 429) return { state: 'antibot', reason: `HTTP ${s} — refus d'un client non-navigateur, la page peut être vivante` };
  if (s === 404 || s === 410) return { state: 'gone', reason: `HTTP ${s} — cible disparue` };
  if (s >= 500) return { state: 'server', reason: `HTTP ${s} — panne côté cible, à revérifier` };
  if (s >= 300 && s < 400) return { state: 'redirected', reason: `HTTP ${s}` };
  return { state: 'other', reason: `HTTP ${s}` };
}

function privateIp(ip) {
  if (isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  // IPv6 : non spécifiée, boucle, ULA fc00::/7, lien-local fe80::/10, et toute IPv4 mappée (::ffff:…) refusée en bloc.
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('::ffff:');
}

// shortcut: le DNS est résolu ici puis à nouveau par fetch (fenêtre de rebinding) ; acceptable pour 13 URL citées en lecture.
// Améliorer (agent undici avec lookup épinglé) si l'outil sort du poste local.
async function gate(u, lookup) {
  let url;
  try { url = new URL(u); } catch { return 'refused'; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 'refused';
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return 'refused';
  if (isIP(host)) return privateIp(host) ? 'refused' : 'ok';
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length && addrs.every((a) => !privateIp(a.address)) ? 'ok' : 'refused';
  } catch {
    return 'unresolved';
  }
}

export async function checkUrl(u, { fetch = globalThis.fetch, lookup = dnsLookup, timeoutMs = 8000, maxRedirects = 5 } = {}) {
  let current = String(u);
  for (let hop = 0; ; hop++) {
    const g = await gate(current, lookup);
    if (g === 'refused') return { state: 'refused', status: null };
    if (g === 'unresolved') return { ...classify(0), status: 0 };
    let res;
    try {
      res = await fetch(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'proof-triage/0.1 (read-only)' } });
    } catch {
      return { ...classify(0), status: 0 };
    }
    await res.body?.cancel().catch(() => {});
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc && hop < maxRedirects) {
      try { current = new URL(loc, current).href; } catch { return { state: 'refused', status: res.status }; }
      continue;
    }
    return { ...classify(res.status), status: res.status };
  }
}
