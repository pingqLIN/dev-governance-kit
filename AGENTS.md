# AGENTS.md

## Project Role

`dev-governance-kit` manages reusable development-environment governance assets.

Version 1 focuses only on port governance:

- discover project port usage
- maintain a canonical port registry
- validate conflicts and required fields
- generate templates that agents can follow before starting services

## Source Of Truth

- Canonical shared data belongs in `registry/`.
- Reusable generated/project-facing assets belong in `templates/`.
- Runtime or scan evidence belongs in `reports/`.
- Machine-local paths, personal notes, and unpublished plans must stay out of canonical registry data.

This mirrors the UniText registry model: shared content is canonical, local overlays are separate, and verification scripts prove that artifacts remain usable.

## Data Entry Contract

Port registry entries are system-management records, not prose notes. Every entry must preserve these fields:

- `project`
- `service`
- `port`
- `host`
- `visibility`
- `protocol`
- `source`
- `notes`

Use stable project identifiers rather than local machine paths. Put environment-specific paths, process IDs, generated audits, and temporary investigations in `reports/` or local notes, not in `registry/`.

## Port Governance Rules

1. Read `registry/ports.registry.json` before changing port allocation rules.
2. Do not add random or auto-increment fallback ports.
3. Default development host is `127.0.0.1`.
4. Any `0.0.0.0` binding must be documented with `visibility` and `notes`.
5. Do not run target project config files while scanning them.
6. Do not print secrets from `.env` files; only port and host related values may appear in reports.
7. Keep existing project scans read-only unless a future command explicitly supports reviewed patch generation.
8. Version 1 does not include an `apply-project` command; all target-project edits remain manual and review-gated.

## Verification

Run these before reporting a completed batch:

```powershell
npm test
npm run validate:registry
```
