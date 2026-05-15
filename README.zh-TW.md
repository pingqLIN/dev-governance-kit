# dev-governance-kit

`dev-governance-kit` 是本機多專案開發治理工具包。它把開發服務、AI agent、Windows Terminal profiles、開機啟動項、Cloudflare 對外路由與本機文件檢索放在可稽核的 source of truth 後面管理。

本專案採用類似 UniText 的資料管理分層：

- `registry/` 存放 canonical shared data，是跨專案唯一 source of truth。
- `templates/` 存放可重複套用到目標專案的 read-model 文件與模板。
- `scripts/` 存放驗證、掃描、稽核指令。
- `reports/` 存放產生出的本機 evidence；除了 `.gitkeep` 以外預設不納入版控。

本工具包是 audit-first。掃描只產生 `reports/` evidence；經 review 的紀錄才提升到 `registry/`。

## 快速開始

只讀掃描單一專案：

```powershell
node scripts/scan-project.mjs Q:\Projects\some-project --out reports\some-project-port-audit.md
```

掃描 workspace：

```powershell
node scripts/scan-workspace.mjs Q:\Projects --out reports\workspace-port-audit.md
```

驗證 canonical registry：

```powershell
npm run validate:registry
```

掃描 Windows Terminal profile assets：

```powershell
npm run scan:terminal -- --out reports\terminal-profile-audit.md
```

產生 Terminal settings 修復計畫：

```powershell
npm run plan:terminal-fix
```

掃描 Codex / 開發環境開機啟動項：

```powershell
npm run scan:startup -- --out reports\startup-audit.md
```

掃描 Cloudflare 對外路由設定：

```powershell
npm run scan:public-routes -- --out reports\public-routes-audit.md
```

產生本機靜態文件檢索 artifacts：

```powershell
npm run scan:docs
```

啟動服務前檢查已宣告的 TCP port：

```powershell
node templates/check-ports.mjs 3101,3201
```

## Port 範圍

| 服務類型 | 範圍 |
|---|---:|
| frontend | `3100-3199` |
| api/backend | `3200-3299` |
| db/cache/queue | `3300-3399` |
| preview/docs | `3400-3499` |
| agent/MCP/local tools | `3500-3599` |

## Registry 條目規定

每個已核准的 port 服務條目都必須包含：

| 欄位 | 意義 |
|---|---|
| `project` | 穩定專案名稱，不可使用本機路徑 |
| `service` | 人類可讀的服務名稱 |
| `range` | 選填的範圍 key，例如 `frontend` 或 `api` |
| `port` | `1` 到 `65535` 之間的整數 |
| `host` | 明確 host，例如 `127.0.0.1`、`0.0.0.0` 或 Docker-only host |
| `visibility` | `local`、`lan`、`public` 或 `docker-internal` |
| `protocol` | `tcp`、`udp`、`http`、`https`、`ws` 或 `wss` |
| `source` | 擁有此配置的檔案或政策 |
| `notes` | 必填的人類脈絡，說明此配置存在的原因 |

其他 registry 也遵守同一個原則：canonical 檔案只存穩定 ID 與已審查 policy。本機路徑、完整啟動命令、Terminal settings 路徑、Cloudflare credential 路徑與暫時掃描 evidence 都留在 `reports/`。

## 安全預設

- 掃描都是 read-only。
- 目標專案設定只以文字或 JSON 解析，不會執行。
- `.env` 報告會遮罩非 port、非 host 的值。
- `0.0.0.0` 會被視為 visibility risk，必須文件化。
- automatic port fallback 會被標記，因為它會讓 agent 啟動行為變得模糊。
- Terminal audit 不會修改 Windows Terminal settings；`plan:terminal-fix` 預設 dry-run，除非明確加 `--apply`。
- 產生出的 reports 只是 evidence，不是 canonical policy；有意義的 findings 必須經 review 後再提升到 `registry/*.registry.json`。
