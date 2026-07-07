# Workspace AGENTS overlay

> Workspace-level overlay. Refines global `AGENTS.md` for workspace operations.

## Scope

This template applies when installed at a real workspace root. In this DevGov
repo, it is only a template and does not define runtime behavior for the
repository root.

- Use DevGov registry records and generated reports as the workspace governance
  source of truth.
- Use approved workspace roots from the local workspace registry or environment
  overlay.
- Keep local Files MCP read operations as the default.
- Require explicit review for writes and config changes.

## Workspace Governance

- Registry-backed changes for ports, startups, public routes, service restarts,
  worktrees, and API-key handling require the corresponding DevGov registry,
  report, and verification steps.
- Port, startup, and public-route modifications must be reviewed against the
  relevant DevGov registry and validators before applying.
- Any local apply path that touches user configuration should identify rollback
  points and backup evidence.

## MCP Profiles

- `local-files-readonly`: read/list/search only.
- `local-files-write-gated`: requires explicit approval or workspace go/no-go gate.
- `tools-mcp`: only allow narrow tool sets aligned to the current task.
