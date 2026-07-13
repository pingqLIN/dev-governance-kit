# DevGov

`DevGov` 是 user/home-level governance toolkit 與儀表板。它把 Global AGENTS planning、開發服務、本地端服務 Agents、shared resource coordination、Windows Terminal profiles、開機啟動項、Cloudflare 對外路由、開發用 API key 存放位置、AGENTS 指令治理、worktrees、自我檢測與本機文件檢索放在可稽核的 source of truth 後面管理。

此 repository 設計上應放在 user/home-level Codex storage，而不是單一 workspace project tree。它負責 Global-layer planning、indexing、validation 與 coordination；它不會靜默改寫 live Global AGENTS file，也不會覆寫 platform/runtime instructions。

本專案採用類似 UniText 的資料管理分層：

- `registry/` 存放 canonical shared data，是跨專案唯一 source of truth。
- `templates/` 存放可重複套用到目標專案的 read-model 文件與模板。
- `scripts/` 存放驗證、掃描、稽核指令。
- `reports/` 存放產生出的本機 evidence；除了 `.gitkeep` 以外預設不納入版控。

本工具包是 audit-first。掃描只產生 `reports/` evidence；經 review 的紀錄才提升到 `registry/`。

## 重要文件

- [README.md](README.md)
- [AGENTS.md](AGENTS.md)：本 repo 唯一 authoritative agent-runtime instruction source
- [AGENTS.zh-tw.md](AGENTS.zh-tw.md)：human-readable reference only，不是 runtime source
- [PRODUCT.md](PRODUCT.md)：design 與 UI agents 使用的產品脈絡
- [DESIGN.md](DESIGN.md)：DevGov design system；[registry/design-system.registry.json](registry/design-system.registry.json) 是可重用的 token sidecar
- [docs/onboarding-existing-projects.zh-tw.md](docs/onboarding-existing-projects.zh-tw.md)
- [docs/codex-local-state-governance.md](docs/codex-local-state-governance.md)
- [docs/codex-local-state-governance.zh-tw.md](docs/codex-local-state-governance.zh-tw.md)
- [docs/context-budget-governance.md](docs/context-budget-governance.md)
- [docs/context-budget-governance.zh-tw.md](docs/context-budget-governance.zh-tw.md)
- [docs/resource-coordination-governance.md](docs/resource-coordination-governance.md)
- [docs/resource-coordination-governance.zh-tw.md](docs/resource-coordination-governance.zh-tw.md)
- [docs/local-antivirus-governance.md](docs/local-antivirus-governance.md)
- [docs/local-antivirus-governance.zh-tw.md](docs/local-antivirus-governance.zh-tw.md)
- [templates/PORTS.zh-tw.md](templates/PORTS.zh-tw.md)
- [templates/AGENTS.port-governance.zh-tw.md](templates/AGENTS.port-governance.zh-tw.md)
- [templates/AGENTS.resource-coordination.md](templates/AGENTS.resource-coordination.md)
- [templates/AGENTS.resource-coordination.zh-tw.md](templates/AGENTS.resource-coordination.zh-tw.md)
- [templates/CODEX.memory.rcg-hint.md](templates/CODEX.memory.rcg-hint.md)
- [templates/CODEX.memory.rcg-hint.zh-tw.md](templates/CODEX.memory.rcg-hint.zh-tw.md)
- [templates/CODEX.memory.rcg-update-gate.md](templates/CODEX.memory.rcg-update-gate.md)
- [templates/CODEX.memory.rcg-update-gate.zh-tw.md](templates/CODEX.memory.rcg-update-gate.zh-tw.md)

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

稽核開發用 API key variable names 與 storage scopes，但不印出 values：

```powershell
npm run scan:api-keys -- --project . --out reports\api-key-audit.md
```

在不修改 security settings 的前提下 triage 本機防毒阻擋：

