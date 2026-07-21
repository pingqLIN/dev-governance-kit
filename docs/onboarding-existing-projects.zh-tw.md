# 既有專案導入流程

將既有專案納入 Port Governance 時，請依本流程操作。

這個流程對齊 UniText-style data flow：

- `registry/` 是 canonical shared policy。
- `templates/` 是可重複使用的 consumer/read-model layer。
- `reports/` 是產生出的 evidence，不代表 policy。
- Version 1 中，目標專案的實際修改採人工處理。

## Phase 0：既有已登錄服務補充稽核

在開始修改目標專案前，先執行已登記服務補充稽核：

```powershell
npm run scan:service-onboarding
```

接著檢查 `reports/service-onboarding-audit.md` 或 dashboard 的 Onboarding 視圖。這份稽核會列出尚未補齊的已登錄服務項目：

- 安全可執行的 Quick Test health URL
- 穩定的 Doctor 參照
- startup 或已審查的 restart 參照
- 已在 DevGov dashboard Service Status 顯示的服務列

## Phase 1：只讀稽核

執行只讀掃描：

```powershell
node scripts/scan-project.mjs Q:\Projects\example --out reports\example-port-audit.md
```

檢查重點：

- 發現的 ports
- source files 與 line numbers
- hard-coded port
- host bindings
- fallback 行為
- 可改為 `expose` 的 Docker `ports`

## Phase 2：登錄

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

使用穩定專案名稱，不要使用本機路徑。若 allocation 是暫時性，請在 `notes` 記錄原因，並把 machine-specific proof 放在 generated report。

## Phase 3：專案治理文件

新增或更新目標專案檔案：

- `PORTS.md`
- `.env.example`
- dev startup scripts
- repo-local `AGENTS.md` 或已收錄 port-governance 的章節

專案 dev startup scripts 應先透過 `scripts/require-governed-port.mjs`，再啟動 raw server command。raw command 保持獨立，才能讓 preflight gate 先驗證 registry entry，並注入 `HOST` / `PORT`：

```json
{
  "scripts": {
    "dev": "node Q:/Projects/dev-governance-kit/scripts/require-governed-port.mjs --project example --service web-http -- npm run dev:raw",
    "dev:raw": "vite --host 127.0.0.1 --port 3100 --strictPort"
  }
}
```

## Phase 4：驗證

執行：

```powershell
npm test
npm run validate:registry
npm run scan:service-onboarding
node scripts/scan-project.mjs <target-project>
npm run port:preflight -- --project <project> --service <service>
```

`templates/check-ports.mjs` 只用於 TCP port availability checks。UDP registry entries 需要 protocol-specific verification command。

單一專案未通過 review 前，不要批次套用整個 workspace。

## Version 1 邊界

Version 1 沒有 `apply-project` command。scanner 只產生 evidence；registry 只記錄已審查 policy；目標專案由人類或 review-gated agent 一次只更新一個。
