# 既有專案導入流程

當要把既有專案納入 Port Governance 時，使用此 workflow。

這個流程對齊 UniText-style data flow：

- `registry/` 是 canonical shared policy。
- `templates/` 是可重複使用的 consumer/read-model layer。
- `reports/` 是產生出的 evidence，不應被視為 policy。
- Version 1 中，目標專案修改維持 manual。

## Phase 1: 只讀稽核

執行 read-only scan：

```powershell
node scripts/scan-project.mjs Q:\Projects\example --out reports\example-port-audit.md
```

檢查：

- 發現的 ports
- source files 與 line numbers
- hard-coded ports
- host bindings
- automatic fallback behavior
- 可以改用 `expose` 的 Docker `ports`

## Phase 2: 登錄

將已核准服務加入 `registry/ports.registry.json`。

每個條目必須包含：

- `project`
- `service`
- `port`
- `host`
- `visibility`
- `protocol`
- `source`
- `notes`

使用穩定專案名稱，不要使用本機路徑。如果 allocation 是暫時性的，請在 `notes` 記錄原因，並將 machine-specific proof 保存在 generated report。

## Phase 3: 專案治理文件

新增或更新目標專案檔案：

- `PORTS.md`
- `.env.example`
- dev startup scripts
- repo-local `AGENTS.md` 或 included port-governance section

## Phase 4: 驗證

執行：

```powershell
npm test
npm run validate:registry
node scripts/scan-project.mjs <target-project>
```

`templates/check-ports.mjs` 只用於 TCP port availability checks。UDP registry entries 需要 protocol-specific verification command。

在單一專案通過 review 前，不要批次套用整個 workspace。

## Version 1 邊界

Version 1 沒有 `apply-project` command。Scanner 產生 evidence，registry 記錄 approved policy，目標專案由人類或 review-gated agent 一次更新一個。
