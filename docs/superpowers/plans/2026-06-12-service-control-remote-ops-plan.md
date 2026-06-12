# Service Control And Remote Ops Implementation Plan

> **Status:** Draft for external review  
> **Mode:** YOLO execution after plan review  
> **Scope:** DevGov dashboard control surface, read-only health/doctor observation, reviewed restart execution, and rollout across registered services

## Goal

Extend DevGov from a read-only service-status dashboard into a reviewed local control plane that can:

1. show reliable `Health`, `Doctor`, and `Restart` readiness for registered services
2. execute real restart or recovery actions from the dashboard when and only when a reviewed apply path exists
3. keep non-approved services clearly blocked or review-gated instead of silently exposing unsafe controls
4. scale the model across the currently registered dashboard, local-agent, and public-route targets

The final target is not "every row has a button." The final target is "every registered service has the strongest safe control surface the current evidence supports."

## Why The Current UI Cannot Do This Yet

Current DevGov intentionally stops at observation:

- `scripts/lib/dashboard-core.mjs` renders `restart.ref` as a reference link, not an action
- `scripts/serve-dashboard.mjs` has no mutable service-control endpoint
- `docs/service-control-readiness-spec.md` explicitly forbids one-click restart before a separate reviewed apply path exists
- many registered services have a health URL but no registered Doctor wrapper
- several services have startup references but those references are install/startup registration scripts, not stable restart wrappers

So the missing piece is not "make the link clickable." The missing piece is a reviewed service-control architecture.

## Current Service Inventory Snapshot

Observed from current `checkServiceStatuses(...)` output, with an important caveat:

- current `controlReadiness` is metadata-derived, not recomputed from live health probe results
- so `READY` and `PARTIAL` currently mean "registered control metadata exists" more than "operator-trustworthy actionable state"

Phase 1 must correct that semantic gap before the dashboard is used as an execution surface.

### Strongest current metadata baseline

- `DevGov Dashboard`
  - Health: live local health exists
  - Doctor: `FOUND`
  - Restart: currently modeled as `FOUND`, but that evidence is closer to bounded on-demand start/open than a full reviewed restart contract
  - Readiness: strongest current baseline, but should not be described as fully execution-ready until the model and action semantics are corrected

### Partial candidates after model correction

- `Local Archive Maintainer`
  - Health: available
  - Doctor: missing
  - Restart: `REVIEW_REQUIRED`
  - Candidate only after a dedicated Doctor wrapper and a service-safe restart wrapper replace the current install-script gate

- `codex-remote.colorgeek.co`
  - Health: available
  - Doctor: missing
  - Restart: `REVIEW_REQUIRED`
  - Candidate only after health contract reconciliation and restart ownership are defined

### Strong non-dashboard onboarding candidate

- `tunnel-client-local-filesystem-mcp`
  - Onboarding record is already `READY`
  - Has concrete health, Doctor, and startup procedures in DevGov records
  - If scope expands beyond currently surfaced service-status rows, this is the strongest non-DevGov implementation candidate

### Blocked or incomplete

- `gov.colorgeek.co`
- `dev.colorgeek.co`
- `tb2.colorgeek.co`
- `tb2-health-staging.colorgeek.co`
- `codex-calendar-todo-staging.colorgeek.co`
- `taste.colorgeek.co`
- `lmstudio.colorgeek.co`

These mostly have health-only or route-only registration and still lack enough reviewed control metadata for dashboard execution.

### Deprecated or should not gain control features

- `mcp.colorgeek.co`
  - Registry status is `deprecated`
  - Do not add restart execution

## Non-Negotiable Rules

1. Keep `/api/service-status` read-only.
2. Real execution must use a separate apply endpoint.
3. Apply endpoints must be allowlisted per service.
4. GET links must never execute restart actions.
5. Canonical registry data must continue to exclude machine-local command lines, token paths, logs, and private runtime evidence.
6. Services without reviewed wrappers remain `REVIEW_REQUIRED`, `MISSING`, or `DISABLED`.
7. Public-route rows do not automatically imply restart permission for their upstream local service.
8. Deprecated or policy-blocked services must be hard-disabled in the control model, not merely shown as weak candidates.

