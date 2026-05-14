# dev-governance-kit

`dev-governance-kit` 是本機多專案開發治理工具包。第一版先實作 Port Governance，讓開發服務、AI agent 與人類操作者共用同一份可稽核的 source of truth。

本專案採用類似 UniText 的資料管理分層：

- `registry/` 存放 canonical shared data，是跨專案唯一 source of truth。
- `templates/` 存放可重複套用到目標專案的 read-model 文件與模板。
- `scripts/` 存放驗證、掃描、稽核指令。
- `reports/` 存放產生出的本機 evidence；除了 `.gitkeep` 以外預設不納入版控。

Version 1 是 audit-first。它只產生證據與治理建議，不會直接 patch 目標專案，也不會批次套用整個 workspace 的設定。

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

每個已核准的服務條目都必須包含：

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

## 安全預設

- 掃描都是 read-only。
- 目標專案設定只以文字或 JSON 解析，不會執行。
- `.env` 報告會遮罩非 port、非 host 的值。
- `0.0.0.0` 會被視為 visibility risk，必須文件化。
- automatic port fallback 會被標記，因為它會讓 agent 啟動行為變得模糊。
- 產生出的 reports 只是 evidence，不是 canonical policy；有意義的 findings 必須經 review 後再提升到 `registry/ports.registry.json`。
