# AGENTS.md 中文版

## 專案角色

`dev-governance-kit` 管理可重複使用的開發環境治理資產。

Version 1 只聚焦 Port Governance：

- 發現專案中的 port 使用情況
- 維護 canonical port registry
- 驗證衝突與必要欄位
- 產生 agent 啟動服務前可遵循的模板

## Source Of Truth

- Canonical shared data 放在 `registry/`。
- 可重複使用、面向目標專案的 read-model assets 放在 `templates/`。
- Runtime 或掃描 evidence 放在 `reports/`。
- 本機路徑、個人筆記、未公開計畫不可放進 canonical registry data。

這個模型對齊 UniText registry 架構：共享內容是 canonical，本機 overlay 分離，並由驗證腳本證明 artifacts 仍可使用。

## Data Entry Contract

Port registry entries 是系統管理紀錄，不是一般 prose notes。每個條目都必須保留：

- `project`
- `service`
- `port`
- `host`
- `visibility`
- `protocol`
- `source`
- `notes`

使用穩定的專案識別名稱，不要使用本機路徑。環境特定路徑、process ID、產生出的 audit、暫時調查紀錄，應放在 `reports/` 或 local notes，不要放進 `registry/`。

## Port Governance Rules

1. 修改 port allocation rules 前，先讀 `registry/ports.registry.json`。
2. 不要新增 random port 或 auto-increment fallback port。
3. 預設 development host 是 `127.0.0.1`。
4. 任何 `0.0.0.0` binding 都必須以 `visibility` 與 `notes` 文件化。
5. 掃描目標專案時，不得執行目標專案的 config files。
6. 不得從 `.env` files 印出 secrets；reports 只能顯示 port 與 host 相關值。
7. 既有專案掃描維持 read-only，除非未來明確提供已審查的 patch generation command。
8. Version 1 不包含 `apply-project` command；所有目標專案修改都維持 manual 與 review-gated。

## 驗證

回報完成批次前，先執行：

```powershell
npm test
npm run validate:registry
```
