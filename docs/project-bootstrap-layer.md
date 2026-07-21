# Project Bootstrap Layer

The Project Bootstrap Layer treats `Q:\Projects` as the AI Workspace Root.
It gives every new project a small, inspectable governance skeleton without
silently taking ownership of the live Global AGENTS file.

## Bootstrap flow

```text
create-project.ps1 MyProject
  -> Q:\Projects\MyProject
  -> .governance/{project.json,environment-snapshot.json,handoff.json}
  -> AGENTS.md and .gitignore
  -> git init
  -> Codex-ready review state
```

Run the script from this repository:

```powershell
pwsh -File .\scripts\create-project.ps1 MyProject -WorkspaceRoot Q:\Projects
```

The command refuses an existing target. Use `-WhatIf` to preview the target
operation. `environment-snapshot.json` records versions and presence only;
GPU/model probing is deliberately `not-probed`, and secret values are never
collected.

## Workspace index

`registry/project-registry.json` defines the stable contract. The live index is
local to the workspace at `Q:\Projects\.governance\project-registry.json`;
`create-project.ps1` refreshes it after a successful scaffold. It can also be
refreshed independently:

```powershell
npm run scan:project-registry -- Q:\Projects
```

The report includes project identity, AGENTS readiness, Git branch/dirty state,
and lightweight runtime markers. Full paths belong in reports, not canonical
registry records.

## Handoff

`.governance/handoff.json` is a structured boundary for ChatGPT → Codex,
Codex → Claude, and Local Agent → Remote Agent transfers. It is evidence and
task context, not authority; receiving agents must verify claims locally.
