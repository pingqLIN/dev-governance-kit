---
name: service-control-readiness
description: Use when adding, reviewing, or standardizing DevGov service status rows that combine safe health checks with Doctor and restart readiness detection without executing restarts.
---

# Service Control Readiness

Use this skill when work touches DevGov `Network Service Status`, `/api/service-status`, service health checks, Doctor detection, restart readiness, or one-click service-control proposals.

## Core Rules

1. Treat service control readiness as observation first. Do not add restart execution unless the user explicitly asks for a reviewed apply path.
2. Keep `Quick Test` as a per-service table column and API field, not a standalone restart-like action.
3. Health checks may call registered health URLs. They must not run project commands.
4. Mark restart as `REVIEW_REQUIRED` when a startup or service reference exists but dashboard execution has not been approved.
5. Keep machine-local paths, full commands, credentials, process IDs, logs, and temporary evidence out of canonical registry data.

## Field Contract

Each service row should expose:

- `quickTest.state`: `ONLINE`, `OFFLINE`, `ERROR`, `CHECKING`, or `MISSING`
- `quickTest.url`: safe health URL
- `doctor.state`: `FOUND`, `MISSING`, or `NOT_APPLICABLE`
- `doctor.ref`: stable npm script, script path, registry ID, or documentation reference
- `restart.state`: `FOUND`, `MISSING`, `DISABLED`, or `REVIEW_REQUIRED`
- `restart.ref`: stable startup or restart reference when available
- `controlReadiness`: `READY`, `PARTIAL`, or `BLOCKED`

## Readiness Derivation

- `READY`: quick test is available, Doctor is `FOUND`, and restart is `FOUND`.
- `PARTIAL`: quick test is available and at least one control mechanism is `FOUND` or `REVIEW_REQUIRED`.
- `BLOCKED`: quick test is unavailable, Doctor is `MISSING`, and restart is `MISSING` or `DISABLED`.

## Workflow

1. Read `docs/service-control-readiness-spec.md`.
2. Inspect `registry/startup.registry.json`, `registry/local-agents.registry.json`, and `registry/public-routes.registry.json`.
3. Update `scripts/lib/dashboard-core.mjs` so readiness is derived from stable registry fields.
4. Keep `/api/service-status` read-only.
5. Add or update tests for API shape, UI rendering, and restart non-execution.
6. Run `npm test`, `npm run validate:registry`, and `npm run doctor`.
