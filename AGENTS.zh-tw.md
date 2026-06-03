# AGENTS.md 中文參考版

> Human-readable reference only.
> `AGENTS.md` 是本 repo 唯一 authoritative agent-runtime instruction source。
> 若本檔與 `AGENTS.md` 有差異，以 `AGENTS.md` 為準。

## 專案角色

`DevGov` 管理可重複使用的 user/home-level 開發治理資產。

此 repository 預期放在 operator 的 user/home-level Codex storage，例如 home-level governance folder。它的角色高於單一 workspace repository，但仍低於 platform、system、developer 與 runtime instructions。

目前專案範圍涵蓋 global-home 與本機開發環境治理：

- 規劃、分類與稽核 Global AGENTS responsibilities
- 維護 Global-layer governance records，但不把 machine-local instruction paths 複製進 canonical registry data
- 提供 user/home-level instruction scope、item types 與 evidence anchors 的可查詢索引
- 發現專案中的 port 使用情況
- 維護 canonical port registry
- 稽核 Windows Terminal profile asset references
- 盤點 Codex 建立或開發用途的開機啟動項
- 將常駐本地端服務 Agents 與一般 services 分開盤點
- 盤點開發用 API key 的存放位置，但不讀取或保存 credential values
- 盤點 Git linked worktree，並避免重複計算同一個 repository
- 管理 Cloudflare / public route governance records
- 產生本機靜態文件檢索 artifacts
- 治理 AGENTS 指令範圍、項目類型與可查詢索引
- 稽核可觀察的 Codex context-budget 來源，並透過精簡索引路由 tools 或 skills
- 在已審查的長期 port `127.0.0.1:3000` 提供本機 loopback 儀表板
- 透過 Doctor command 執行自我檢測、有限自我修復與本機報告產生
- 驗證衝突與必要欄位
- 產生 agent 啟動服務前可遵循的模板

## Source Of Truth

- Canonical shared data 放在 `registry/`。
- 可重複使用、面向目標專案的 read-model assets 放在 `templates/`。
- Runtime 或掃描 evidence 放在 `reports/`。
- 本機路徑、個人筆記、未公開計畫不可放進 canonical registry data。
- Canonical AGENTS 項目類型與 scope records 放在 `registry/agent-instructions.registry.json`。
- 產生出的 AGENTS search / index artifacts 放在 `reports/`。
- 產生出的 context-budget audit artifacts 放在 `reports/`。
- `AGENTS.md` 是本 repo 唯一 authoritative agent-runtime instruction file。
- `AGENTS.zh-tw.md` 若存在，只是 human-readable reference，不受 bilingual publishable-document rule 強制要求。
- live user/home-level Global AGENTS file 仍是外部 runtime input。DevGov 可以規劃、索引、驗證與協調它，但不得宣稱擁有 platform/runtime authority，也不得靜默改寫它。

這個模型對齊 UniText registry 架構：共享內容是 canonical，本機 overlay 分離，並由驗證腳本證明 artifacts 仍可使用。

## 指令範圍與優先序

DevGov 可以文件化並測試可觀察的 file-based instructions，但 agent 仍必須先遵守更高層的 runtime instructions。

分類 AGENTS 規則時，使用以下 scope layers：

1. `platform-runtime`：platform、system、developer、runtime 與目前啟用的 tool instructions。即使無法從 repo 檔案直接檢查，也具有最高權威。
2. `global-home`：runtime 載入的使用者層級或 home-level AGENTS instructions。
3. `workspace`：workspace overlays，例如共享儲存拓撲、shell entry rules 與跨 repo 慣例。
4. `repo-local`：本 repo 的 authoritative `AGENTS.md`、README、registry contracts 與 docs。`AGENTS.zh-tw.md` 若存在，只是 reference material。
5. `subtree`：未來 folder-local AGENTS overlays。它們可以縮小該 subtree 的行為，但不得繞過父層 safety rules。
6. `task-request`：目前 operator request。它可以選擇工作與縮小範圍，但不能覆寫 safety、secret、publication 或 reversibility rules。

建立 index 或 report 時，只有目標路徑範圍內的規則標為 `effective`。目標範圍外的規則標為 `evidence-only`；缺失或無法讀取的層級標為 `unresolved`，不得臆造規則。

## Global Management Planning

DevGov 擁有 Global-layer AGENTS governance 的 planning surface。這表示它可以：

- 定義 Global-layer taxonomy、readiness checks 與 promotion workflow
- 對照 global-home rules 與 workspace、repo-local、subtree、task-request layers
- 產生 local query artifacts，協助 operators 檢查 effective instruction scope
- 透過 reviewed plans 建議 live Global AGENTS file 更新

