# proof-triage — architecture (v0.2, 2026)

Journal des décisions et mesures sur un registre réel : `ARCHITECTURE.local.md` (local, ignoré par git).

## 1. Pourquoi
Un registre de tâches en ajout seul accumule des retards dont une partie est déjà faite, bloquée ou sans objet. Relire chaque note à la main ne tient pas. Les outils existants jugent par LLM (file de relecture, politique écrite). **Notre angle** : la preuve vient d'un contrôle déterministe et rejouable, le LLM n'est jamais juge, et chaque verdict montre ses pièces (extrait de note → contrôle → résultat).

Sur un registre réel de plusieurs centaines de tâches, les signaux les plus fréquents dans les notes sont, dans l'ordre : un chemin de fichier, un blocage écrit, un SHA de commit, une condition datée, une URL. Le contrôle de fichier et de commit porte donc l'essentiel ; l'URL est opt-in.

## 2. Flux
```
registre ─► sources.load() ─► core.selectOverdue() ─► core.claims() ─► checks ─► core.decide() ─► report
(lecture)    toutes les tâches   N en retard,            chemins, SHA,      fichier,   table de règles   report.json
             + empreinte         plus anciennes          blocages, URL      commit,    pure + preuves    + triage.md
                                                         tours du user      URL        + suggestion
```
Écriture (v0.2), séparée : `triage.md` coché par le user ─► `core.planApply()` ─► `core.applyOp()` ─► `sources.save()`.

## 2bis. Couches
```
bin/            CLI minces : options, assemblage, aucune logique métier (triage.mjs, task.mjs)
src/core/       PUR, sans fs ni réseau : select, patterns (motifs versionnés), extract, verdict, ops, apply
src/sources/    ADAPTATEURS de registre, un par format : load() → {meta, tasks, byId, hash, doc} ; save()
src/checks/     CONTRÔLEURS par type : file, commit, url
src/report/     RENDUS : json (contrat versionné par schemaVersion), md
src/lib/        config locale, convention de nommage des sorties
```
- **Aucun import hors du dépôt** ; le code repris d'ailleurs est recopié avec sa provenance en commentaire.
- **Aucun chemin machine dans le code** : tout vient de la config ou des options.
- **Ajouter un format de registre ou un contrôle = ajouter un fichier**, sans modifier `core/`.
- **`report.json` porte un `schemaVersion`** : c'est le contrat lu par les outils en aval (tableau de bord).
- **CI** : `node --test` sur Node 20, 22 et 24, Ubuntu et Windows, fixtures synthétiques seulement.

## 3. Modules et contrats
| Fichier | Contrat |
|---|---|
| `src/sources/ops-tasks-json.mjs` | `load(path)` → `{meta, tasks, byId, hash, doc}` (`tasks` normalisées pour le tri, `doc` brut pour l'écriture) ; `unchanged(path, hash)` ; `save(path, doc, {expectHash, backupDir, stamp?})` |
| `src/core/select.mjs` | `selectOverdue(tasks, {today, limit})` : statuts `todo`, `doing`, `open` dont `due` < aujourd'hui, triés par `due` puis priorité |
| `src/core/extract.mjs` + `patterns.mjs` | `claims(task)` → `{paths, shas, urls, blockers, obsolete, dateConditions, links, userTurns, userDone}`, chaque `Claim = {value, role, snippet[, n]}` (`n` = numéro de phrase) |
| `src/checks/file.mjs` | `checkFile(p, {root, refuseSegments, under})` → `{state: present|absent|refused, real}` |
| `src/checks/commit.mjs` | `checkCommit(sha, {root, repos, paths})` → `{state: found|absent|refused|error, repo, touches, reason?}` |
| `src/checks/url.mjs` | `checkUrl(u, {fetch, lookup})` → `{state, status}` ; `classify(status)` |
| `src/core/verdict.mjs` | `decide(task, claims, results, {today, byId})` → `{verdict, confidence, flags, evidence, why, suggestion}` |
| `src/core/ops.mjs` | `applyOp(doc, op, {today})` → nouveau document (`add`, `close`, `cancel`, `reschedule`, `reassign`, `delete` avec `confirm`) ; `validate(doc)` ; `taskHash(task)` |
| `src/core/apply.mjs` | `planApply(report, ids, doc)` → `{ops, skipped}` |
| `src/report/json.mjs`, `md.mjs` | `toReport(rows, meta)` (`schemaVersion: 1`, `meta.tool`, `meta.counts`, `meta.suggestions`) ; `toMarkdown(report)` ; `checkedIds(md)` |
| `src/lib/config.mjs` | `loadConfig(path, registry?)` → `{cfg, root, registry, outDir(window, date), pruneBackups(today)}` |

### Rôle d'un chemin
- chemin du champ `source` → `context` : **jamais une preuve**.
- chemin des notes dans la même phrase qu'un verbe de livraison accomplie (`livré`, `écrit`, `créé`, `inséré`, `publié`, `posé`, `commité`, `rédigé`, `généré`, `ajouté` ; `PRODUIT` et `FAIT` en majuscules de statut seulement) → `deliverable` ; une négation juste avant (« aucun commit », « pas encore livré », « n'a pas été écrit ») annule le verbe.
- autre chemin des notes → `mention` ; un chemin cité plusieurs fois garde son rôle le plus fort.
- une mise à jour se coupe sur ` | ` et ` || ` ; un premier segment en forme de domaine est une URL sans schéma, pas un chemin.
- absent à la racine, un chemin est cherché dans le dépôt d'un commit trouvé qui le touche, et seulement là, avec les mêmes refus.

### Rôle d'une URL
- `deliverable` dans une phrase de livraison ou « en ligne » (sauf « pas encore en ligne », « à mettre en ligne ») ; sinon `mention`. Seule une URL `deliverable` prouve (ligne 3b) ou contredit (ligne 0).

