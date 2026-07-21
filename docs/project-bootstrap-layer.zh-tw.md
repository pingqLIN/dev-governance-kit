# Project Bootstrap Layer（專案初始化層）

Project Bootstrap Layer 將 `Q:\Projects` 當作 AI Workspace Root，為每個新專案建立可稽核的治理骨架；它不會靜默接管現行 Global AGENTS 檔案。

## 初始化流程

```text
create-project.ps1 MyProject
  -> Q:\Projects\MyProject
  -> .governance/{project.json,environment-snapshot.json,handoff.json}
  -> AGENTS.md 與 .gitignore
  -> git init
  -> Codex-ready review state
```

在本 repository 執行：

```powershell
pwsh -File .\scripts\create-project.ps1 MyProject -WorkspaceRoot Q:\Projects
```

目標路徑已存在時，腳本會直接停止；可加上 `-WhatIf` 預覽。環境快照只記錄版本與存在狀態；GPU/model 探測會標記為 `not-probed`，不會收集 secret values。

## Workspace index

`registry/project-registry.json` 定義穩定契約；workspace 的 live index 放在 `Q:\Projects\.governance\project-registry.json`。`create-project.ps1` 成功建立骨架後會同步刷新它，也可獨立執行只讀刷新報告：

```powershell
npm run scan:project-registry -- Q:\Projects
```

報告會包含專案識別、AGENTS readiness、Git branch/dirty state，以及輕量 runtime markers。完整路徑只放在 `reports/`，不進入 canonical registry。

## Handoff

`.governance/handoff.json` 是 ChatGPT → Codex、Codex → Claude、Local Agent → Remote Agent 的結構化交接邊界。它是 evidence 與 task context，不是權威來源；接收方 agent 必須在本機重新驗證 claims。