```powershell
npm run av:triage -- -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -RebuildCommand "npm run build" -IncludeDefenderPreview
```

當觸發來源是 alert text 或 failed command output 時，使用 Codex hook wrapper：

```powershell
npm run codex:av-hook -- -Product "Bitdefender" -Path "Q:\Projects\some-project\dist\app.exe" -ProjectRoot "Q:\Projects\some-project" -AlertText "Bitdefender blocked generated build output" -RebuildCommand "npm run build"
```

掃描 Git worktree inventory，並以 common repo 去重：

```powershell
npm run scan:worktrees -- Q:\Projects --out reports\worktree-audit.md
```

可選 policy thresholds：

```powershell
npm run scan:worktrees -- Q:\Projects --out reports\worktree-audit.md --max-age-days 30 --max-linked-worktrees 3
```

產生本機靜態文件檢索 artifacts：

```powershell
npm run scan:docs
```

產生本機 AGENTS instruction search artifacts：

```powershell
npm run scan:agents
```

針對單一 AGENTS file 產生 proposal-only shared-resource overlay 報告：

```powershell
npm run scan:agents -- --agents-file path\to\AGENTS.md --resource-proposal-out reports\agent-resource-overlay.md
```

稽核可觀察的本機 context-budget 來源：

```powershell
npm run scan:context-budget
```

產生輕量 shared-resource contention snapshot：

```powershell
npm run scan:resource-coordination
```

產生 proposal-only Codex memory hint，作為短期 RCG awareness：

```powershell
npm run scan:resource-coordination -- --memory-hint-proposal --memory-hint-project stable-project-id --memory-hint-resource-class browser-profile --memory-hint-intent "Browser automation smoke check"
```

任何 explicit memory-update workflow 前，先 review：

```text
templates/CODEX.memory.rcg-update-gate.md
```

Review 後，將精確 proposal payload 交由 `memory-field` 或 runtime-owned memory update architecture 處理。DevGov scanners、Doctor、dashboard refreshes、tests 與 reports 維持 proposal-only，不寫入真實 memory。

稽核已登記服務的補充程序缺口：

```powershell
npm run scan:service-onboarding
```

啟動本機儀表板：

```powershell
npm run dashboard
```

需要時開啟儀表板；若服務尚未啟動，會先自動啟動 loopback server：

```powershell
npm run dashboard:open -- --open
```

執行自我檢測與報告系統：

```powershell
npm run doctor
```

重新產生可修復的本機報告 artifacts：

```powershell
npm run doctor:repair
```

啟動服務前，先要求服務使用 registry 裡登記好的 governed port：

```powershell
npm run port:preflight -- --project devgov --service dashboard-http --host 127.0.0.1 --port 3000 --protocol http
```

也可以用同一個 gate 啟動已 review 的 raw command。只有 registry 與 TCP availability checks 通過後才會執行子程序；子程序會從 registry 收到 `HOST`、`PORT`、`DEVGOV_HOST`、`DEVGOV_PORT` 等環境變數：

```powershell
npm run port:preflight -- --project my-app --service web-http -- npm run dev:raw
```

沒有要啟動 registry entry、只需要臨時檢查 TCP availability 時：

```powershell
node templates/check-ports.mjs 3000,3201
```

## Port 範圍

| 服務類型 | 範圍 |
|---|---:|
| frontend | `3100-3199` |
| api/backend | `3200-3299` |
| db/cache/queue | `3300-3399` |
| preview/docs | `3400-3499` |
| agent/MCP/local tools | `3500-3599` |

DevGov 保留服務：

| 服務 | Host | Port | 說明 |
|---|---|---:|---|
| dashboard-http | `127.0.0.1` | `3000` | 長期使用的儀表板與受 Zero Trust 保護的 public-route origin。若 port 被占用，server 會直接失敗，不會靜默換 port。 |

## 儀表板與啟動機制

