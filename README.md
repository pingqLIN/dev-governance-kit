# DevGov

`DevGov` is a memorable local multi-project governance toolkit and dashboard. It keeps development services, local service agents, Terminal profiles, startup automation, public routes, development API key locations, AGENTS instruction governance, worktrees, self-checks, and local documentation search behind auditable sources of truth.

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
- [docs/onboarding-existing-projects.zh-tw.md](docs/onboarding-existing-projects.zh-tw.md)
- [docs/codex-local-state-governance.md](docs/codex-local-state-governance.md)
- [docs/codex-local-state-governance.zh-tw.md](docs/codex-local-state-governance.zh-tw.md)
- [templates/PORTS.zh-tw.md](templates/PORTS.zh-tw.md)
- [templates/AGENTS.port-governance.zh-tw.md](templates/AGENTS.port-governance.zh-tw.md)

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

Check declared ports before starting a service:

```powershell
node templates/check-ports.mjs 3101,3201
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
| dashboard-http | `127.0.0.1` | `3101` | Long-lived loopback dashboard. The server fails fast if this port is occupied. |

## Dashboard And Startup

The dashboard entry point is `http://127.0.0.1:3101`. It reads canonical registry files directly and exposes `/health`, `/api/state`, `/api/local-agents`, and `/api/doctor` for local checks.

Local service agents are tracked in `registry/local-agents.registry.json`. These records identify resident loopback services such as Local Archive Maintainer without storing service-local homes, token files, logs, generated data, or full command lines in canonical registry data.

Agent instruction governance is tracked in `registry/agent-instructions.registry.json`. The dashboard includes an Agent Instructions view, `/api/agent-instructions` returns the source-of-truth layers, item types, and entries, and `/api/unitext-agent-instructions` exposes a UniText-style query index for local integration.

Network service status is available in the Service Status view and `/api/service-status`. The dashboard supports one-click quick health tests. One-click restart is intentionally disabled until each service has a reviewed restart command, backup/rollback expectation, and permission boundary.

Development API key locations are tracked in `registry/api-keys.registry.json`. These records identify the service, variable name, storage location type, access method, usage rules, review status, and provider settings page. Credential values, credential file contents, local secret paths, shell history, and full command lines must stay out of canonical registry data.

Startup registration is review-gated. `scripts/register-dashboard-startup.ps1` can create or remove the Windows Startup entry when an operator explicitly runs it. The default on-demand path is `npm run dashboard:open -- --open`, which health-checks the dashboard and starts the loopback server only when needed.

## Doctor

`npm run doctor` validates the package identity, registry schemas, dashboard port allocation, startup governance records, API key governance records, AGENTS instruction governance records, required scripts, dashboard port availability, and document index buildability. It writes `reports/devgov-doctor-report.json`.

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
