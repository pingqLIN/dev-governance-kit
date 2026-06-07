# Service Onboarding Records

This folder records the current onboarding plan for services that already exist in DevGov registries.

The canonical machine-readable source is `registry/service-onboarding.registry.json`. Generated evidence remains in `reports/service-onboarding-audit.json` and `reports/service-onboarding-audit.md`. The shared Doctor/reset/Cloudflare procedure is defined in `docs/service-onboarding/doctor-reset-cloudflare.md`.

## Review Rule

Each service record must be reviewed after its procedure is created or updated. Review means checking that:

- the service is still present in `registry/ports.registry.json`
- health, Doctor, startup, and dashboard procedures are explicit
- reset and Cloudflare procedures are explicit
- machine-local paths, credentials, process IDs, logs, and temporary probe details are not promoted into canonical registry data
- dashboard restart remains disabled unless a later reviewed apply path approves execution

## Current Batch

| Service | Readiness | Review | Next action |
|---|---|---|---|
| `devgov:dashboard-http` | `READY` | `reviewed` | Keep as reference implementation. |
| `local-archive-maintainer:app-server-http` | `PARTIAL` | `needs-implementation` | Add/register project Doctor. |
| `codex-calendar-todo:staging-http` | `PARTIAL` | `needs-implementation` | Wrap runtime operations as Doctor. |
| `codex-remote:remote-services-http` | `PARTIAL` | `needs-implementation` | Reconcile `/health` vs `/healthz` and add Doctor. |
| `tb2:tb2-mcp-http` | `BLOCKED` | `needs-implementation` | Promote TB2 status/start scripts as stable refs. |
| `taste:web-http` | `BLOCKED` | `needs-implementation` | Promote `runtime:check` as Doctor and add start governance. |
| `lm-studio:local-api-http` | `BLOCKED` | `needs-owner` | Confirm startup owner for the external app. |
| `color-management-Shader:display-shader-control-lab-http` | `BLOCKED` | `needs-implementation` | Convert PORTS verification into Doctor/start procedure. |
| `sbs:local-proxy-http` | `BLOCKED` | `needs-implementation` | Promote existing proxy Doctor scripts. |
| `url-hero:vite-dev` | `BLOCKED` | `needs-implementation` | Add governed dev-server wrapper and Doctor. |
| `video-render-kit:control-panel-http` | `BLOCKED` | `needs-owner` | Locate source owner or retire placeholder. |

## Batch Review

This batch is reviewed as a DevGov planning and recording change only. It does not mutate target projects, does not register new startup entries, and does not enable dashboard restart execution.