儀表板入口是 `http://127.0.0.1:3000`。它直接讀取 canonical registry files，並提供 `/health`、`/api/state`、`/api/local-agents`、`/api/resource-coordination` 與 `/api/doctor` 作為本機檢查端點。

本地端服務 Agents 會記錄在 `registry/local-agents.registry.json`。這些 records 用來識別 Local Archive Maintainer 這類常駐 loopback services，但不會把 service-local home、token files、logs、generated data 或完整 command lines 放進 canonical registry data。

Agent instruction governance 會記錄在 `registry/agent-instructions.registry.json`。儀表板包含 Agent Instructions view，`/api/agent-instructions` 會回傳 source-of-truth layers、item types 與 entries，`/api/unitext-agent-instructions` 則提供 UniText-style query index，供本機整合使用。

Shared resource coordination 會記錄在 `registry/resource-coordination.registry.json`。它定義多個並行 LLM 開發工作可共用的輕量 communication / read-model surface，包括 lag diagnosis、freshness rules、browser profiles、GPU-heavy rendering、foreground screen control 等排他資源的使用前登記，以及 proposal-only Codex memory hints 作為短期 soft awareness。預設 scan 是 on-demand 且很小；memory hints 不是 authoritative state、lock 或 scheduling gate。真實 memory update 已移出 DevGov，reviewed gate 後交由 `memory-field` 或 runtime-owned memory update architecture 處理。Scheduling 仍是日後需要另行 review 的 apply path。

Project AGENTS rollout 應維持輕薄。以 `templates/AGENTS.resource-coordination.md` 作為 manual overlay source，並用 `npm run scan:agents -- --agents-file <path>` 產生 proposal report。scanner 不會對 target projects apply changes。

Network service status 可在 Service Status view 與 `/api/service-status` 查看。`Quick Test` table column 會執行安全 health check，並回報每個 service 是否偵測到 Doctor mechanism 與 restart readiness。已審查的 Doctor/restart control 會直接掛在狀態 flag 上；一鍵 restart 仍維持 review-gated，直到該 service 有 approved restart command、backup / rollback expectation 與 permission boundary。標準化合約記錄在 `docs/service-control-readiness-spec.zh-tw.md`，agent workflow 則在 `registry/skills/service-control-readiness/SKILL.md`。

開發用 API key 存放位置由 `registry/api-keys.registry.json` 追蹤。這些 records 保存 service、variable name、storage location type、access method、usage rules、review status 與 provider settings page。Credential values、credential file contents、本機 secret paths、shell history 與完整 command lines 都不得放進 canonical registry data。

開機啟動註冊採 review-gated。`scripts/register-dashboard-startup.ps1` 可以在操作者明確執行時建立或移除 Windows Startup entry。預設的隨服務開啟路徑是 `npm run dashboard:open -- --open`，它會先做 health check，只有在儀表板尚未啟動時才啟動 loopback server。

公開的 `gov.colorgeek.co` 與 `dev.colorgeek.co` route 也採 review-gated。`npm run gov:route:register` 會建立使用者 Startup entry，讓統一的 `127.0.0.1:3000` origin 與專用 Cloudflare Tunnel connector 在登入後保持可用；`npm run gov:route:remove` 可移除該 entry。

## Doctor

`npm run doctor` 會驗證 package identity、registry schemas、dashboard port allocation、startup governance records、API key governance records、AGENTS instruction governance records、resource-coordination governance records、包含防毒 dry-run 入口在內的必要 scripts、dashboard port availability，以及文件索引能否建立。報告會寫入 `reports/devgov-doctor-report.json`。

`npm run doctor:repair` 只修復 `reports/` 底下的本機 generated artifacts；它會重新產生靜態文件檢索檔，不會修改 canonical registry data。

## Worktree 治理

Linked worktree 使用 repo-specific container：

