# ENVIRONMENT.md

> Local environment facts. This file is not a cross-repository governance baseline and must not contain secret values.

## Approved Workspace Roots

- Project development defaults to `Q:\`.
- Access outside `Q:\`, including `C:\Users\miles`, requires explicit user
  approval unless a narrower overlay authorizes a specific path for the current
  task.

## Path Access Gate

If the task cannot be completed inside the approved workspace root, the agent must
report:

- requested path,
- reason,
- risk level,
- safer alternative, if available.

## Local Tool Availability

Document local tool availability, browser status, MCP connectors, and DevGov service
endpoints here or in a workspace overlay. Do not include secret values.
