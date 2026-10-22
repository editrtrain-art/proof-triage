# proof-triage

Proposes a verdict for each overdue task of a JSON task registry, from evidence a machine can check (delivered file, commit that touches it, URL that answers). Read-only: it never writes to the registry.

Status: v0.1 in progress (building day, 2026). Design: `ARCHITECTURE.md` (French). Rules for agents: `CLAUDE.md`.

```
cp proof-triage.config.example.json proof-triage.config.json   # then edit the paths
node bin/triage.mjs --limit 20
node --test test/
```
