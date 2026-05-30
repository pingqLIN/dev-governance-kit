# AGENTS.md 中文版

## 專案角色

`DevGov` 管理可重複使用的開發環境治理資產。

目前專案範圍涵蓋本機開發環境治理：

- 發現專案中的 port 使用情況
- 維護 canonical port registry
- 稽核 Windows Terminal profile asset references
- 盤點 Codex 建立或開發用途的開機啟動項
- 將常駐本地端服務 Agents 與一般 services 分開盤點
- 盤點 Git linked worktree，並避免重複計算同一個 repository
- 管理 Cloudflare / public route governance records
- 產生本機靜態文件檢索 artifacts
- 在已審查的長期 port `127.0.0.1:3101` 提供本機 loopback 儀表板
- 透過 Doctor command 執行自我檢測、有限自我修復與本機報告產生
- 驗證衝突與必要欄位
- 產生 agent 啟動服務前可遵循的模板

## Source Of Truth

- Canonical shared data 放在 `registry/`。
- 可重複使用、面向目標專案的 read-model assets 放在 `templates/`。
- Runtime 或掃描 evidence 放在 `reports/`。
- 本機路徑、個人筆記、未公開計畫不可放進 canonical registry data。

這個模型對齊 UniText registry 架構：共享內容是 canonical，本機 overlay 分離，並由驗證腳本證明 artifacts 仍可使用。

## Data Entry Contract

Registry entries 是系統管理紀錄，不是一般 prose notes。Port 條目都必須保留：

- `project`
- `service`
- `port`
- `host`
- `visibility`
- `protocol`
- `source`
- `notes`

使用穩定的專案識別名稱，不要使用本機路徑。環境特定路徑、process ID、產生出的 audit、暫時調查紀錄，應放在 `reports/` 或 local notes，不要放進 `registry/`。

Terminal profile、startup、public-route registry 也遵守同一原則：canonical records 只用穩定 ID 與已審查 policy 欄位。完整 Windows paths、Terminal settings paths、完整 launch commands、Cloudflare credential paths、process IDs 與暫時 evidence 都放在 `reports/`。

本地端服務 Agent registry 也遵守同一原則。不要把 service-local home、bearer token paths、logs、generated indexes 或完整 commands 放進 `registry/local-agents.registry.json`。

Worktree reports 也放在 `reports/`。它們可以包含 machine-local paths，因為這些是本機 evidence，不是 canonical registry data。

## Port Governance Rules

1. 修改 port allocation rules 前，先讀 `registry/ports.registry.json`。
2. 不要新增 random port 或 auto-increment fallback port。
3. 預設 development host 是 `127.0.0.1`。
4. DevGov 儀表板配置是 `127.0.0.1:3101`；不得靜默改用其他 dashboard port。
5. 任何 `0.0.0.0` binding 都必須以 `visibility` 與 `notes` 文件化。
6. 掃描目標專案時，不得執行目標專案的 config files。
7. 不得從 `.env` files 印出 secrets；reports 只能顯示 port 與 host 相關值。
8. 既有專案掃描維持 read-only，除非未來明確提供已審查的 patch generation command。
9. Version 1 不包含 `apply-project` command；所有目標專案修改都維持 manual 與 review-gated。

## Terminal、Startup、Public Route 與 Search 規則

1. Terminal profile 掃描採 audit-first。除非使用者明確要求 reviewed apply command，否則不得修改 Windows Terminal settings。
2. 套用任何 Terminal settings fix 前，必須先在 settings 檔旁建立 timestamped backup。
3. Startup 掃描可以檢查 Startup folder、Registry Run、Scheduled Tasks 與 Windows services，但完整 command lines 只能留在 reports。
4. Cloudflare route 掃描不得讀取或印出 credential JSON、certs、private keys、API tokens、PEM 內容。
5. Public routes 提升到 `registry/public-routes.registry.json` 前，必須記錄 exposure class、Access requirement、health URL 與 review status。
6. 靜態文件檢索只寫入 `reports/` 本機 artifacts，不得啟動 service 或配置 port。
7. Dashboard startup 採 opt-in。Registration scripts 只有在 operator 明確執行時，才可寫入 Windows Startup entries。

## Worktree Governance Rules

1. Worktree scans 是 read-only，不可 remove、prune、stage、commit、reset、checkout 或 discard files。
2. 專案數應以 Git common-dir 計算，不以 checkout folder 數計算。
3. 新 linked worktree 優先使用 `Q:\Projects\<repo-name>.worktrees\<task-or-branch>-<yyyyMMdd-HHmmss>`。
4. 既有 `Q:\Projects\<repo-name>-worktrees\...` container 仍有效，掃描器必須納入。
5. `*.worktrees` 與 `*-worktrees` folder 視為 operational storage，不視為獨立 project。
6. Cleanup recommendations 只是 signal；實際 `git worktree remove` 與 `git worktree prune` 必須另經 review gate。
7. Dirty 或 unmerged worktrees 在移除決策前必須先備份，包含 branch refs、patches 與 local artifacts，並放到已審查的 `.clean` location。

## 驗證

回報完成批次前，先執行：

```powershell
npm test
npm run validate:registry
npm run doctor
```
