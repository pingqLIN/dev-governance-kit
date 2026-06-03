# AGENTS.md

## Project Role

`DevGov` manages reusable user/home-level development-governance assets.

This repository is intended to live under the operator's user/home-level Codex storage, such as a home-level governance folder. Its role is broader than one workspace repository but still below platform, system, developer, and runtime instructions.

The current project scope covers global-home and local development-environment governance:

- plan, classify, and audit Global AGENTS responsibilities
- maintain Global-layer governance records without copying machine-local instruction paths into canonical registry data
- provide queryable indexes for user/home-level instruction scope, item types, and evidence anchors
- discover project port usage
- maintain a canonical port registry
- audit Windows Terminal profile asset references
- inventory Codex-created or development startup entries
- inventory resident local service agents separately from ordinary services
- inventory development API key locations without reading or storing credential values
- inventory Git linked worktrees without double-counting repositories
- manage Cloudflare/public route governance records
- generate local static document-search artifacts
- govern AGENTS instruction scope, item types, and queryable indexes
- provide a local loopback dashboard on the reviewed long-lived `127.0.0.1:3000` port
- run self-check, limited self-repair, and local report generation through the Doctor command
- validate conflicts and required fields
- generate templates that agents can follow before starting services

## Source Of Truth

- Canonical shared data belongs in `registry/`.
- Reusable generated/project-facing assets belong in `templates/`.
- Runtime or scan evidence belongs in `reports/`.
- Machine-local paths, personal notes, and unpublished plans must stay out of canonical registry data.
- Canonical AGENTS item types and scope records belong in `registry/agent-instructions.registry.json`.
- Generated AGENTS search/index artifacts belong in `reports/`.
- `AGENTS.md` is the only authoritative agent-runtime instruction file in this repo.
- `AGENTS.zh-tw.md`, if present, is a human-readable reference only and is not required by the bilingual publishable-document rule.
- The live user/home-level Global AGENTS file remains an external runtime input. DevGov may plan, index, validate, and coordinate it, but must not claim ownership over platform/runtime authority or silently rewrite it.

This mirrors the UniText registry model: shared content is canonical, local overlays are separate, and verification scripts prove that artifacts remain usable.

## Instruction Scope And Precedence

DevGov can document and test observable file-based instructions, but agents must still honor higher runtime instructions first.

Use these scope layers when classifying AGENTS rules:

1. `platform-runtime`: platform, system, developer, runtime, and active tool instructions. These are authoritative even when not inspectable from repo files.
2. `global-home`: user-level or home-level AGENTS instructions loaded by the runtime.
3. `workspace`: workspace overlays such as shared storage topology, shell entry rules, and cross-repo conventions.
4. `repo-local`: this repository's authoritative `AGENTS.md`, README, registry contracts, and docs. `AGENTS.zh-tw.md`, when present, is reference material only.
5. `subtree`: future folder-local AGENTS overlays. These may narrow behavior for their subtree but must not bypass parent safety rules.
6. `task-request`: the current operator request. It can select work and narrow scope, but it cannot override safety, secret, publication, or reversibility rules.

When building an index or report, mark rules as `effective` only for paths inside their scope. Rules outside the target scope are `evidence-only`; missing or unreadable layers are `unresolved`, not invented.

## Global Management Planning

DevGov owns the planning surface for Global-layer AGENTS governance. That means it may:

- define the Global-layer taxonomy, readiness checks, and promotion workflow
- compare global-home rules against workspace, repo-local, subtree, and task-request layers
- generate local query artifacts that help operators inspect effective instruction scope
- recommend updates to the live Global AGENTS file through reviewed plans

DevGov must not silently edit the live Global AGENTS file, duplicate its full contents into canonical registry data, or treat Global-layer plans as higher authority than platform/runtime instructions. Any update to the live Global AGENTS file requires explicit operator intent, a reviewed diff, and rollback evidence.

## AGENTS Runtime Source

Agents must treat `AGENTS.md` as the single authoritative runtime instruction source for this repository.

`AGENTS.zh-tw.md` may exist to help human operators review the policy in Traditional Chinese, but it must not introduce rules that are absent from `AGENTS.md`. If the two files drift, `AGENTS.md` wins and the Traditional Chinese reference should be corrected or removed.

Do not require a Traditional Chinese companion for `AGENTS.md` in new repos by default. The bilingual public-document rule applies to human-facing operational or release documentation, not to agent-runtime instruction files unless a repo explicitly promotes such a companion as human reference material.

## External Review Adoption

This version adopts two external-review perspectives as durable policy:

1. Scope and safety review: make non-file runtime authority explicit, keep read-only audit behavior as the default, and verify every scope layer instead of assuming repo-local AGENTS covers the full stack.
2. Interoperability and search review: classify AGENTS rules by stable item type, generate a queryable text/JSON index, and keep UniText/project-map compatibility as an adapter concern rather than copying local-only evidence into canonical data.

Review packets and raw reviewer notes, when generated, belong in `reports/`. Only accepted, durable recommendations should be promoted into this file or `registry/agent-instructions.registry.json`.

## Execution Principles

