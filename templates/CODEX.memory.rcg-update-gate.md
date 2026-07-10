# CODEX.memory.rcg-update-gate

Reviewed gate template for turning an RCG memory hint proposal into a real Codex memory update.

This template is not an apply command. It defines the human checkpoint that must happen after a proposal is generated and before any memory update occurs.

## Required Operator Intent

Proceed only when the operator explicitly asks to update Codex memory with a reviewed RCG hint.

Do not treat the following as approval:

- generating a proposal
- saying OK to planning
- a timeout
- an acknowledgement-only response
- a dashboard refresh
- a scanner, test, or Doctor run

## Source Artifact

Start from a generated proposal under `reports/`, such as `resource-coordination-memory-hint-proposal.json`.

Review the exact JSON that would be written. Do not reconstruct the hint from memory, chat history, or an informal summary.

## Required Checks

- The hint is a positive recent-use event, not a negative availability state.
- `project` is a stable project id, not a machine-local path.
- `intent` is sanitized and contains no secrets, credential paths, full commands, screenshots, or personal activity.
- `resourceClass`, `confidence`, `source`, `observedAt`, `validUntil`, `authority`, and `afterExpiry` match the RCG schema.
- `validUntil` is short-term.
- The hint remains `authority: "soft-hint-only"` and `afterExpiry: "historical-only"`.

## Memory Write Surface

Use only a runtime-approved Codex memory update mechanism. DevGov scanners, dashboard refreshes, tests, Doctor, and report-generation commands must never write real Codex memory.

After writing memory, report only that the reviewed hint was recorded. Do not print secrets or unrelated memory content.
