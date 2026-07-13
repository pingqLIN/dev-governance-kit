# CODEX.memory.rcg-update-gate

Status: deprecated as a DevGov-local update gate.

This file is now an external handoff reference stub. It keeps the old DevGov
entry point discoverable, but the formal RCG memory update gate belongs to the
`memory-field` architecture:

```text
memory-field:research/handoff/rcg-memory-update-gate.md
```

DevGov remains proposal-only. This file is not an apply command, writer,
runtime-control path, queue, scheduler, or Codex memory mutation mechanism.

## Required Operator Intent

Proceed only when the operator explicitly asks to hand a reviewed RCG proposal
to the memory-field or runtime-owned memory architecture.

Do not treat the following as approval:

- generating a proposal
- saying OK to planning
- a timeout
- an acknowledgement-only response
- a dashboard refresh
- a scanner, test, or Doctor run

## Source Artifact

Start from a generated proposal under `reports/`, such as
`resource-coordination-memory-hint-proposal.json`.

Review the exact JSON proposal. Do not reconstruct the hint from memory, chat
history, or an informal summary.

## DevGov Handoff Reference

A DevGov handoff reference should stay minimal:

```json
{
  "proposalSchema": "devgov.resource-coordination.memory-hint-proposal.v1",
  "sourceReport": "reports/resource-coordination-memory-hint-proposal.json",
  "reviewGate": "memory-field:research/handoff/rcg-memory-update-gate.md",
  "targetArchitecture": "memory-field",
  "authority": "proposal-only",
  "consumerAction": "external-runtime-owned",
  "noDevGovWrite": true
}
```

## Required Checks Before Handoff

- The proposal points to the memory-field review gate above.
- The hint is a positive recent-use event, not a negative availability state.
- `project` is a stable project id, not a machine-local path.
- `intent` is sanitized and contains no secrets, credential paths, full commands, screenshots, or personal activity.
- `resourceClass`, `confidence`, `source`, `observedAt`, `validUntil`, `authority`, and `afterExpiry` match the RCG proposal schema.
- `validUntil` is short-term.
- The hint remains `authority: "soft-hint-only"` and `afterExpiry: "historical-only"`.
- The handoff reference keeps `consumerAction: "external-runtime-owned"` and `noDevGovWrite: true`.

## DevGov Write Surface

DevGov has no real Codex memory write surface. DevGov scanners, dashboard
refreshes, tests, Doctor, and report-generation commands must never write real
Codex memory.

After handoff, report only that the reviewed proposal was handed to the external
memory architecture. Do not print secrets or unrelated memory content.