- Prefer the narrowest existing DevGov command, scanner, registry validator, or template that matches the task.
- Keep scans and audits read-only unless an explicit reviewed apply path exists and the operator asked to use it.
- Treat generated `reports/` artifacts as evidence, not canonical policy.
- Promote only stable, reviewed records into `registry/`.
- Ask for clarification only when ambiguity materially changes risk, behavior, or output.

## Safety And Apply Gates

- Registry promotion requires reviewed stable IDs, required fields, and no machine-local paths or secret values.
- Terminal fixes, startup registration, public route promotion, and worktree cleanup require explicit operator intent before mutation.
- Any apply path that touches user configuration must create or identify a reviewable backup or rollback path first.
- Generated reports may contain machine-local evidence; canonical registry data must not.
- Public or shared outputs must exclude private planning notes, raw reviewer transcripts, secrets, and local-only paths.

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

Local service agent registry records follow the same rule. Do not store service-local homes, bearer token paths, logs, generated indexes, or full commands in `registry/local-agents.registry.json`.

API key registry records follow the same rule. Store only stable credential-location metadata such as service, environment variable name, storage location type, access method, rules, status, and provider settings URL. Do not store values, credential file contents, full local credential paths, shell history, or command lines in `registry/api-keys.registry.json`.

AGENTS instruction registry records follow the same rule. Store stable scope IDs, item types, requirements, enforcement notes, evidence anchors, status, and source labels. Do not store machine-local AGENTS paths, raw reviewer transcripts, full local command lines, or temporary investigation evidence in `registry/agent-instructions.registry.json`.

Worktree reports also stay in `reports/`. They may include machine-local paths because they are local evidence, not canonical registry data.

## Agent Instruction Registry Contract

Use these item types when promoting AGENTS rules into `registry/agent-instructions.registry.json`:

- `scope-layer`: where the instruction applies in the stack.
- `authority-order`: precedence, override limits, and conflict handling.
- `safety-gate`: review, backup, read-only, or explicit-operator requirements.
- `data-contract`: canonical fields, storage locations, and redaction boundaries.
- `workflow-control`: ordered scan, apply, repair, cleanup, or publication steps.
- `tool-entry`: correct tool or command entry path for a task class.
- `verification`: tests, validators, doctors, or generated artifacts required before completion.
- `interoperability`: alignment points with adjacent governance systems.
- `external-review-input`: adopted recommendations that changed durable policy.

Each promoted record must include a stable `id`, `type`, `layer`, `appliesTo`, `requirement`, `enforcement`, `evidence`, `status`, `source`, and `notes`.

Run `npm run scan:agents` after changing AGENTS governance. The command writes generated search artifacts to `reports/agent-instructions-index.json` and `reports/agent-instructions-index.txt`.

## Port Governance Rules

1. Read `registry/ports.registry.json` before changing port allocation rules.
2. Do not add random or auto-increment fallback ports.
3. Default development host is `127.0.0.1`.
4. The DevGov dashboard allocation is `127.0.0.1:3000`; do not silently choose another dashboard port.
5. Service startup commands should use a governed-port preflight entry such as `scripts/require-governed-port.mjs` before binding a reviewed port.
6. Any `0.0.0.0` binding must be documented with `visibility` and `notes`.
7. Do not run target project config files while scanning them.
8. Do not print secrets from `.env` files; only port and host related values may appear in reports.
9. Keep existing project scans read-only unless a future command explicitly supports reviewed patch generation.
10. Version 1 does not include an `apply-project` command; all target-project edits remain manual and review-gated.

## Terminal, Startup, Public Route, API Key, And Search Rules

1. Terminal profile scans are audit-first. Do not modify Windows Terminal settings unless an explicit reviewed apply command is requested.
2. Before applying any Terminal settings fix, create a timestamped backup next to the settings file.
3. Startup scans may inspect Startup folder entries, Registry Run entries, Scheduled Tasks, and Windows services, but full command lines stay in reports only.
4. Cloudflare route scans must not read or print credential JSON, certs, private keys, API tokens, or PEM contents.
5. Public routes must document exposure class, Access requirement, health URL, and review status before promotion into `registry/public-routes.registry.json`.
6. API key scans may record variable names and storage scopes, but must not print values. Process-only variables are report evidence unless an operator promotes them.
7. Static document search generation writes local artifacts under `reports/` and must not start a service or allocate a port.
8. Dashboard startup is opt-in. Registration scripts may write Windows Startup entries only when explicitly run by an operator.

## UniText Coordination

DevGov should coordinate with UniText when AGENTS governance needs shared visualization, shared adapter behavior, or cross-project source attribution. The current low-coupling path is:

1. DevGov owns the canonical AGENTS taxonomy in `registry/agent-instructions.registry.json`.
2. DevGov generates local query artifacts in `reports/`.
3. UniText project-map or governance-folder adapters may ingest those generated artifacts or the canonical registry when an operator explicitly points the adapter at this repo.
4. DevGov must not copy UniText local paths, generated browser state, or private planning notes into canonical registry records.

Coordination is not required for ordinary DevGov AGENTS edits. It is required before changing shared adapter contracts, adding a UniText dependency, or publishing generated governance views outside the local machine.

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
npm run scan:agents
npm run validate:registry
npm run doctor
```
