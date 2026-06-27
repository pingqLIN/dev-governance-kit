# Service Control Readiness Spec

This spec standardizes how DevGov reports service health checks, Doctor availability, and restart readiness in the dashboard and query APIs.

## Scope

Service control readiness is an observation model. It tells an operator whether a service has safe health checks and reviewed control mechanisms. It does not grant restart permission by itself.

## Status Fields

Each service status row must expose:

- `quickTest.state`: `ONLINE`, `OFFLINE`, `ERROR`, `CHECKING`, or `MISSING`
- `quickTest.url`: the health URL used by the safe network check
- `doctor.state`: `FOUND`, `MISSING`, or `NOT_APPLICABLE`
- `doctor.ref`: stable npm script, script path, registry ID, or documentation reference
- `restart.state`: `FOUND`, `MISSING`, `DISABLED`, or `REVIEW_REQUIRED`
- `restart.ref`: stable startup or restart reference when available
- `restart.policyReadiness`: review metadata for executable restart controls when available
- `controlReadiness`: `READY`, `PARTIAL`, or `BLOCKED`

`controlReadiness` is derived:

- `READY`: quick test is available, Doctor is `FOUND`, and restart is `FOUND`.
- `PARTIAL`: quick test is available and Doctor or restart is `FOUND` or `REVIEW_REQUIRED`.
- `BLOCKED`: quick test is unavailable, Doctor is `MISSING`, and restart is `MISSING` or `DISABLED`.

## Detection Rules

- Quick Test uses a network health URL only.
- Doctor is `FOUND` only when a stable project Doctor mechanism is registered or known in the current project.
- Restart is `FOUND` only when a stable reviewed start/restart mechanism exists.
- Restart is `REVIEW_REQUIRED` when a startup or service reference exists but is not safe for dashboard execution.
- Restart is `DISABLED` when policy intentionally forbids dashboard restart even if supporting scripts exist.
- Reset/restart operations are separate from Doctor. A reset path marked `REVIEW_REQUIRED` is a candidate control path, not an approved dashboard action.
- Executable restart controls require an approved registry entry with permission boundary, backup expectation, and rollback expectation review metadata.

## UI Rules

- `Network Service Status` must render `Quick Test` as a table column, not as a standalone action button.
- The `Quick Test` cell should show health, Doctor, restart, and readiness together for each service.
- Status labels and executable controls must not be duplicated in the same cell. When Doctor or restart is approved for execution, the status flag itself becomes the one-click control and carries the reviewed-control marker.
- The dashboard must not expose one-click restart until a separate reviewed apply path defines command boundaries, permissions, backup or rollback expectations, and audit evidence. Services without complete review metadata stay `REVIEW_REQUIRED` or disabled.
- Protected DevGov dashboard public origins may be allowed as browser Origins for the loopback service-control listener, but the service-control listener itself must remain loopback-only and must not be published as a Cloudflare route.

## API Rules

- `/api/service-status` may run health checks and return readiness metadata.
- `/api/service-status` must not execute restart commands.
- `/api/service-onboarding` may run a read-only supplementation audit for already-registered services.
- Machine-local paths, complete launch commands, credential paths, tokens, process IDs, logs, and temporary evidence remain outside canonical registry data.

## Reset And Cloudflare Rules

- Doctor is read-only by default; Doctor repair must be narrowly documented.
- Reset means restart, recover, republish, clear runtime state, or repair startup/tunnel state.
- Reset is `REVIEW_REQUIRED` until command boundaries, rollback expectations, log handling, and credential safety are reviewed.
- Cloudflare local architecture must keep governed loopback origins in `ports.registry.json` and public exposure in `public-routes.registry.json`.
- Cloudflare credential files, tunnel config paths, certs, private keys, API tokens, process IDs, and local logs stay in reports or local evidence, not canonical registries.

## Existing Project Supplementation

Use `npm run scan:service-onboarding` or the dashboard Onboarding view to audit already-registered services. The supplementation audit should cross-check:

- `registry/ports.registry.json`
- `registry/startup.registry.json`
- `registry/public-routes.registry.json`
- `registry/local-agents.registry.json`
- surfaced Service Status rows and their readiness fields

## Verification

Before accepting a change to this feature, run:

```powershell
npm test
npm run validate:registry
npm run doctor
```

For UI changes, also verify the dashboard in a browser and confirm that the service table shows the `Quick Test` column, no duplicated Doctor/Restart action label under the status flag, and no executable restart control for services without complete review metadata.
