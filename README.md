# dev-governance-kit

`dev-governance-kit` is a local multi-project governance toolkit. It keeps development services, agents, Terminal profiles, startup automation, public routes, and local documentation search behind auditable sources of truth.

The project follows a UniText-like layout:

- `registry/` stores canonical shared data and is the only cross-project source of truth.
- `templates/` stores reusable project-facing read-model assets.
- `scripts/` stores verification and audit commands.
- `reports/` stores generated evidence and is ignored except for `.gitkeep`.

The toolkit is audit-first. Scanners produce evidence in `reports/`; reviewed records are promoted into `registry/`.

## Quick Start

Chinese key documents:

- [README.zh-TW.md](README.zh-TW.md)
- [AGENTS.zh-TW.md](AGENTS.zh-TW.md)
- [docs/onboarding-existing-projects.zh-TW.md](docs/onboarding-existing-projects.zh-TW.md)
- [templates/PORTS.zh-TW.md](templates/PORTS.zh-TW.md)
- [templates/AGENTS.port-governance.zh-TW.md](templates/AGENTS.port-governance.zh-TW.md)

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

## Safety Defaults

- Scans are read-only.
- Target project configuration is parsed as text or JSON and never executed.
- `.env` reports redact non-port and non-host values.
- `0.0.0.0` is treated as a visibility risk that must be documented.
- Automatic port fallback is flagged because it makes agent startup behavior ambiguous.
- Terminal settings are not modified by audit commands. `plan:terminal-fix` is dry-run unless explicitly run with `--apply`.
- Worktree audits are read-only and only recommend cleanup candidates; removal and prune steps remain review-gated.
- Generated reports are evidence, not canonical policy; promote intentional findings into `registry/*.registry.json` only after review.
