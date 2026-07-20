# Live Governance Test Lanes

This document defines the explicit opt-in boundary for DevGov tests that contact live endpoints or execute reviewed service controls. The ordinary `npm test` command remains the safe default and does not discover the opt-in files.

## Test lanes

| Command | Default behavior | Effects |
| --- | --- | --- |
| `npm test` | Runs automatically | Static, fixture, registry, scanner, and non-live governance tests only. |
| `npm run test:live-governance` | Skips unless armed | Runs local and public health probes, Chrome AI storage quickcheck, dashboard health, and port availability checks. |
| `npm run test:service-controls` | Skips unless armed | Executes reviewed Doctor controls and the DevGov dashboard ensure-running Restart control. It can update local reports or start the dashboard when it is not healthy. |

The opt-in files deliberately use the `.opt-in.mjs` suffix instead of `.test.mjs`, so Node's default test discovery does not include them.

## PowerShell opt-in

Live governance checks require a reviewed decision to contact the registered endpoints:

```powershell
$env:DEVGOV_ALLOW_LIVE_GOVERNANCE_TESTS = "1"
npm run test:live-governance
Remove-Item Env:DEVGOV_ALLOW_LIVE_GOVERNANCE_TESTS
```

Executable service controls require a separate runtime-mutation approval:

```powershell
$env:DEVGOV_ALLOW_SERVICE_CONTROL_TESTS = "1"
npm run test:service-controls
Remove-Item Env:DEVGOV_ALLOW_SERVICE_CONTROL_TESTS
```

Setting either variable authorizes only its matching lane for the current shell. It does not authorize provider model calls, browser sign-in, credential access, public exposure changes, deployment, or unrelated service controls.

## Evidence handling

- Treat skipped opt-in tests as intentionally not run, not as passing evidence.
- Record the approval source and relevant runtime state before running either lane.
- Inspect `reports/` afterward for generated evidence or side effects.
- Do not commit machine-local report evidence unless a separate review explicitly approves it.