### Rôle d'un SHA
- hexa de 7 à 40 caractères avec au moins un chiffre, jamais juste après `sha256` ; une lettre a-f est en plus exigée hors phrase « commit » (un SHA court sur ~27 n'a que des chiffres).
- rôle `commit` si la phrase dit « commit », « commité » ou « poussé » ; sinon `hex`, qui ne compte que si git le trouve.
- un contrôle git en panne donne `error` avec sa cause (`reason`), jamais `absent`.

### Formule sans-objet
- « remplacé par », « annulé car », « migré vers » doivent OUVRIR la phrase (après une date ou « cette tâche est ») : « D-10 remplacée par D-17 » remplace un élément, pas la tâche.

## 4. Verdicts (déterministes, évalués dans cet ordre)
| # | Verdict | Condition | Confiance |
|---|---|---|---|
| 0 | `à-vérifier` (contradiction) | une preuve ET un blocage ; ou un commit cité absent ; ou une URL livrée `gone` | — |
| 1 | `sans-objet` | `migratedTo` renseigné, ou formule sans-objet en tête de phrase | moyenne |
| 2 | `bloquée-user` | blocage explicite : `GATÉ`/`gated`, `bloqué par`, `en attente de`, `IRRÉDUCTIBLEMENT USER`, `RESTE(NT) … USER` ; un « RESTE » seul est un rappel | moyenne |
| 3 | `clore` | un `deliverable` présent ET un commit trouvé qui **touche ce chemin** | haute |
| 3b | `clore` | un `deliverable` présent ET (commit trouvé sans lien au chemin OU URL livrée `ok`) | moyenne |
| 4 | `à-vérifier` (avancement) | un chemin présent, ou un commit trouvé, ou une URL livrée `ok`, sans preuve suffisante | basse |
| 5 | `replanifier` | owner `claude`, aucune preuve, aucun blocage | basse |
| 6 | `à-vérifier` | tout le reste | — |

Drapeaux cumulables : `contradiction`, `avancement`, `condition-échue` (`J+N`, `sinon`, `fenêtre`, `expire` avec une date calculable dépassée ; « avant le JJ/MM » seul est une échéance), `récurrente` (une tâche récurrente ne se clôt jamais sur une occurrence), `geste-user-restant`.

Ordre du rapport : `clore`, `sans-objet`, `bloquée-user`, puis le reste.

### Suggestions (pas des verdicts)
Pour une tâche `claude` ouverte dont la suite revient au user (« à valider par le user », « geste user », « RESTE USER »…) :
- la phrase cite une AUTRE tâche `user` encore ouverte → `dépend-de <id>` (réaffecter serait faux : Claude reprend après le geste) ;
- sinon → `réaffecter-user` + drapeau `geste-user-restant`.
Un tour du user accompli (« validé par le user », « geste user fait ») annule les tours écrits avant lui, sauf s'il est nié (« pas encore validé ») ou à venir (« sera validé »). Rien pour une tâche `clore` ou `sans-objet`. Les suggestions passent par `task reassign`, jamais par `--apply`.

## 5. Sécurité et confiance
- Notes = entrée non fiable : rien n'y est exécuté ; tout texte rendu dans `triage.md` est échappé (une note ne peut pas fabriquer une case cochée).
- Chemins : refus des chemins absolus, UNC, `..` et des segments refusés avant tout accès disque ; chemin canonique (liens et jonctions résolus) contrôlé sous la racine ; contenu jamais lu.
- Git : `execFile` sans shell, arguments fixes, SHA validé, variables `GIT_*` retirées, `GIT_CEILING_DIRECTORIES`, `core.fsmonitor` coupé.
- URL (opt-in) : `http(s)`, `redirect: 'manual'`, chaque cible revalidée, IPv4 privées et réservées refusées, IPv6 hors unicast globale refusée, nom résolu vers une IP privée refusé, 8 s, séquentiel, corps jamais lu.
- Écriture : contrôle d'empreinte avant et juste avant le renommage, validation du schéma, sauvegarde des octets d'origine, écriture atomique, fichier temporaire toujours retiré ; sauvegardes de plus de `backupKeepDays` (30 par défaut) purgées, et seulement les leurs.

## 6. Tests (`node --test`)
- `test/fixtures/registry-sample.json` : registre SYNTHÉTIQUE, une tâche par ligne du tableau §4 et par piège connu.
- Un fichier de test par module ; git testé sur des dépôts jetables, URL par un faux `fetch` et un faux résolveur.
- `cli.test.mjs` : bout en bout dans une racine jetable qui est un dépôt git (les `{{SHA}}` de la fixture y sont remplacés par de vrais SHA), y compris `--explain --simulate` et `--apply`.

## 7. Démo (3 min, sur la fixture)
1. `node bin/triage.mjs` → `triage.md` : décompte par verdict, un `clore` haute confiance avec sa preuve en trois temps.
2. `--explain <id> --simulate commit=absent` : le même `clore` bascule en `à-vérifier`. Un juge LLM ne peut pas rejouer ainsi son raisonnement.
3. Cocher une case, `--apply --dry-run`, puis `--apply`.

## 8. Feuille de route
- **v0.1** tri seul · **v0.2** écriture (`task`, `--apply`), suggestions, panneau de tableau de bord (livrées).
- **v0.3** (en cours) : adaptateurs de registre (liste Markdown, GitHub Issues), résumé LLM des notes longues (résume, ne décide jamais), démo web statique générée à partir de la fixture synthétique seulement.
- Reporté : lecture du contenu des fichiers, conséquences orphelines croisées sur tout le registre, levée automatique d'un blocage quand sa pièce existe.
