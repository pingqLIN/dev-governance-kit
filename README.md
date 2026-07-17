# DevGov

`DevGov` is a memorable user/home-level governance toolkit and dashboard. It keeps Global AGENTS planning, development services, local service agents, shared resource coordination, Terminal profiles, startup automation, public routes, development API key locations, AGENTS instruction governance, worktrees, self-checks, and local documentation search behind auditable sources of truth.

The repository is designed to live in user/home-level Codex storage rather than inside a single workspace project tree. It manages Global-layer planning, indexing, validation, and coordination; it does not silently rewrite the live Global AGENTS file or override platform/runtime instructions.

The project follows a UniText-like layout:

- `registry/` stores canonical shared data and is the only cross-project source of truth.
- `templates/` stores reusable project-facing read-model assets.
- `scripts/` stores verification and audit commands.
- `reports/` stores generated evidence and is ignored except for `.gitkeep`.

The toolkit is audit-first. Scanners produce evidence in `reports/`; reviewed records are promoted into `registry/`.

## Quick Start

Chinese companion and reference documents:

- [README.zh-tw.md](README.zh-tw.md)
- [AGENTS.zh-tw.md](AGENTS.zh-tw.md) is a human-readable reference only; [AGENTS.md](AGENTS.md) remains the authoritative agent-runtime instruction source.
- [PRODUCT.md](PRODUCT.md) captures the product context used by design and UI agents.
- [DESIGN.md](DESIGN.md) defines the DevGov design system; [registry/design-system.registry.json](registry/design-system.registry.json) is the reusable token sidecar.
- [docs/onboarding-existing-projects.zh-tw.md](docs/onboarding-existing-projects.zh-tw.md)
- [docs/codex-local-state-governance.md](docs/codex-local-state-governance.md)
- [docs/codex-local-state-governance.zh-tw.md](docs/codex-local-state-governance.zh-tw.md)
- [docs/context-budget-governance.md](docs/context-budget-governance.md)
- [docs/context-budget-governance.zh-tw.md](docs/context-budget-governance.zh-tw.md)
- [docs/resource-coordination-governance.md](docs/resource-coordination-governance.md)
- [docs/resource-coordination-governance.zh-tw.md](docs/resource-coordination-governance.zh-tw.md)
- [docs/chatgpt-governance-panel.md](docs/chatgpt-governance-panel.md)
- [docs/chatgpt-governance-panel.zh-tw.md](docs/chatgpt-governance-panel.zh-tw.md)
- [docs/local-antivirus-governance.md](docs/local-antivirus-governance.md)
- [docs/local-antivirus-governance.zh-tw.md](docs/local-antivirus-governance.zh-tw.md)
- [templates/PORTS.zh-tw.md](templates/PORTS.zh-tw.md)
- [templates/AGENTS.port-governance.zh-tw.md](templates/AGENTS.port-governance.zh-tw.md)
- [templates/AGENTS.resource-coordination.md](templates/AGENTS.resource-coordination.md)
- [templates/AGENTS.resource-coordination.zh-tw.md](templates/AGENTS.resource-coordination.zh-tw.md)
- [templates/CODEX.memory.rcg-hint.md](templates/CODEX.memory.rcg-hint.md)
- [templates/CODEX.memory.rcg-hint.zh-tw.md](templates/CODEX.memory.rcg-hint.zh-tw.md)
- [templates/CODEX.memory.rcg-update-gate.md](templates/CODEX.memory.rcg-update-gate.md)
- [templates/CODEX.memory.rcg-update-gate.zh-tw.md](templates/CODEX.memory.rcg-update-gate.zh-tw.md)

Scan one project without changing it:

```powershell
node scripts/scan-project.mjs Q:\Projects\some-project --out reports\some-project-port-audit.md
```

Scan a workspace:

```powershell
node scripts/scan-workspace.mjs Q:\Projects --out reports\workspace-port-audit.md
```

Validate the canonical registry:

```powershell
npm run validate:registry
```

Audit Windows Terminal profile assets:

```powershell
npm run scan:terminal -- --out reports\terminal-profile-audit.md
```

Create a reviewed Terminal settings fix plan:

