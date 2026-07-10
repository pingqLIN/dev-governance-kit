# CODEX.memory.rcg-hint

proposal-only template for Codex Resource Coordination Governance memory hints.

Do not write this template or a derived hint to real Codex memory unless the operator explicitly asks to update memory.

## Purpose

RCG memory hints are short-term soft awareness for concurrent local development. They help Codex reason that recent browser, GPU, foreground, DevTools, or local-model work in one project may affect another project's speed.

They are not:

- an authoritative current-state ledger
- a resource lock
- a transaction store
- a scheduling queue
- a task-dispatch gate

Eventual consistency, duplicate hints, missing hints, and delayed memory sync are acceptable because the hint only improves context quality.

## Hint Shape

```json
{
  "kind": "rcg-short-term-resource-hint",
  "project": "stable-project-id",
  "resourceClass": "browser-profile | gpu-rendering | foreground-control | local-model | devtools",
  "intent": "short sanitized description",
  "observedAt": "ISO-8601 timestamp",
  "validUntil": "ISO-8601 timestamp",
  "confidence": "observed | declared | inferred",
  "source": "codex-task | devgov-scan | dashboard-event",
  "authority": "soft-hint-only",
  "afterExpiry": "historical-only"
}
```

## Rules

- Write positive recent-use hints only; do not write "no current occupancy" or similar negative availability states.
- Include `observedAt` and `validUntil`; readers decide whether the hint is still fresh.
- Treat expired hints as historical context only.
- Missing hints do not prove that a resource is free.
- Do not include secrets, cookies, session data, credential paths, full commands, screenshots, personal activity, or machine-local paths.

Generate a proposal without writing memory:

```powershell
npm run scan:resource-coordination -- --memory-hint-proposal --memory-hint-project stable-project-id --memory-hint-resource-class browser-profile --memory-hint-intent "Browser automation smoke check"
```
