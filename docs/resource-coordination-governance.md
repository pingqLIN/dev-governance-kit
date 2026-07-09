# Resource Coordination Governance

DevGov treats shared local development resources as a governed observation surface. The goal is to help multiple concurrent LLM development sessions distinguish target project failures from host-level contention without adding a heavy resident coordinator.

## Model

The v1 platform is observe-first:

- `registry/resource-coordination.registry.json` is the canonical policy and channel contract.
- `npm run scan:resource-coordination` writes a lightweight snapshot to `reports/`.
- The dashboard exposes `/api/resource-coordination` for the same read model.
- Existing dashboard state, service-status rows, service-control events, and operating-system observations are reused before adding new mechanisms.

The platform does not throttle, restart, pause, kill, or schedule work by itself.

## Diagnosis

Do not treat lag as direct proof of target instability. Classify degraded observations as:

| State | Meaning |
| --- | --- |
| `target-unhealthy` | Target-local evidence exists, such as failed health checks, crashed listeners, project errors, or Doctor failures. |
| `environment-contention` | Target evidence is weak or healthy, while shared host pressure or exclusive resource use plausibly explains lag. |
| `unknown-degraded` | Evidence is stale or insufficient; refresh before remediation. |

## Exclusive Resources

Register intended use before taking capacity-limited or exclusive resources:

- authenticated browser profiles, browser automation sessions, DevTools sessions, or extension state
- GPU-heavy 3D rendering, WebGL/WebGPU, canvas checks, video rendering, or local model inference
- foreground screen, pointer, keyboard, simulator, display, or interactive desktop control

Registration is a coordination signal, not a permission override. Claims must be sanitized and time-bound. Do not store secrets, cookies, session data, credential paths, full command lines, private screenshots, or personal activity in canonical registry data.

## Freshness

Coordination status must expire. Snapshots and exclusive-resource claims need generated, observed, refreshed, or expiry timestamps. Stale status is historical evidence only and must not block current work or justify current remediation without refresh.

## Command

Run:

```powershell
npm run scan:resource-coordination
```

The default scan is intentionally small: a short CPU/memory sample plus existing DevGov registry counts. Use `--include-processes` only when process-family counts are needed; it records names and counts only, not command lines or process IDs.

## Project AGENTS Rollout

Do not copy the full DevGov policy into every project. Use the thin overlay template instead:

- `templates/AGENTS.resource-coordination.md`
- `templates/AGENTS.resource-coordination.zh-tw.md`

To inspect one project AGENTS file without changing it, run:

```powershell
npm run scan:agents -- --agents-file path\to\AGENTS.md --resource-proposal-out reports\agent-resource-overlay.md
```

The scanner writes a proposal report under `reports/`. It does not patch, apply, or bulk-edit target projects. Review the proposed snippet and adapt the project-specific exclusive-resource declarations before editing a project AGENTS file.

## Future Scheduling

Scheduling is a later reviewed apply path. Automatic throttling, pausing, restarting, killing, priority changes, or cross-project scheduling requires explicit operator approval, service-control review, rollback expectations, and privacy review.