```text
Q:\Projects\<repo-name>
Q:\Projects\<repo-name>.worktrees\<task-or-branch>-<yyyyMMdd-HHmmss>
```

既有 `Q:\Projects\<repo-name>-worktrees\...` container 仍有效，也會被掃描以維持相容。新的 container 建議使用 `.worktrees`，因為它會排序在 owning repo 旁邊，且清楚標示為 operational storage。

建議在以下時機執行 `scan:worktrees`：

- 建立一批新 worktrees 前
- cleanup 或 consolidation 前
- 回報 workspace project count 前
- 例行 workspace hygiene review 時

報告會使用以下 signals：

| Signal | 意義 |
|---|---|
| `Git entries` | 所有偵測到的 Git checkouts 與 linked worktrees |
| `Unique Git repositories` | 以 Git common-dir 去重後的 project count |
| `Linked worktree entries` | `--git-dir` 不同於 `--git-common-dir` 的 checkouts |
| `Worktree containers` | 偵測到的 `*.worktrees` 或 `*-worktrees` folders |
| `Recommendation` | Review signal，例如 `within policy`、`cleanup candidate after branch/review check` 或 `review dirty worktrees before cleanup` |

Cleanup 仍維持 manual 與 review-gated。處理 candidate worktree 前，先用 `git worktree list --porcelain` 確認 owning repo，並用 `git status --short --branch` 檢查狀態；dirty 或 unmerged work 必須先備份。只有已 review 且乾淨的 worktree 才可執行 `git worktree remove <path>`。`git worktree prune` 只在 reviewed removals 後執行。

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

API key entries 必須包含：

| 欄位 | 意義 |
|---|---|
| `project` | 穩定 owner，例如 `system-environment`，不得使用 machine-local path |
| `service` | 擁有該 credential 的 provider 或 tool |
| `variableName` | Environment variable name 或穩定 secret handle，絕不可是 value |
| `credentialKind` | `api-key`、`token`、`secret`、`password`、`credential` 或 `account-identity` |
| `storageLocation` | Storage location type，例如 Windows Machine environment variables |
| `accessMethod` | 本機工具如何取用該 credential |
| `settingsUrl` | 用於 review 與 rotation 的 provider settings 或 dashboard page |
| `rules` | Handling、rotation 與 promotion rules |
| `source` | 識別該紀錄的 audit 或 policy |
| `notes` | 必要的人類脈絡 |

AGENTS instruction records 放在 `registry/agent-instructions.registry.json`。這些 records 會依 scope layer 與 item type 分類長期有效的 AGENTS rules，讓規則可以被驗證，並匯出成 `reports/` 底下可查詢的本機 artifacts。

Global-layer management 是 planning responsibility。DevGov 可以定義 global-home instructions 的 taxonomy、readiness checks、query indexes 與 reviewed promotion workflows。直接修改 live Global AGENTS file 仍然必須是明確 operator action，並包含 reviewed diff 與 rollback evidence。

## 安全預設

- 掃描都是 read-only。
- 目標專案設定只以文字或 JSON 解析，不會執行。
- `.env` 報告會遮罩非 port、非 host 的值。
- API key 掃描只回報 variable names 與 scopes；values 不會被印出，也不會被提升到 registry data。
- `0.0.0.0` 會被視為 visibility risk，必須文件化。
- automatic port fallback 會被標記，因為它會讓 agent 啟動行為變得模糊。
- DevGov dashboard startup 是 opt-in。repo 提供註冊腳本，但 audit commands 不會靜默修改 Windows Startup settings。
- Terminal audit 不會修改 Windows Terminal settings；`plan:terminal-fix` 預設 dry-run，除非明確加 `--apply`。
- Worktree audit 只讀產生 evidence 與 cleanup candidate；實際 remove/prune 仍必須經 review gate。
- 產生出的 reports 只是 evidence，不是 canonical policy；有意義的 findings 必須經 review 後再提升到 `registry/*.registry.json`。
