# dev-governance-kit

`dev-governance-kit` is a local multi-project governance toolkit. The first release implements port governance so development services, agents, and humans can share one auditable source of truth.

The project follows a UniText-like layout:

- `registry/` stores canonical shared data and is the only cross-project source of truth.
- `templates/` stores reusable project-facing read-model assets.
- `scripts/` stores verification and audit commands.
- `reports/` stores generated evidence and is ignored except for `.gitkeep`.

Version 1 is audit-first. It does not patch target projects or apply workspace-wide changes.

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

## Registry Entry Contract

Every approved service entry must include:

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

## Safety Defaults

- Scans are read-only.
- Target project configuration is parsed as text or JSON and never executed.
- `.env` reports redact non-port and non-host values.
- `0.0.0.0` is treated as a visibility risk that must be documented.
- Automatic port fallback is flagged because it makes agent startup behavior ambiguous.
- Generated reports are evidence, not canonical policy; promote intentional findings into `registry/ports.registry.json` only after review.
