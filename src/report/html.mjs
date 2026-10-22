// Page de démo statique (v0.3). PUR : un rapport entre, une page HTML autonome sort (CSS en ligne, aucun script,
// aucune ressource externe). Tout texte venu du registre est échappé. Aucune date exacte : un retard en jours.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const days = (due, today) => Math.round((Date.parse(today) - Date.parse(due)) / 86400000);

const VERDICTS = [
  ['clore', 'close', 'The evidence says it is done.'],
  ['sans-objet', 'drop', 'Replaced or cancelled in writing.'],
  ['bloquée-user', 'blocked on a person', 'A written blocker waits on someone.'],
  ['à-vérifier', 'check by hand', 'The evidence is partial or contradicts itself.'],
  ['replanifier', 'reschedule', 'No evidence and no blocker.'],
];
const LABEL = Object.fromEntries(VERDICTS.map(([v, l]) => [v, l]));
const KIND = { file: 'file', commit: 'commit', url: 'URL', blocker: 'blocker', obsolete: 'obsolete', condition: 'condition', link: 'linked task' };
const CONF = { haute: 'high', moyenne: 'medium', basse: 'low' };

const badge = (r) => `<span class="badge" data-verdict="${esc(r.verdict)}">${esc(r.verdict)} <span class="gloss">${esc(LABEL[r.verdict] || '')}${r.confidence ? `, ${CONF[r.confidence] || esc(r.confidence)} confidence` : ''}</span></span>`;

function evidence(r) {
  if (!r.evidence.length) return '<p class="none">No checkable claim in the notes.</p>';
  return `<table class="chain"><thead><tr><th scope="col">The note says</th><th scope="col">Checked</th><th scope="col">Result</th></tr></thead><tbody>${r.evidence.map((e) => `
    <tr><td class="quote">${esc(e.snippet)}</td><td>${esc(KIND[e.kind] || e.kind)} <code>${esc(e.value ?? '')}</code></td><td><span class="state" data-state="${esc(e.state)}">${esc(e.state)}</span>${e.detail ? ` <span class="detail">${esc(e.detail)}</span>` : ''}</td></tr>`).join('')}
  </tbody></table>`;
}

function card(r, today) {
  const flags = r.flags.length ? `<p class="flags">${r.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join(' ')}</p>` : '';
  const sugg = r.suggestion ? `<p class="suggestion">Suggestion: <strong>${esc(r.suggestion.kind)}</strong>${r.suggestion.id ? ` <code>${esc(r.suggestion.id)}</code>` : ''}. ${esc(r.suggestion.why)}</p>` : '';
  return `<div class="card" data-verdict="${esc(r.verdict)}">
    <p class="task"><span class="title">${esc(r.title)}</span> <span class="meta">${esc(r.owner)}, overdue ${days(r.due, today)} days</span></p>
    <p>${badge(r)}</p>
    <p class="why">${esc(r.why)}</p>${flags}${sugg}
    ${evidence(r)}
  </div>`;
}

function replaySection(replay, today) {
  if (!replay) return '';
  return `<section class="replay" aria-labelledby="replay-h">
  <h2 id="replay-h">One verdict, replayed</h2>
  <p>Every verdict comes from a fixed table of rules applied to checks anyone can rerun. Change one piece of evidence and the verdict changes with it.</p>
  <input type="radio" name="replay" id="as-is" checked><label for="as-is">As checked</label>
  <input type="radio" name="replay" id="missing"><label for="missing">Pretend the commit is missing</label>
  <div class="states">
    <div class="state-real">${card(replay.actual, today)}</div>
    <div class="state-sim">${card(replay.simulated, today)}<p class="cmd">Same as <code>node bin/triage.mjs --explain ${esc(replay.actual.id)} --simulate ${esc(replay.simulate)}</code></p></div>
  </div>
</section>`;
}