## Proposed Architecture

### 1. Split observation from execution

Keep:

- `GET /api/service-status`
- `GET /api/service-onboarding`
- `GET /api/doctor`

Add:

- `POST /api/service-control/restart`
- optional later: `POST /api/service-control/doctor-repair`
- optional later: `POST /api/service-control/quick-fix`

Only the new control endpoint may execute local commands.

### 1.1 Network boundary correction

Do **not** place mutable control endpoints on the same listener that is already exposed through `gov.colorgeek.co` and `dev.colorgeek.co`.

Execution should start with **local-only control, remote observation**:

1. preferred: a second local-only control listener bound to `127.0.0.1` on a separate governed port, never published through Cloudflare
2. fallback only after review: path-isolated control endpoints on the same listener, but only with explicit authentication, origin checks, CSRF protection, and route-level publication review

The first implementation slice should assume pattern 1.

### 2. Introduce reviewed control wrappers

Each executable service needs a narrow wrapper owned by DevGov, not an arbitrary repo script reference.

Examples:

- `scripts/service-control/restart-devgov-dashboard.ps1`
- `scripts/service-control/restart-local-archive-maintainer.ps1`
- `scripts/service-control/restart-codex-remote.ps1`

Wrapper requirements:

- one service only
- stable exit codes
- structured stdout or JSON summary
- preflight checks
- bounded side effects
- no credential printing
- no install/registration side effects unless explicitly intended
- documented rollback or recovery expectation

### 2.1 Add a runtime authority resolver

Canonical registry data cannot hold machine-local command lines, secret-bearing paths, or full runtime authority. So reviewed wrappers must resolve runtime ownership through a separate local resolver layer.

Add a local-only resolver surface, for example:

- `scripts/lib/service-control-resolver.mjs`
- optional ignored local config if a target needs machine-local resolution

Resolver requirements:

- map a stable control target to the real local runtime authority
- fail closed when runtime ownership is unknown
- distinguish install/setup scripts from true restart-safe entrypoints
- keep machine-local paths and private command details out of canonical registry files

### 3. Introduce an execution manifest

Add a reviewed control manifest or registry file, for example:

- `registry/service-control.registry.json`

Each entry should define:

- `controlTargetId`
- `surfaceTargets`
- `action`
- `approved`
- `wrapperRef`
- `resolverRef`
- `inputContract`
- `auditLevel`
- `timeoutSeconds`
- `rollbackNotes`
- `uiLabel`
- `requiresConfirmation`
- `status`

`controlTargetId` must be a dedicated stable identity, not a reused `serviceId`, because current dashboard, startup, public-route, and local-agent surfaces name the same logical service differently.

This prevents `dashboard-core.mjs` from inferring executable commands from startup references.

### 4. Dashboard UI model

In `Network Service Status`:

- keep `Quick Test` as the combined readiness column
- when restart is not approved, show the current reference/gate state
- when restart is approved, render a real action button that calls `POST /api/service-control/restart`
- show in-progress, success, and failure states inline
- persist recent execution events into a dedicated server-authored control log, not `reports/web-console-events.json`

### 5. Server execution model

In `scripts/serve-dashboard.mjs`:

- validate request payload
- resolve only allowlisted service/action pairs
- spawn the reviewed wrapper
- capture bounded stdout/stderr
- return structured result
- log a sanitized event record
- enforce server-side auth and anti-CSRF checks if any control endpoint ever shares a listener with browser-served pages

Do not:

- accept arbitrary file paths
- accept arbitrary shell commands
- pass raw user text into PowerShell
- rely on UI-only confirmation metadata as the execution gate

## Delivery Phases

### Phase 0: Plan, review, and branch hygiene

- keep current in-progress UI batch isolated
- review this plan externally
- decide whether to stay in current thread or move deep multi-repo rollout into `/new`

