# Doctor, Reset, And Local Cloudflare Procedure

This document defines the common procedure set for DevGov-registered local services.

## Procedure Fields

Each service onboarding record must describe:

- `healthProcedure`: the safe read-only check, usually a loopback or public health URL.
- `doctorProcedure`: the diagnostic command or checklist. Doctor may inspect and report; repair must be explicitly bounded.
- `resetProcedure`: the reset, restart, recover, republish, or clear-state policy.
- `startupProcedure`: the reviewed start or ensure path.
- `dashboardProcedure`: how DevGov surfaces the service and why dashboard execution is or is not allowed.
- `cloudflareProcedure`: local Cloudflare Tunnel, Access, and public-route handling.

## Reset Semantics

`REVIEW_REQUIRED` in a reset or restart procedure means:

- a candidate reset/restart path exists or is expected
- DevGov has not approved automatic execution
- the dashboard must not execute it directly
- an operator or reviewed apply path must define command boundaries, rollback expectations, log handling, and credential safety first

This status is intentionally different from `MISSING`. `MISSING` means no stable reset/start path is known. `REVIEW_REQUIRED` means a path exists, but it can change local runtime state and still needs an execution gate.

## Doctor Rules

Doctor checks should be safe by default:

- read registry data and generated reports
- check local listener and health endpoints
- validate startup references and route metadata
- report missing config without printing secret values
- write evidence under `reports/`

Doctor repair may only make explicitly documented local repairs. Regenerating report artifacts is acceptable. Restarting a service, clearing queues, deleting runtime state, editing tunnel configs, or changing startup registration needs a separate reviewed reset/start procedure.

## Local Cloudflare Architecture

Use this model for local services exposed through Cloudflare:

1. The local service binds to a governed loopback origin such as `127.0.0.1:<port>`.
2. `registry/ports.registry.json` owns the local origin allocation.
3. `registry/public-routes.registry.json` owns hostname, tunnel, local target, exposure class, Access requirement, health URL, and review status.
4. Cloudflare credential files, tunnel config paths, certs, private keys, and API tokens remain out of canonical registry data.
5. Generated scans and host-local evidence stay in `reports/`.
6. Public health routes should expose only minimal readiness data and must not provide command execution.
7. Protected app/API routes should require Cloudflare Access unless a route is intentionally classified as public health.
8. Tunnel restart or ingress changes require backup/rollback evidence before apply.

## Service Review Checklist

Before moving a service toward `READY`, confirm:

- health procedure is safe and deterministic
- Doctor procedure exists and is read-only by default
- reset procedure is either explicitly disabled or marked `REVIEW_REQUIRED`
- startup procedure uses a stable reviewed reference
- Cloudflare procedure matches local/public exposure
- dashboard status row does not expose unsafe execution
- registry validation and Doctor pass