function distribution(meta, total) {
  const parts = VERDICTS.filter(([v]) => meta.counts[v]);
  return `<div class="bar" role="img" aria-label="${parts.map(([v]) => `${meta.counts[v]} ${v}`).join(', ')}">${parts.map(([v]) => `<span data-verdict="${v}" style="flex-grow:${meta.counts[v]}"></span>`).join('')}</div>
  <ul class="legend">${parts.map(([v, l]) => `<li><span class="swatch" data-verdict="${v}"></span>${meta.counts[v]} ${esc(v)} <span class="gloss">${esc(l)}</span></li>`).join('')}</ul>
  <p class="sub">${total} overdue tasks triaged. Nothing was written to the registry: a person ticks the decisions, then <code>--apply</code> closes or drops only those.</p>`;
}

export function toHtml({ report, replay }) {
  const { meta, rows } = report;
  const groups = VERDICTS.filter(([v]) => rows.some((r) => r.verdict === v)).map(([v, l, d]) => `
  <section class="group" aria-labelledby="g-${esc(v)}">
    <h3 id="g-${esc(v)}"><span class="swatch" data-verdict="${esc(v)}"></span>${esc(v)} <span class="gloss">${esc(l)}</span></h3>
    <p class="sub">${esc(d)}</p>
    ${rows.filter((r) => r.verdict === v).map((r) => `<details><summary><span class="title">${esc(r.title)}</span> <span class="meta">${esc(r.owner)}, overdue ${days(r.due, meta.today)} days${r.suggestion ? `, suggestion ${esc(r.suggestion.kind)}` : ''}</span></summary>${card(r, meta.today)}</details>`).join('')}
  </section>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>proof-triage demo</title>
<meta name="description" content="Triage overdue tasks on evidence a machine can check. Demo on synthetic data.">
<style>
:root{--bg:#F2F4F7;--surface:#FFFFFF;--ink:#16212F;--muted:#566173;--rule:#D3D9E1;--close:#1E6B4E;--drop:#6B7280;--blocked:#9C6212;--check:#3B5A85;--resched:#7A4A7C;--focus:#3B5A85}
@media (prefers-color-scheme:dark){:root{--bg:#121820;--surface:#1A222D;--ink:#E6EBF1;--muted:#9AA6B5;--rule:#2C3743;--close:#5DBA94;--drop:#9CA3AF;--blocked:#D9A050;--check:#86A8D8;--resched:#C493C6;--focus:#86A8D8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:2.5rem 1rem 4rem}
h1,h2,h3{font-family:Charter,"Bitstream Charter","Sitka Text",Cambria,Georgia,serif;font-weight:700;line-height:1.2;margin:0}
h1{font-size:2.6rem;letter-spacing:-.01em}
h2{font-size:1.6rem;margin:2.75rem 0 .5rem}
h3{font-size:1.2rem;margin:2rem 0 .25rem;display:flex;align-items:baseline;gap:.5rem}
p{margin:.5rem 0}
.lede{font-size:1.15rem;color:var(--muted);max-width:36rem}
code{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:.88em;overflow-wrap:anywhere}
.sub,.meta,.gloss,.detail,.none,.cmd{color:var(--muted)}
.gloss{font-family:system-ui,sans-serif;font-weight:400;font-size:.9rem}
[data-verdict="clore"]{--v:var(--close)}[data-verdict="sans-objet"]{--v:var(--drop)}[data-verdict="bloquée-user"]{--v:var(--blocked)}[data-verdict="à-vérifier"]{--v:var(--check)}[data-verdict="replanifier"]{--v:var(--resched)}
.badge{display:inline-block;border:2px solid var(--v);color:var(--v);border-radius:.4rem;padding:.1rem .55rem;font-weight:700}
.badge .gloss{color:var(--v)}
.card{background:var(--surface);border-left:6px solid var(--v);border-radius:0 .5rem .5rem 0;padding:1rem 1.1rem;margin:.75rem 0}
.task .title{font-weight:650}
.why{font-size:1.02rem}
.flag{display:inline-block;border:1px solid var(--rule);border-radius:1rem;padding:0 .55rem;font-size:.85rem;color:var(--muted)}
.suggestion{border-top:1px dashed var(--rule);padding-top:.5rem}
.chain{width:100%;border-collapse:collapse;margin-top:.75rem;font-size:.92rem}
.chain th{text-align:left;font-weight:600;color:var(--muted);border-bottom:1px solid var(--rule);padding:.3rem .5rem .3rem 0}
.chain td{vertical-align:top;border-bottom:1px solid var(--rule);padding:.45rem .5rem .45rem 0}
.quote{font-style:italic;max-width:18rem}
.quote::before{content:"\\201C"}.quote::after{content:"\\201D"}
.state{font-weight:700}
.state[data-state="present"],.state[data-state="found"],.state[data-state="ok"]{color:var(--close)}
.state[data-state="absent"],.state[data-state="gone"],.state[data-state="refused"],.state[data-state="error"]{color:var(--blocked)}
.replay input{position:absolute;opacity:0}
.replay label{display:inline-block;margin:.5rem .5rem 0 0;padding:.45rem .9rem;border:2px solid var(--ink);border-radius:2rem;cursor:pointer;font-weight:600}
.replay input:checked+label{background:var(--ink);color:var(--bg)}
.replay input:focus-visible+label{outline:3px solid var(--focus);outline-offset:2px}
.state-sim{display:none}
#missing:checked~.states .state-real{display:none}
#missing:checked~.states .state-sim{display:block}
.bar{display:flex;height:1.4rem;border-radius:.35rem;overflow:hidden;margin:1rem 0 .5rem}
.bar span{background:var(--v)}
.legend{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.35rem 1.25rem}
.swatch{display:inline-block;width:.8rem;height:.8rem;border-radius:.2rem;background:var(--v);margin-right:.4rem}
details{border-bottom:1px solid var(--rule)}
summary{cursor:pointer;padding:.6rem 0}
summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.rules{width:100%;border-collapse:collapse;font-size:.92rem}
.rules th,.rules td{text-align:left;vertical-align:top;border-bottom:1px solid var(--rule);padding:.45rem .6rem .45rem 0}
footer{margin-top:3rem;border-top:1px solid var(--rule);padding-top:1rem;color:var(--muted);font-size:.92rem}
a{color:var(--check)}
@media (max-width:40rem){h1{font-size:2rem}.chain thead{display:none}.chain tr{display:block;padding:.4rem 0;border-bottom:1px solid var(--rule)}.chain td{display:block;border:0;padding:.1rem 0}}
</style></head><body><main>
<header>
  <h1>proof-triage</h1>
  <p class="lede">Closes an overdue backlog on evidence a machine can check, not on age: a delivered file, a commit that touches it, a URL that answers.</p>
</header>
${replaySection(replay, meta.today)}
<section aria-labelledby="all-h">
  <h2 id="all-h">The whole triage</h2>
  ${distribution(meta, meta.overdueTotal)}
  ${groups}
</section>
<section aria-labelledby="rules-h">
  <h2 id="rules-h">How a verdict is decided</h2>
  <p>Rules are tried in this order; the first that matches wins. A language model never decides.</p>
  <table class="rules"><tbody>
    <tr><th scope="row">check by hand</th><td>Proof and a written blocker at once, a cited commit that does not exist, or a delivered URL that is gone.</td></tr>
    <tr><th scope="row">drop</th><td>The task was moved elsewhere, or a sentence opens with “replaced by”, “cancelled because” or “migrated to”.</td></tr>
    <tr><th scope="row">blocked on a person</th><td>An explicit blocker is written in the notes.</td></tr>
    <tr><th scope="row">close, high</th><td>A delivered file exists and a commit that touches that file exists.</td></tr>
    <tr><th scope="row">close, medium</th><td>A delivered file exists, plus an unrelated commit or a delivered URL that answers.</td></tr>
    <tr><th scope="row">check by hand, low</th><td>Some progress is visible but the proof is not enough.</td></tr>
    <tr><th scope="row">reschedule</th><td>An agent’s task with no evidence and no blocker.</td></tr>
  </tbody></table>
</section>
<footer>
  <p>Synthetic data: no real task appears on this page. The notes are in French because the evidence patterns are. Generated by <code>node bin/demo.mjs</code>.</p>
  <p>Source code, MIT license: <a href="https://github.com/editrtrain-art/proof-triage">github.com/editrtrain-art/proof-triage</a></p>
</footer>
</main></body></html>
`;
}