DevGov 不得靜默編輯 live Global AGENTS file、不得把其完整內容複製進 canonical registry data，也不得把 Global-layer plans 視為高於 platform/runtime instructions 的權威。任何 live Global AGENTS file 更新都需要明確 operator intent、reviewed diff 與 rollback evidence。

## AGENTS Runtime Source

Agents 必須把 `AGENTS.md` 視為本 repo 唯一 authoritative runtime instruction source。

`AGENTS.zh-tw.md` 可以存在，讓 human operators 用繁體中文審閱 policy，但不得引入 `AGENTS.md` 沒有的規則。若兩份文件內容 drift，以 `AGENTS.md` 為準，並應修正或移除繁中參考版。

新 repo 預設不要求為 `AGENTS.md` 建立繁體中文 companion。Bilingual public-document rule 適用於人類面向的 operational 或 release documentation，不適用於 agent-runtime instruction files；除非 repo 明確把 companion 定位為 human reference material。

## 外部審查採納

此版本採納兩個外部審查視角作為長期 policy：

1. Scope and safety review：明確標示非檔案 runtime authority，保留 read-only audit 作為預設，並實際驗證每個 scope layer，而不是假設 repo-local AGENTS 可以涵蓋整個 stack。
2. Interoperability and search review：用穩定 item type 分類 AGENTS rules，產生可查詢的 text / JSON index，並把 UniText / project-map 相容性維持為 adapter concern，不把 local-only evidence 複製進 canonical data。

Review packets 與原始 reviewer notes 若有產生，應放在 `reports/`。只有已採納且會長期生效的建議，才提升到本檔或 `registry/agent-instructions.registry.json`。

## 執行原則

- 優先使用最貼近任務的既有 DevGov command、scanner、registry validator 或 template。
- Scans 與 audits 預設保持 read-only，除非已存在明確 reviewed apply path，且 operator 要求使用。
- 產生出的 `reports/` artifacts 是 evidence，不是 canonical policy。
- 只有穩定且已 review 的 records 才提升到 `registry/`。
- 只有在 ambiguity 會實質改變風險、行為或輸出時，才詢問釐清。

## 安全與套用門檻

- Registry promotion 必須具備已審查的 stable IDs、required fields，且不能包含 machine-local paths 或 secret values。
- Terminal fixes、startup registration、public route promotion 與 worktree cleanup 在 mutation 前都需要明確 operator intent。
- 任何會碰到使用者設定的 apply path，都必須先建立或指出可 review 的 backup 或 rollback path。
- Generated reports 可以包含 machine-local evidence；canonical registry data 不得包含。
- Public 或 shared outputs 必須排除 private planning notes、raw reviewer transcripts、secrets 與 local-only paths。

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

API key registry 也遵守同一原則。只保存穩定的 credential-location metadata，例如 service、environment variable name、storage location type、access method、rules、status 與 provider settings URL。不要把 values、credential file contents、完整本機 credential paths、shell history 或 command lines 放進 `registry/api-keys.registry.json`。

AGENTS instruction registry 也遵守同一原則。只保存穩定的 scope IDs、item types、requirements、enforcement notes、evidence anchors、status 與 source labels。不要把 machine-local AGENTS paths、raw reviewer transcripts、完整本機 command lines 或暫時 investigation evidence 放進 `registry/agent-instructions.registry.json`。

Worktree reports 也放在 `reports/`。它們可以包含 machine-local paths，因為這些是本機 evidence，不是 canonical registry data。

## Agent Instruction Registry Contract

將 AGENTS rules 提升到 `registry/agent-instructions.registry.json` 時，使用以下 item types：

- `scope-layer`：指令在 stack 中的適用位置。
- `authority-order`：優先序、覆寫限制與衝突處理。
- `safety-gate`：review、backup、read-only 或明確 operator intent 要求。
- `data-contract`：canonical fields、storage locations 與 redaction boundaries。
- `workflow-control`：scan、apply、repair、cleanup 或 publication 的有序步驟。
- `tool-entry`：特定任務類型應使用的 tool 或 command entry path。
- `context-budget`：降低 startup 或 per-task context 的 prompt、tool、skill、memory 與 file-context loading 規則，但不得削弱安全性。
- `verification`：完成前必須執行的 tests、validators、doctors 或 generated artifacts。
- `interoperability`：與相鄰治理系統的對齊點。
- `external-review-input`：已採納且改變 durable policy 的審查建議。

每個被提升的 record 都必須包含穩定的 `id`、`type`、`layer`、`appliesTo`、`requirement`、`enforcement`、`evidence`、`status`、`source` 與 `notes`。

變更 AGENTS governance 後，執行 `npm run scan:agents`。此命令會將產生出的查詢 artifacts 寫到 `reports/agent-instructions-index.json` 與 `reports/agent-instructions-index.txt`。

