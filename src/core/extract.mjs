// Affirmations vérifiables d'une tâche. PUR : n'exécute rien, ne lit rien, garde l'extrait source.
import { DELIVERY, DELIVERY_UPPER, NEGATION, BLOCKERS, OBSOLETE, CONDITION, URL, PATH, PATH_TAIL, SHA, COMMIT_WORD, SHA256_BEFORE, LINK, DATE } from './patterns.mjs';

const SNIPPET = 160;
const snip = (s) => s.trim().slice(0, SNIPPET);
const uniq = (list) => list.filter((c, i) => list.findIndex((d) => d.value === c.value) === i);
// Une valeur citée plusieurs fois garde son rôle le plus fort, avec l'extrait qui le justifie.
const ROLE_RANK = { context: 0, mention: 1, deliverable: 2, hex: 0, commit: 1 };
function strongest(list) {
  const m = new Map();
  for (const c of list) if (!m.has(c.value) || ROLE_RANK[c.role] > ROLE_RANK[m.get(c.value).role]) m.set(c.value, c);
  return [...m.values()];
}

// Segments = mises à jour « … | 07/09 : … » ou « … || 07/09 : … » ; phrases = coupées sur . ! ? suivis d'un blanc, ; et retour ligne.
const segmentsOf = (text) => text.split(/\s\|\|?\s/).map((seg) => ({ seg, sentences: seg.split(/(?<=[.!?])\s+|[;\n]/) }));

// Premier segment en forme de domaine (zoho.com/…, old.reddit.com/…) = URL sans schéma, pas un fichier.
const DOMAIN_HEAD = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,6}$/i;

function pathsIn(text) {
  return (text.replace(URL, ' ').match(PATH) || [])
    .map((p) => p.replace(/\.+$/, ''))
    .filter((p) => PATH_TAIL.test(p) && /[A-Za-z]/.test(p) && !DOMAIN_HEAD.test(p.split('/')[0]));
}

// shortcut: année JJ/MM prise de l'échéance de la tâche ; faux sur une note qui chevauche le nouvel an. Améliorer si ça se voit au tri.
function datesIn(text, year) {
  return [...text.matchAll(DATE)].map((m) => {
    const [y, mo, d] = m[1] ? [m[1], m[2], m[3]] : [m[6] || year, m[5], m[4]];
    return { index: m.index, iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }).filter((x) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x.iso));
}

const delivers = (s) => [...s.matchAll(DELIVERY), ...s.matchAll(DELIVERY_UPPER)]
  .some((m) => !NEGATION.test(s.slice(Math.max(0, m.index - 24), m.index)));

const addDays =(iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export function claims(task) {
  const notes = String(task.notes || '');
  const year = String(task.due || task.created || '').slice(0, 4) || '1970';
  const out = { paths: [], shas: [], urls: [], blockers: [], obsolete: [], dateConditions: [], links: [] };

  for (const p of pathsIn(String(task.source || ''))) out.paths.push({ value: p, role: 'context', snippet: snip(String(task.source)) });

  for (const { seg, sentences } of segmentsOf(notes)) {
    let offset = 0;
    for (const s of sentences) {
      const at = seg.indexOf(s, offset);
      offset = at + s.length;
      const snippet = snip(s);
      const role = delivers(s) ? 'deliverable' : 'mention';
      for (const p of pathsIn(s)) out.paths.push({ value: p, role, snippet });
      for (const u of s.match(URL) || []) out.urls.push({ value: u.replace(/[.,;:!?]+$/, ''), role: 'url', snippet });
      const bare = s.replace(URL, ' ');
      const shaRole = COMMIT_WORD.test(bare) ? 'commit' : 'hex';
      for (const m of bare.matchAll(SHA)) {
        const h = m[0];
        if (/\d/.test(h) && /[a-f]/.test(h) && !SHA256_BEFORE.test(bare.slice(Math.max(0, m.index - 12), m.index))) out.shas.push({ value: h, role: shaRole, snippet });
      }
      for (const l of bare.match(LINK) || []) if (/[a-z]/.test(l) && l !== task.id) out.links.push({ value: l, role: 'link', snippet });
      const b = BLOCKERS.find((re) => re.test(s));
      if (b) out.blockers.push({ value: s.match(b)[0], role: 'blocker', snippet });
      const o = OBSOLETE.find((re) => re.test(s));
      if (o) out.obsolete.push({ value: s.match(o)[0], role: 'obsolete', snippet });
      const c = s.match(CONDITION);
      if (c) {
        let value = null;
        if (c[2]) {
          // J+N : dernière date avant le marqueur dans le segment, sinon première date de la phrase.
          const before = datesIn(seg.slice(0, at + c.index), year).at(-1) || datesIn(s, year)[0];
          if (before) value = addDays(before.iso, Number(c[2]));
        } else {
          value = datesIn(s, year).at(-1)?.iso ?? null;
        }
        out.dateConditions.push({ value, role: c[1].toLowerCase(), snippet });
      }
    }
  }
  out.paths = strongest(out.paths);
  out.shas = strongest(out.shas);
  for (const k of ['urls', 'links']) out[k] = uniq(out[k]);
  return out;
}