```powershell
npm run plan:terminal-fix
```

Audit Codex/development startup surfaces:

```powershell
npm run scan:startup -- --out reports\startup-audit.md
```

Audit Cloudflare public route configs:

```powershell
npm run scan:public-routes -- --out reports\public-routes-audit.md
```

Audit development API key variable names and storage scopes without printing values:

```powershell
npm run scan:api-keys -- --project . --out reports\api-key-audit.md
```

Triage a local antivirus block without changing security settings:

```powershell
npm run av:triage -- -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -RebuildCommand "npm run build" -IncludeDefenderPreview
```

Use the Codex hook wrapper when the trigger comes from alert text or failed command output:

```powershell
npm run codex:av-hook -- -Product "Bitdefender" -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -AlertText "Bitdefender blocked generated build output" -RebuildCommand "npm run build"
```

Audit Git worktree inventory without double-counting linked worktrees:

```powershell
npm run scan:worktrees -- Q:\Projects --out reports\worktree-audit.md
```

Optional policy thresholds:

```powershell
npm run scan:worktrees -- Q:\Projects --out reports\worktree-audit.md --max-age-days 30 --max-linked-worktrees 3
```

Build the local static document search artifacts:

```powershell
npm run scan:docs
```

Build the local AGENTS instruction search artifacts:

```powershell
npm run scan:agents
```

Generate a proposal-only shared-resource overlay report for one AGENTS file:

```powershell
npm run scan:agents -- --agents-file path\to\AGENTS.md --resource-proposal-out reports\agent-resource-overlay.md
```

Audit observable local context-budget sources:

```powershell
npm run scan:context-budget
```

Capture a lightweight shared-resource contention snapshot:

```powershell
npm run scan:resource-coordination
```

Generate a proposal-only Codex memory hint for short-term RCG awareness:

```powershell
npm run scan:resource-coordination -- --memory-hint-proposal --memory-hint-project stable-project-id --memory-hint-resource-class browser-profile --memory-hint-intent "Browser automation smoke check"
```

Before any explicit memory-update workflow, review:

```text
templates/CODEX.memory.rcg-update-gate.md
```

After review, hand the exact proposal payload to `memory-field` or the runtime-owned memory update architecture. DevGov scanners, Doctor, dashboard refreshes, tests, and reports remain proposal-only and do not write real memory.

Audit supplementation gaps for already-registered services:

```powershell
npm run scan:service-onboarding
```

Start the local dashboard:

```powershell
npm run dashboard
```

Open the dashboard on demand and auto-start it if needed:

```powershell
npm run dashboard:open -- --open
```

Run the self-check and report system:

```powershell
npm run doctor
```

Regenerate repairable local report artifacts:

```powershell
npm run doctor:repair
```

Require a service to use its governed registry port before starting it:

```powershell
npm run port:preflight -- --project devgov --service dashboard-http --host 127.0.0.1 --port 3000 --protocol http
```

Use the same gate to launch a reviewed raw command only after the registry and TCP availability checks pass. The child process receives `HOST`, `PORT`, `DEVGOV_HOST`, `DEVGOV_PORT`, and related metadata from the registry:

```powershell
npm run port:preflight -- --project my-app --service web-http -- npm run dev:raw
```

Check ad hoc TCP availability when no registry entry is being launched:

```powershell
node templates/check-ports.mjs 3000,3201
```

## Port Ranges

| Service type | Range |
|---|---:|
| frontend | `3100-3199` |
| api/backend | `3200-3299` |
| db/cache/queue | `3300-3399` |
| preview/docs | `3400-3499` |
| agent/MCP/local tools | `3500-3599` |

Reserved DevGov service:

| Service | Host | Port | Notes |
|---|---|---:|---|
| dashboard-http | `127.0.0.1` | `3000` | Long-lived dashboard and Zero Trust protected public-route origin. The server fails fast if this port is occupied. |

## Dashboard And Startup

The dashboard entry point is `http://127.0.0.1:3000`. It reads canonical registry files directly and exposes `/health`, `/api/state`, `/api/local-agents`, `/api/resource-coordination`, and `/api/doctor` for local checks.