## Context Budget Governance

預設 task routing 應從 no-tool mode 開始。只有當 request 無法靠目前任務文字與已載入的安全 context 完成時，才升級。

設計或審查 Global AGENTS、workspace overlays、UniText adapters 與 skill routing 時，使用以下 budget levels：

1. `L0-no-tool`：自然語言回答、改寫、翻譯、一般腦暴與靜態推理。
2. `L1-light-retrieval`：檔名、metadata、本機 registry summaries 或短片段。
3. `L2-targeted-retrieval`：特定檔案回答、有限比較或精確 evidence chunks。
4. `L3-artifact`：需要對應 skill 或 connector 的 PDF、DOCX、slides、spreadsheet、image 或其他 artifact 建立與編輯。
5. `L4-complex`：多檔案綜合、大型轉換、data-heavy analysis，或明確合理化的高 context 任務。

Always-loaded surface 應限制在 safety rules、authority order、credential handling、Git 與 deletion safety，以及精簡 routing map。Tool schemas、connector details、skill bodies、project histories 與長背景筆記都應留在 task trigger 後 lazy-loaded。

Skill routing records 應標示 trigger、最小 instruction path 或 registry entry，以及 avoid-when cases。不要把完整 skill bodies、完整 platform tool descriptions、本機路徑、private planning notes 或 raw conversation archives 貼進 canonical registry records。

稽核本機 prompt overhead 時，執行 `npm run scan:context-budget`。此命令會把本機 evidence 寫到 `reports/context-budget-audit.md` 與 `reports/context-budget-audit.json`。報告只是估算：platform system prompts、developer instructions、native tool schemas 與 connector schemas 屬於 runtime-owned surface，只能從本機檔案部分觀察。

## Port Governance Rules

1. 修改 port allocation rules 前，先讀 `registry/ports.registry.json`。
2. 不要新增 random port 或 auto-increment fallback port。
3. 預設 development host 是 `127.0.0.1`。
4. DevGov 儀表板配置是 `127.0.0.1:3000`；不得靜默改用其他 dashboard port。
5. Service startup commands 應先使用 `scripts/require-governed-port.mjs` 這類 governed-port preflight entry，再 bind 已 review 的 port。
6. 任何 `0.0.0.0` binding 都必須以 `visibility` 與 `notes` 文件化。
7. 掃描目標專案時，不得執行目標專案的 config files。
8. 不得從 `.env` files 印出 secrets；reports 只能顯示 port 與 host 相關值。
9. 既有專案掃描維持 read-only，除非未來明確提供已審查的 patch generation command。
10. Version 1 不包含 `apply-project` command；所有目標專案修改都維持 manual 與 review-gated。

## Terminal、Startup、Public Route、API Key 與 Search 規則

1. Terminal profile 掃描採 audit-first。除非使用者明確要求 reviewed apply command，否則不得修改 Windows Terminal settings。
2. 套用任何 Terminal settings fix 前，必須先在 settings 檔旁建立 timestamped backup。
3. Startup 掃描可以檢查 Startup folder、Registry Run、Scheduled Tasks 與 Windows services，但完整 command lines 只能留在 reports。
4. Cloudflare route 掃描不得讀取或印出 credential JSON、certs、private keys、API tokens、PEM 內容。
5. Public routes 提升到 `registry/public-routes.registry.json` 前，必須記錄 exposure class、Access requirement、health URL 與 review status。
6. API key 掃描可以記錄 variable names 與 storage scopes，但不得印出 values。Process-only variables 只作為 report evidence，除非 operator 明確提升。
7. 靜態文件檢索只寫入 `reports/` 本機 artifacts，不得啟動 service 或配置 port。
8. Dashboard startup 採 opt-in。Registration scripts 只有在 operator 明確執行時，才可寫入 Windows Startup entries。

## UniText 協調

當 AGENTS governance 需要共享視覺化、共享 adapter behavior 或跨專案 source attribution 時，DevGov 應與 UniText 協調。目前低耦合路徑如下：

1. DevGov 在 `registry/agent-instructions.registry.json` 擁有 canonical AGENTS taxonomy。
2. DevGov 在 `reports/` 產生本機 query artifacts。
3. UniText project-map 或 governance-folder adapters 可在 operator 明確指向本 repo 時，讀取這些 generated artifacts 或 canonical registry。
4. DevGov 不得把 UniText local paths、generated browser state 或 private planning notes 複製到 canonical registry records。

一般 DevGov AGENTS 編輯不需要協調；只有在變更 shared adapter contracts、新增 UniText dependency、或將 generated governance views 發布到本機以外時，才需要先協調。

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
npm run scan:agents
npm run validate:registry
npm run doctor
```
