# AGENTS.md

## Project Role

`dev-governance-kit` manages reusable development-environment governance assets.

The current project scope covers local development-environment governance:

- discover project port usage
- maintain a canonical port registry
- audit Windows Terminal profile asset references
- inventory Codex-created or development startup entries
- inventory Git linked worktrees without double-counting repositories
- manage Cloudflare/public route governance records
- generate local static document-search artifacts
- validate conflicts and required fields
- generate templates that agents can follow before starting services

## Source Of Truth

- Canonical shared data belongs in `registry/`.
- Reusable generated/project-facing assets belong in `templates/`.
- Runtime or scan evidence belongs in `reports/`.
- Machine-local paths, personal notes, and unpublished plans must stay out of canonical registry data.

This mirrors the UniText registry model: shared content is canonical, local overlays are separate, and verification scripts prove that artifacts remain usable.

## Data Entry Contract

Registry entries are system-management records, not prose notes. Port entries must preserve these fields:

- `project`
- `service`
- `port`
- `host`
- `visibility`
- `protocol`
- `source`
- `notes`

Use stable project identifiers rather than local machine paths. Put environment-specific paths, process IDs, generated audits, and temporary investigations in `reports/` or local notes, not in `registry/`.

Terminal profile, startup, and public-route registries follow the same rule: canonical records use stable IDs and reviewed policy fields only. Full Windows paths, Terminal settings paths, complete launch commands, Cloudflare credential paths, process IDs, and temporary discovery evidence belong in `reports/`.

Worktree reports also stay in `reports/`. They may include machine-local paths because they are local evidence, not canonical registry data.

## Port Governance Rules

1. Read `registry/ports.registry.json` before changing port allocation rules.
2. Do not add random or auto-increment fallback ports.
3. Default development host is `127.0.0.1`.
4. Any `0.0.0.0` binding must be documented with `visibility` and `notes`.
5. Do not run target project config files while scanning them.
6. Do not print secrets from `.env` files; only port and host related values may appear in reports.
7. Keep existing project scans read-only unless a future command explicitly supports reviewed patch generation.
8. Version 1 does not include an `apply-project` command; all target-project edits remain manual and review-gated.

## Terminal, Startup, Public Route, And Search Rules

1. Terminal profile scans are audit-first. Do not modify Windows Terminal settings unless an explicit reviewed apply command is requested.
2. Before applying any Terminal settings fix, create a timestamped backup next to the settings file.
3. Startup scans may inspect Startup folder entries, Registry Run entries, Scheduled Tasks, and Windows services, but full command lines stay in reports only.
4. Cloudflare route scans must not read or print credential JSON, certs, private keys, API tokens, or PEM contents.
5. Public routes must document exposure class, Access requirement, health URL, and review status before promotion into `registry/public-routes.registry.json`.
6. Static document search generation writes local artifacts under `reports/` and must not start a service or allocate a port.

## Worktree Governance Rules

1. Worktree scans are read-only and must not remove, prune, stage, commit, reset, checkout, or discard files.
2. Count projects by Git common-dir, not by checkout folder count.
3. Preferred worktree container pattern is `Q:\Projects\<repo-name>.worktrees\<task-or-branch>-<yyyyMMdd-HHmmss>`.
4. Existing `Q:\Projects\<repo-name>-worktrees\...` containers remain valid and should be scanned.
5. Treat `*.worktrees` and `*-worktrees` folders as operational storage, not standalone projects.
6. Cleanup recommendations are signals only; actual `git worktree remove` and `git worktree prune` operations require a separate review gate.
7. Dirty or unmerged worktrees must be backed up before removal decisions, with branch refs, patches, and local artifacts placed under a reviewed `.clean` location.

## Verification

Run these before reporting a completed batch:

```powershell
npm test
npm run validate:registry
```