### Phase 0.5: Correct the readiness baseline before adding execution

Repo changes:

- recompute or derive operator-facing readiness from live health state plus metadata, not metadata alone
- add service identity normalization across dashboard, startup, local-agent, public-route, and onboarding surfaces
- dedupe observational hostname aliases by upstream controllable service
- hard-disable deprecated or intentionally blocked targets in the rendered control model

Acceptance:

- `READY` no longer means "has a URL plus metadata"
- route-backed services resolve through a stable normalized control identity
- observational aliases such as `gov.colorgeek.co` / `dev.colorgeek.co` and `tb2.colorgeek.co` / `tb2-health-staging.colorgeek.co` do not inflate rollout target counts
- deprecated services such as `mcp.colorgeek.co` do not appear as future execution candidates

### Phase 1: Framework for approved control actions

Repo changes:

- add control registry or manifest
- add a local-only control listener or equivalent hardened control boundary
- add server-side `POST /api/service-control/restart`
- add shared execution helpers
- add UI action rendering for approved restart actions
- add tests proving non-approved services still cannot execute

Acceptance:

- dashboard can execute a reviewed restart action for one approved service
- `/api/service-status` remains read-only
- GET links remain references only
- control execution is not reachable through the currently published Cloudflare dashboard hostnames

### Phase 2: First approved service implementations

Target order:

1. `devgov-dashboard` with explicitly narrowed local start/open or bounded recovery semantics
2. `tunnel-client-local-filesystem-mcp` if onboarding-only services are included in the first execution wave
3. `codex-calendar-todo-staging-http` if scope must stay limited to currently listed dashboard/public-route services
4. `local-archive-maintainer` only after Doctor and restart wrapper prerequisites are added
5. `codex-remote` only after health contract and restart ownership are reconciled

Why this order:

- DevGov already has the strongest local control evidence, but today that evidence more clearly supports bounded start/open semantics than an unrestricted stop/start restart claim
- `tunnel-client-local-filesystem-mcp` already has the strongest non-DevGov onboarding evidence set if we choose to include non-surfaced services in the first implementation wave
- `codex-calendar-todo-staging-http` already has a stable public health route and named runtime status evidence, so it is lower-stall than `codex-remote`
- Local Archive Maintainer already has health and service identity, but still needs Doctor and a restart-safe wrapper
- codex-remote already has route health and a startup candidate, but still lacks a reconciled durable health contract and bounded restart meaning

Acceptance per service:

- health URL works
- Doctor wrapper exists or is explicitly `MISSING`
- dedicated reviewed restart wrapper exists
- service-control manifest marks restart `approved`
- dashboard action works end to end

### Phase 3: Doctor coverage expansion

For each registered service, add the strongest realistic Doctor surface:

- repo-native `npm run doctor`
- PowerShell doctor wrapper
- stable docs reference when a doctor exists but must remain manual

Important:

- do not fake `FOUND`
- if only health exists, Doctor stays `MISSING`

### Phase 4: Public-route and external-project expansion

For route-backed services:

- map route row to owned local upstream service
- determine whether restart belongs to DevGov, startup governance, or external project
- add action only when DevGov can safely invoke a reviewed local wrapper

Blocked examples likely need repo-side work before DevGov can finish:

- `tb2`
- `codex-calendar-todo-staging`
- `taste`
- `lmstudio`

Also treat these as prerequisite cases, not near-term restart candidates:

- `local-archive-maintainer` until Doctor wrapper and restart-safe service wrapper exist
- `codex-remote` until `/health` vs `/healthz` vs `/readyz` is reconciled and restart ownership is defined

### Phase 5: Remote confirm, detect, repair, restart

Longer-term target:

- health = remote confirm
- doctor = project detection and diagnosis
- doctor repair = bounded repair path where reviewed
- restart = bounded service recovery path where reviewed

Not every service will reach all four layers in one pass. Some will stop at:

- `Health only`
- `Health + Doctor`
- `Health + Doctor + Restart`

