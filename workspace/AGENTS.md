# Workspace AGENTS overlay

> Workspace-level overlay. Refines global `AGENTS.md` for workspace operations.

## Scope

This overlay applies to coordinated DevGov workspace operations under the local
workspace governance model.

- Use the workspace rule predictor before touching a registered project.
- Use approved workspace roots from local workspace registry.
- Keep local Files MCP read operations as the default.
- Require explicit review for writes and config changes.

## Workspace Governance

- Registry-backed changes for ports, startups, public routes, service restarts, and
  API-key handling require the corresponding DevGov verification and gate steps.
- Port, startup, and public-route modifications must be reviewed against workspace
  policy before applying.
- Any local apply path that touches user configuration should identify rollback
  points and backup evidence.

## MCP Profiles

- `local-files-readonly`: read/list/search only.
- `local-files-write-gated`: requires explicit approval or workspace go/no-go gate.
- `tools-mcp`: only allow narrow tool sets aligned to the current task.
