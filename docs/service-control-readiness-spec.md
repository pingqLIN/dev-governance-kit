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

## UI Rules

- `Network Service Status` must render `Quick Test` as a table column, not as a standalone action button.
- The `Quick Test` cell should show health, Doctor, restart, and readiness together for each service.
- The dashboard must not expose one-click restart until a separate reviewed apply path defines command boundaries, permissions, backup or rollback expectations, and audit evidence.

## API Rules

- `/api/service-status` may run health checks and return readiness metadata.
- `/api/service-status` must not execute restart commands.
- Machine-local paths, complete launch commands, credential paths, tokens, process IDs, logs, and temporary evidence remain outside canonical registry data.

## Verification

Before accepting a change to this feature, run:

```powershell
npm test
npm run validate:registry
npm run doctor
```

For UI changes, also verify the dashboard in a browser and confirm that the service table shows the `Quick Test` column and no standalone quick-test restart control.
