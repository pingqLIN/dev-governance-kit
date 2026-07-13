# Resource Coordination Governance

DevGov treats shared local development resources as a governed observation surface. The goal is to help multiple concurrent LLM development sessions distinguish target project failures from host-level contention without adding a heavy resident coordinator.

## Model

The v1 platform is observe-first:

- `registry/resource-coordination.registry.json` is the canonical policy and channel contract.
- `npm run scan:resource-coordination` writes a lightweight snapshot to `reports/`.
- The dashboard exposes `/api/resource-coordination` for the same read model.
- Codex memory may carry short-term soft hints, but only as proposal-reviewed awareness, not as authoritative current state.
- Existing dashboard state, service-status rows, service-control events, and operating-system observations are reused before adding new mechanisms.

The platform does not throttle, restart, pause, kill, or schedule work by itself.
It is not a lock, transaction store, scheduler, task-dispatch gate, or strong-consistency coordinator.

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

## Codex Memory Hints

Codex memory can support part of RCG as short-term global awareness. Use it only for positive, time-bound hints such as recent browser, GPU, foreground, DevTools, or local-model work. Do not write negative states such as "no current occupancy".

Memory hints are allowed to be eventually consistent, duplicated, incomplete, or delayed because they are soft context. They must not be treated as current ownership, a lock, a transaction record, or scheduling approval.

Each hint should follow this shape:

```json
{
  "kind": "rcg-short-term-resource-hint",
  "project": "stable-project-id",
  "resourceClass": "browser-profile | gpu-rendering | foreground-control | local-model | devtools",
  "intent": "short sanitized description",
  "observedAt": "ISO-8601 timestamp",
  "validUntil": "ISO-8601 timestamp",
  "confidence": "observed | declared | inferred",
  "source": "codex-task | devgov-scan | dashboard-event",
  "authority": "soft-hint-only",
  "afterExpiry": "historical-only"
}
```

The template lives at `templates/CODEX.memory.rcg-hint.md`.

Real memory updates require a separate reviewed gate in the `memory-field` or
runtime-owned memory architecture. DevGov's
`templates/CODEX.memory.rcg-update-gate.md` is now only a deprecated external
handoff reference stub.

Do not treat proposal generation, planning approval, acknowledgement-only replies, timeouts, dashboard refreshes, scanner runs, tests, Doctor runs, or vague OK responses as approval to write memory. Review the exact JSON proposal first.

After reviewing the exact proposal, hand the reviewed payload to
`memory-field:research/handoff/rcg-memory-update-gate.md` or a later
runtime-owned memory update architecture review. DevGov remains proposal-only
for real memory coordination: scanners, Doctor, dashboard refreshes, tests, and
reports must not write real memory.

## Command

Run:

```powershell
npm run scan:resource-coordination
```

The default scan is intentionally small: a short CPU/memory sample plus existing DevGov registry counts. Use `--include-processes` only when process-family counts are needed; it records names and counts only, not command lines or process IDs.

To generate a proposal-only Codex memory hint without writing real memory, run:

```powershell
npm run scan:resource-coordination -- --memory-hint-proposal --memory-hint-project stable-project-id --memory-hint-resource-class browser-profile --memory-hint-intent "Browser automation smoke check"
```

Then use `templates/CODEX.memory.rcg-update-gate.md` only as a DevGov handoff
reference and complete the formal review in
`memory-field:research/handoff/rcg-memory-update-gate.md` before any explicit
memory-update workflow.

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