Local service agents are tracked in `registry/local-agents.registry.json`. These records identify resident loopback services such as Local Archive Maintainer without storing service-local homes, token files, logs, generated data, or full command lines in canonical registry data.

Agent instruction governance is tracked in `registry/agent-instructions.registry.json`. The dashboard includes an Agent Instructions view, `/api/agent-instructions` returns the source-of-truth layers, item types, and entries, and `/api/unitext-agent-instructions` exposes a UniText-style query index for local integration.

Shared resource coordination is tracked in `registry/resource-coordination.registry.json`. It defines the lightweight communication/read-model surface for concurrent LLM development sessions, including lag diagnosis, freshness rules, exclusive-resource registration for browser profiles, GPU-heavy rendering, and foreground screen control, plus proposal-only Codex memory hints for short-term soft awareness. The default scan is on-demand and small; memory hints are not authoritative state, locks, or scheduling gates. Real memory updates are outside DevGov and belong to `memory-field` or the runtime-owned memory update architecture after the reviewed gate. Scheduling remains a separate reviewed future apply path.

Project AGENTS rollout should stay thin. Use `templates/AGENTS.resource-coordination.md` as the manual overlay source and `npm run scan:agents -- --agents-file <path>` to produce a proposal report. The scanner does not apply changes to target projects.

Network service status is available in the Service Status view and `/api/service-status`. The `Quick Test` table column runs safe health checks and reports whether each service has a detected Doctor mechanism and restart readiness. Reviewed Doctor/restart controls attach to the status flag itself; one-click restart remains review-gated until the service has an approved restart command, backup/rollback expectation, and permission boundary. The standardized contract is documented in `docs/service-control-readiness-spec.md`, with the agent workflow in `registry/skills/service-control-readiness/SKILL.md`.

Existing-project supplementation is available in the Onboarding view and `/api/service-onboarding`. The read-only audit cross-checks `registry/ports.registry.json`, `registry/startup.registry.json`, `registry/public-routes.registry.json`, `registry/local-agents.registry.json`, and dashboard service-status rows so operators can quickly see which registered services still need Quick Test, Doctor, or startup supplementation.

Service onboarding procedures are tracked in `registry/service-onboarding.registry.json` and documented in `docs/service-onboarding/`. Each service record describes Health, Doctor, Reset, Startup, Dashboard, and Cloudflare handling. Reset/restart actions marked `REVIEW_REQUIRED` are candidate control paths only; they must not be executed from the dashboard or automation until command boundaries, rollback expectations, log handling, and credential safety are reviewed.

Local Cloudflare architecture rules are tracked in `registry/local-cloudflare.registry.json`. The expected model is a governed loopback origin in `registry/ports.registry.json`, public exposure in `registry/public-routes.registry.json`, review-gated startup/tunnel control in `registry/startup.registry.json`, and host-local evidence in `reports/`.

Development API key locations are tracked in `registry/api-keys.registry.json`. These records identify the service, variable name, storage location type, access method, usage rules, review status, and provider settings page. Credential values, credential file contents, local secret paths, shell history, and full command lines must stay out of canonical registry data.

Startup registration is review-gated. `scripts/register-dashboard-startup.ps1` can create or remove the Windows Startup entry when an operator explicitly runs it. The default on-demand path is `npm run dashboard:open -- --open`, which health-checks the dashboard and starts the loopback server only when needed.

The public `gov.colorgeek.co` and `dev.colorgeek.co` routes are also review-gated. `npm run gov:route:register` creates the user Startup entry that keeps the unified `127.0.0.1:3000` origin and dedicated Cloudflare Tunnel connector available after login; `npm run gov:route:remove` removes that entry.

## Doctor

`npm run doctor` validates the package identity, registry schemas, dashboard port allocation, startup governance records, API key governance records, AGENTS instruction governance records, resource-coordination governance records, required scripts including the antivirus dry-run entry, dashboard port availability, and document index buildability. It writes `reports/devgov-doctor-report.json`.

`npm run doctor:repair` is intentionally limited to local generated artifacts under `reports/`; it regenerates the static document search files without changing canonical registry data.

## Worktree Governance

Use repo-specific containers for linked worktrees:

```text
Q:\Projects\<repo-name>
Q:\Projects\<repo-name>.worktrees\<task-or-branch>-<yyyyMMdd-HHmmss>
```

Existing `Q:\Projects\<repo-name>-worktrees\...` containers are still valid and scanned for compatibility. New containers should prefer `.worktrees` because the folder sorts next to the owning repo and is clearly operational storage.

Run `scan:worktrees` at these checkpoints:

- before creating a batch of new worktrees
- before cleanup or consolidation
- before reporting workspace project counts
- during regular workspace hygiene reviews

The report uses these signals:

| Signal | Meaning |
|---|---|
| `Git entries` | All discovered Git checkouts and linked worktrees |
| `Unique Git repositories` | Project count after Git common-dir de-duplication |
| `Linked worktree entries` | Checkouts whose `--git-dir` differs from `--git-common-dir` |
| `Worktree containers` | Detected `*.worktrees` or `*-worktrees` folders |
| `Recommendation` | Review signal such as `within policy`, `cleanup candidate after branch/review check`, or `review dirty worktrees before cleanup` |

Cleanup remains manual and review-gated. For a candidate worktree, confirm the owning repo with `git worktree list --porcelain`, check `git status --short --branch`, back up dirty or unmerged work first, then use `git worktree remove <path>` only for reviewed clean worktrees. Run `git worktree prune` only after reviewed removals.

## Registry Entry Contract

Port service entries must include:

| Field | Meaning |
|---|---|
| `project` | Stable project name, not a machine-local path |
| `service` | Human-readable service name |
| `range` | Optional declared range key such as `frontend` or `api` |
| `port` | Integer from `1` to `65535` |
| `host` | Explicit host such as `127.0.0.1`, `0.0.0.0`, or a Docker-only host |
| `visibility` | `local`, `lan`, `public`, or `docker-internal` |
| `protocol` | `tcp`, `udp`, `http`, `https`, `ws`, or `wss` |
| `source` | File or policy that owns the allocation |
| `notes` | Required human context for why the allocation exists |

Additional registries use the same rule: canonical files contain stable identifiers and reviewed policy only. Machine-local paths, full command lines, Terminal settings paths, Cloudflare credential paths, and temporary scan evidence stay in `reports/`.

API key entries must include:

| Field | Meaning |
|---|---|
| `project` | Stable owner such as `system-environment`, not a machine-local path |
| `service` | Provider or tool that owns the credential |
| `variableName` | Environment variable name or stable secret handle, never the value |
| `credentialKind` | `api-key`, `token`, `secret`, `password`, `credential`, or `account-identity` |
| `storageLocation` | Storage location type such as Windows Machine environment variables |
| `accessMethod` | How local tools consume the credential |
| `settingsUrl` | Provider settings or dashboard page for review and rotation |
| `rules` | Handling, rotation, and promotion rules |
| `source` | Audit or policy that identified the record |
| `notes` | Required human context |

AGENTS instruction records live in `registry/agent-instructions.registry.json`. They classify durable AGENTS rules by scope layer and item type so they can be validated and exported into queryable local artifacts under `reports/`.

Global-layer management is a planning responsibility. DevGov may define taxonomy, readiness checks, query indexes, and reviewed promotion workflows for global-home instructions. Direct edits to the live Global AGENTS file remain explicit operator actions with a reviewed diff and rollback evidence.

## Safety Defaults

- Scans are read-only.
- Target project configuration is parsed as text or JSON and never executed.
- `.env` reports redact non-port and non-host values.
- API key scans report variable names and scopes only; values are neither printed nor promoted into registry data.
- `0.0.0.0` is treated as a visibility risk that must be documented.
- Automatic port fallback is flagged because it makes agent startup behavior ambiguous.
- DevGov dashboard startup is opt-in. The repo provides registration scripts, but audit commands do not silently modify Windows Startup settings.
- Terminal settings are not modified by audit commands. `plan:terminal-fix` is dry-run unless explicitly run with `--apply`.
- Worktree audits are read-only and only recommend cleanup candidates; removal and prune steps remain review-gated.
- Generated reports are evidence, not canonical policy; promote intentional findings into `registry/*.registry.json` only after review.
