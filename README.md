# proof-triage

Proposes a verdict for each overdue task of a JSON task registry, from evidence a machine can check: a delivered file, a commit that touches it, a URL that answers. The triage itself is read-only; since v0.2 it can apply the decisions the user ticked, and a `task` command edits one task at a time.

Status: v0.1 (2026). Design and verdict rules: `ARCHITECTURE.md` (French). Rules for agents: `CLAUDE.md`.

## Use

```
cp proof-triage.config.example.json proof-triage.config.json   # then edit the paths
node bin/triage.mjs --limit 20                 # oldest 20 overdue tasks
node bin/triage.mjs --explain <task-id>        # replay one verdict with its evidence
node bin/triage.mjs --explain <task-id> --simulate commit=absent   # counterfactual
node --test
```

Writing to the registry (v0.2), always after a backup of the original bytes:

```
node bin/triage.mjs --apply <triage dir> --dry-run   # preview the boxes ticked in triage.md
node bin/triage.mjs --apply <triage dir>             # clore -> done, sans-objet -> cancelled
node bin/task.mjs close|cancel <id> [--note "..."]
node bin/task.mjs reschedule <id> --due YYYY-MM-DD
node bin/task.mjs reassign <id> --owner user|claude   # act on a "réaffecter-user" suggestion
node bin/task.mjs add <id> --title "..." --due YYYY-MM-DD --owner claude|user [--recurrence monthly]
node bin/task.mjs delete <id> --confirm             # prefer cancel
```

Options: `--limit N` (default 20) · `--today YYYY-MM-DD` · `--registry <file>` · `--net` (check cited URLs, off by default) · `--config <file>` · `--simulate file|commit|url=<state>` (repeatable).

Output: `<outDir>/proof-triage-<registry>-top<N>[-net][-sim]-<date>/` with `report.json` (`schemaVersion: 1`, `meta.tool = "proof-triage"`) and `triage.md`. `AUDIT_DIR` overrides the output root.

## Verdicts

| Verdict | When |
|---|---|
| `clore` | a deliverable path is present AND a found commit touches it (high), or a commit/live URL without link to the path (medium) |
| `sans-objet` | `migratedTo` set, or the notes open a sentence with "remplacé par / annulé car / migré vers" |
| `bloquée-user` | an explicit blocker is written ("GATÉ", "bloqué par", "en attente de", "RESTE … USER") |
| `à-vérifier` | evidence and blocker together, a cited commit or URL missing, progress without proof, or nothing checkable |
| `replanifier` | owner `claude`, no evidence, no blocker |

Flags: `contradiction`, `avancement`, `condition-échue`, `récurrente`, `geste-user-restant`. A recurring task is never closed.

Suggestions (not verdicts) for a `claude` task whose next step belongs to the user: `réaffecter-user`, or `dépend-de <id>` when that step is another open user task. They are never applied by `--apply`.

## Guarantees

- Triage opens the registry read-only; its SHA-256 is checked again at the end of the run.
- Backups older than `backupKeepDays` (default 30) are pruned after each successful write; only this registry's backup folders are touched.
- Writes (v0.2) go through one function: it refuses a registry changed since it was read and an invalid document, backs up the original bytes, then writes atomically. `--apply` acts only on boxes the user ticked, only for `clore` and `sans-objet`, and never on a task changed since the triage.
- Notes are data, never instructions: nothing from them is executed. Paths that are absolute, contain `..` or a `.secrets` segment, or resolve outside the root are refused without being opened. File contents are never read.
- `git` runs through `execFile` with fixed arguments, a regex-validated SHA and `GIT_*` variables removed.
- Network is off unless `--net`: GET only, manual redirects revalidated, no local, private or link-local host, 8 s timeout, one request at a time, no cookies.
- Zero dependencies, Node ≥ 20. Tests run on synthetic fixtures only.
