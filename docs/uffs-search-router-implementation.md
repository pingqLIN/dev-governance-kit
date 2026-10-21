# UFFS Search Router — Phase 2 Canary

**Status: implemented as a trusted-host local prototype; NOT active Global AGENTS policy.**

Source: scripts/lib/uffs-search-router.mjs
Tests: tests/uffs-search-router.test.mjs
Authority: docs/uffs-agent-search-governance.md

## API and boundaries

Import createSearchRouter from the source module. Construct a trusted host policy with allowedRoots (Windows canonical directory roots), optionally uffsExecutable (local path to installed CLI) and enableFullDriveUFFS (default false). Invoke search with request.intent, request.scope, request.pattern and optional request.limit (1–200, default 50). The model MUST NOT be permitted to construct the trusted policy. This in-process module is neither an access-control replacement nor a public service.

Response includes status, provider, matches (metadata only), count, reason, coverage, observedAt and optionally routingReason. Possible statuses: found, not_found_with_coverage, partial, denied, unavailable, error, routed, not_required. The routed status means a provider was selected; its query has NOT executed.

## Current implementation

- Intent none: do not search.
- Intent ntfs-metadata and approved directory subtree: bounded, read-only native filesystem filename enumeration, with no content reads; no UFFS full-drive search occurs.
- Intent ntfs-metadata and explicitly approved entire indexed drive, with enableFullDriveUFFS true: check a running daemon and indexed drive, then run UFFS CLI with argument arrays and NDJSON output. Limit results to requested count plus one backend row for partial detection.
- Intent content/git: validate approved local root, return routing hint for authorized-content-search or git-aware-search; **not executed**.
- Intent semantic/external: route to provider-native search; **not executed**.

Scope resolution uses Windows path boundaries, realpath, directory-type checks and a sensitive-path deny list. The native walker skips junctions/reparse-point symlinks and notes partial coverage if traversal is incomplete, access is denied, or search budgets are exhausted. Results from UFFS are filtered to the authorized volume and sensitive paths are suppressed. This is not a proof of OS ACL enforcement or a safe remote/multi-tenant endpoint.

A complete UFFS subtree pre-query filter has NOT been verified; the adapter therefore never runs full-drive UFFS on behalf of a restricted project subtree. If a whole-drive index is unavailable, it does not recursively scan the whole drive. An UFFS zero-result query is partial (index freshness not verified), not proof of absence. A race between probing daemon readiness and CLI invocation could still auto-start the daemon; no side-effect-free no-autostart mechanism has been proven.

## Live host evidence on 2026-10-21

UFFS v0.6.44 daemon Ready; loaded C:, E:, F:, not D:.
- D: project subtree searched for the router source file: found (native-fs), one matching file, complete.
- Explicit full C: search for notepad.exe: found (uffs-cli), five visible results, result cap means coverage incomplete.
- Explicit full D: search for registry JSON filename: unavailable, not incorrectly not_found.
- New unit tests: 11 passing at initial canary check.

## Validation commands

From D:/projects/.worktrees/devgov-uffs-search-20261021:

~~~powershell
node --test tests/uffs-search-router.test.mjs
npm run validate:registry
npm run scan:agents
npm test
~~~

Dependencies may not be installed in a fresh Git worktree. Resolve this safely without modifying the already-dirty main worktree.

## Promotion blockers

1. Trusted principal-to-Local-Files-alias resolver and root allowlists that cannot be supplied by the model.
2. Verified backend pre-query subtree restriction and query coverage tests before supporting UFFS for narrow project roots.
3. Local-only, scoped Agent/stdio MCP binding, no raw exposed UFFS HTTP interface.
4. Windows reparse-point / TOCTOU hardening, no-autostart handling, performance/resource gates and failure-state logging.
5. End-to-end authorization and p50/p95 baseline; reviewed promotion to canonical registry and Global AGENTS as a separate apply stage.