That is acceptable if the registry and UI describe it honestly.

## File Plan

### New or likely-new files

- `registry/service-control.registry.json`
- `scripts/lib/service-control-core.mjs`
- `scripts/lib/service-control-resolver.mjs`
- `scripts/service-control/restart-devgov-dashboard.ps1`
- `scripts/service-control/restart-local-archive-maintainer.ps1`
- `scripts/service-control/restart-codex-remote.ps1`
- `docs/service-control-apply-spec.md`
- `docs/service-control-apply-spec.zh-tw.md`

### Existing files likely to change

- `scripts/serve-dashboard.mjs`
- `scripts/lib/dashboard-core.mjs`
- `scripts/lib/doctor-core.mjs`
- `registry/service-onboarding.registry.json`
- `registry/startup.registry.json`
- `registry/local-agents.registry.json`
- `registry/public-routes.registry.json`
- `tests/environment-governance.test.mjs`
- additional tests as needed for endpoint behavior and wrapper resolution

## External Review Packet

The review should explicitly answer:

1. Is the control architecture safe enough for local execution?
2. Is `service-control.registry.json` the right separation from startup and onboarding data?
3. Are the proposed wrappers narrow enough?
4. Does the UI preserve the observation-vs-execution boundary?
5. Which services should stay blocked until external repo work exists?

External review findings accepted into this plan:

1. mutable control endpoints must not share the currently Cloudflare-published dashboard trust boundary by default
2. server-side auth/origin/CSRF enforcement matters more than UI confirmation metadata
3. execution needs a separate local runtime-authority resolver
4. execution audit must not share storage with untrusted browser event posts
5. control identity must be normalized beyond existing `serviceId`/`project`/`startupRef` shapes
6. the current readiness model overstates actionability because it does not incorporate live-health truth strongly enough

Required review quality:

- substantive findings only
- ack-only or timeout reviewer output does not count

## Validation Matrix

Minimum repo validation after each meaningful slice:

```powershell
npm test
npm run validate:registry
npm run doctor
```

For UI and runtime slices also verify in browser:

- approved action button appears only for approved services
- blocked services still show `REVIEW_REQUIRED`, `MISSING`, or `DISABLED`
- clicking approved action runs a real bounded operation
- action result is visible and logged

## Known Likely Blockers

1. Some registered services live in external repos that may not expose a safe doctor or restart wrapper yet.
2. Some startup references are install/setup scripts, not restart-safe entry points.
3. Some public routes map to services with unclear ownership or unclear startup authority.
4. Some services may need repo-side changes outside DevGov before DevGov can expose dashboard control safely.
5. The current public DevGov listener is also the Cloudflare-published observation surface, so any mutable endpoint on that listener expands the trust boundary immediately.
6. Current readiness semantics and route-to-startup identity mismatches can overstate candidate quality until normalized.

When this happens, pause and surface:

- blocker summary
- options
- recommended next move

## Recommendation On `/new`

Do **not** switch to `/new` yet.

Reason:

- this thread already contains the active repo context, recent UI/control discussion, and the current in-progress `dashboard-core.mjs` batch
- the immediate next step is plan review plus first-framework implementation in the same repo

Use `/new` later only if one of these becomes true:

1. we split into a dedicated long-running multi-repo rollout
2. we need a separate autonomous lane focused on a different upstream project
3. this thread becomes too noisy to safely track execution gates

## First Implementation Slice After Review

After external review, implement this smallest end-to-end slice first:

1. add `service-control.registry.json`
2. correct readiness semantics and identity normalization first
3. add a local-only control listener or equivalent hardened control boundary
4. add `POST /api/service-control/restart`
5. add approved wrapper for `devgov-dashboard`
6. narrow the first DevGov action semantics to the reviewed bounded operation the current evidence actually supports
7. add UI action rendering for approved restart entries
8. add tests for approved vs blocked actions and no-remote-execution behavior
9. validate in browser

This gives one real executable control path without pretending the whole service list is already ready.
