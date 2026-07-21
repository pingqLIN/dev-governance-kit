# AGENTS.md 中文參考版

> 僅供人類閱讀的參考版。
> `AGENTS.md` 是本 repo 唯一的權威 agent-runtime 指令來源。
> 若本檔與 `AGENTS.md` 有差異，以 `AGENTS.md` 為準。

## 專案角色

`DevGov` 負責管理可重複使用的 user/home-level 開發治理資產。

此儲存庫預期放在操作者（operator）的 user/home-level Codex storage，例如 home-level governance folder。它的角色高於單一 workspace 儲存庫，但仍低於平台、系統、developer 與 runtime 指令。

目前專案範圍涵蓋 global-home 與本機開發環境治理：

- 規劃、分類與稽核 Global AGENTS 職責
- 維護 Global-layer 治理紀錄，但不把機器本機（machine-local）指令路徑複製進權威 registry data
- 提供 user/home-level 指令範圍、項目類型與證據錨點的可查詢索引
- 發現專案中的 port 使用情況
- 維護權威 port registry
- 稽核 Windows Terminal profile 資產引用
- 盤點 Codex 建立或開發用途的開機啟動項
- 將常駐本地端服務 Agents 與一般 services 分別盤點
- 盤點開發用 API key 的存放位置，但不讀取或保存 credential 值
- 盤點 Git 關聯 worktree，並避免重複計算同一個儲存庫
- 管理 Cloudflare / public route governance 紀錄
- 產生本機靜態文件檢索工件（artifacts）
- 治理 AGENTS 指令範圍、項目類型與可查詢索引
- 稽核可觀察的 Codex context-budget 來源，並透過精簡索引路由工具（tools）或技能（skills）
- 在已審查的長期 port `127.0.0.1:3000` 提供本機 loopback 儀表板
- 透過 Doctor command 執行自我檢測、有限自我修復與本機報告產生
- 驗證衝突與必要欄位
- 產生 agent 啟動服務前可遵循的範本

## 權威來源

- 權威共享資料放在 `registry/`。
- 可重複使用、面向目標專案的 read-model 資產放在 `templates/`。
- Runtime 或掃描證據放在 `reports/`。
- 本機路徑、個人筆記、未公開計畫不可放進權威 registry data。
- 權威 AGENTS 項目類型與範圍紀錄放在 `registry/agent-instructions.registry.json`。
- 產生出的 AGENTS 搜尋 / 索引工件（artifacts）放在 `reports/`。
- 產生出的 context-budget 稽核工件（audit artifacts）放在 `reports/`。
- `AGENTS.md` 是本 repo 唯一的權威 agent-runtime 指令檔案。
- `AGENTS.zh-tw.md` 若存在，只是人類可讀參考，不受「雙語發佈文件規則」強制要求。
- live user/home-level Global AGENTS file 仍是外部 runtime input。DevGov 可以規劃、索引、驗證與協調它，但不得宣稱擁有 platform/runtime authority，也不得靜默改寫它。

本模型對齊 UniText registry 架構：共享內容是權威，本機 overlay 分離，並由驗證腳本證明 artifacts 仍可使用。

## 指令範圍與優先序

DevGov 可以文件化並測試可觀察的 file-based 指令，但 agent 仍必須先遵守更高層的 runtime instructions。

分類 AGENTS 規則時，使用以下 scope 層級：

1. `platform-runtime`：platform、system、developer、runtime 與目前啟用的 tool instructions。即使無法從 repo 檔案直接檢查，也具有最高權威。
2. `global-home`：runtime 載入的使用者層級或 home-level AGENTS 指令。
3. `workspace`：workspace overlays，例如共享儲存拓撲、shell 進場規則（entry rules）與跨 repo 慣例。
4. `repo-local`：本 repo 的權威 `AGENTS.md`、README、registry 契約與文件。`AGENTS.zh-tw.md` 若存在，只是參考資料。
5. `subtree`：未來 folder-local AGENTS overlays。它們可以縮小該 subtree 的行為，但不得繞過父層安全規則。
6. `task-request`：目前 operator request。它可以選擇工作與縮小範圍，但不能覆寫安全（safety）、機密（secret）、發布（publication）或可還原性（reversibility）規則。

建立索引（index）或報告（report）時，只有目標路徑範圍內的規則標為 `effective`。目標範圍外的規則標為 `evidence-only`；缺失或無法讀取的層級標為 `unresolved`，不得臆造規則。

## 全域治理規劃

DevGov 擁有 Global-layer AGENTS 治理的規劃面。這表示它可以：

- 定義 Global-layer 分類法（taxonomy）、就緒檢查（readiness checks）與推行流程（promotion workflow）
- 對照 global-home 規則與 workspace、repo-local、subtree、task-request 層級
- 產生本機查詢工件（artifacts），協助操作者檢查有效指令範圍
- 透過 reviewed 計畫建議更新 live Global AGENTS file

DevGov 不得靜默編輯 live Global AGENTS file，不得把其完整內容複製進權威 registry data，也不得把 Global-layer 計畫視為高於 platform/runtime instructions 的權威。任何 live Global AGENTS file 更新都需要明確 operator intent、已審查 diff 與 rollback 證據。

## AGENTS 執行來源

Agent 必須把 `AGENTS.md` 視為本 repo 唯一的權威 runtime 指令來源。

`AGENTS.zh-tw.md` 可以存在，讓人類操作者用繁體中文審閱政策，但不得引入 `AGENTS.md` 沒有的規則。若兩份文件內容不一致，以 `AGENTS.md` 為準，並應修正或移除繁中參考版。

新 repo 預設不要求為 `AGENTS.md` 建立繁體中文 companion。雙語公開文件規則適用於人類面向的 operational、release 或 audit 文件，不適用於 agent-runtime 指令檔；除非 repo 明確把 companion 定位為 human reference material。

## 文件伴隨版政策

- 重要且面向 public、operator 或 release 的 Markdown 文件應提供繁體中文 companion；除非 repo-local convention 明確指定其他格式，否則使用 `.zh-tw.md` 後綴。
- 供人閱讀的審計文件與 Markdown 審計報告必須提供繁體中文 companion，包括供操作者審閱的產生（generated）或僅本機（local-only）報告。
- 僅供機器讀取的 JSON、YAML 等審計 artifacts 不受 companion 要求約束。
- 除非 repo 明確定義其他權威模型，無後綴的英文文件仍是權威來源。繁中 companion 必須保留原文件的遮罩，不得加入原文沒有的 secrets、敏感本機 evidence 或 machine-local 細節。

## 外部審查採納

此版本採納兩個外部審查視角作為長期 policy：

1. Scope and safety review：明確標示非檔案 runtime authority，保留只讀稽核（read-only audit）作為預設，並實際驗證每個 scope layer，而不是假設 repo-local AGENTS 可以涵蓋整個 stack。
2. Interoperability and search review：用穩定 item type 分類 AGENTS 規則（rules），產生可查詢的 text / JSON 索引，並把 UniText / project-map 相容性維持為 adapter concern，不把 local-only evidence 複製進權威資料（canonical data）。

Review packets 與原始 reviewer notes 若有產生，應放在 `reports/`。只有已採納且會長期生效的建議，才提升到本檔或 `registry/agent-instructions.registry.json`。

## 執行原則

- 優先使用最貼近任務的既有 DevGov 命令、掃描器（scanner）、registry 驗證器（validator）或模板（template）。
- Scans 與 audits 預設保持只讀，除非已存在明確 reviewed 的 apply path，且操作者要求使用。
- 產生出的 `reports/` artifacts 是 evidence，不是權威 policy。
- 只有穩定且已審核 review 的紀錄（records）才提升到 `registry/`。
- 只有在歧義（ambiguity）會實質改變風險、行為或輸出時，才詢問釐清。

## 安全與套用門檻

- Registry promotion 必須具備已審查的 stable IDs、required fields，且不能包含 machine-local paths 或 secret values。
- Terminal fixes、startup registration、public route promotion 與 worktree cleanup 在 mutation 前都需要明確 operator intent。
- 任何會碰到使用者設定的 apply path，都必須先建立或指出可 review 的 backup 或 rollback path。
- Generated reports 可以包含 machine-local evidence；canonical registry data 不得包含。
- Public 或 shared outputs 必須排除 private planning notes、raw reviewer transcripts、secrets 與 local-only paths。

## 資料輸入規格

Registry entries 是系統管理紀錄，不是一般敘述性筆記（prose notes）。Port 欄位都必須保留：

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

本地端服務 Agent registry 也遵守同一原則。不要把 service-local home、bearer token paths、日誌（logs）、generated indexes 或完整 commands 放進 `registry/local-agents.registry.json`。

API key registry 也遵守同一原則。只保存穩定的 credential-location metadata，例如 service、environment variable name、storage location type、access method、rules、status 與 provider settings URL。不要把 values、credential file contents、完整本機 credential paths、shell history 或 command lines 放進 `registry/api-keys.registry.json`。

AGENTS instruction registry 也遵守同一原則。只保存穩定的 scope IDs、item types、requirements、enforcement notes、evidence anchors、status 與 source labels。不要把 machine-local AGENTS paths、raw reviewer transcripts、完整本機 command lines 或暫時 investigation evidence 放進 `registry/agent-instructions.registry.json`。

Worktree reports 也放在 `reports/`。它們可以包含 machine-local paths，因為這些是本機 evidence，不是 canonical registry data。

## Agent Instruction Registry Contract

將 AGENTS 規則（rules）提升到 `registry/agent-instructions.registry.json` 時，使用以下 item types：

- `scope-layer`：指令在 stack 中的適用位置。
- `authority-order`：優先序、覆寫限制與衝突處理。
- `safety-gate`：review、備份（backup）、只讀（read-only）或明確 operator intent 要求。
- `data-contract`：權威欄位（canonical fields）、存放位置（storage locations）與遮罩邊界（redaction boundaries）。
- `workflow-control`：scan、apply、repair、cleanup 或 publication 的有序步驟。
- `tool-entry`：特定任務類型應使用的工具（tool）或命令入口（command entry）路徑。
- `context-budget`：降低 startup 或 per-task context 的 prompt、工具（tool）、技能（skill）、記憶體（memory）與 file-context loading 規則，但不得削弱安全性。
- `verification`：完成前必須執行的測試（tests）、驗證器（validators）、doctor 或 generated artifacts。
- `interoperability`：與相鄰治理系統的對齊點。
- `external-review-input`：已採納且改變 durable policy 的審查建議。

每個被提升的 record 都必須包含穩定的 `id`、`type`、`layer`、`appliesTo`、`requirement`、`enforcement`、`evidence`、`status`、`source` 與 `notes`。

變更 AGENTS governance 後，執行 `npm run scan:agents`。此命令會將產生出的查詢 artifacts 寫到 `reports/agent-instructions-index.json` 與 `reports/agent-instructions-index.txt`。

## Context Budget Governance

預設 task routing 應從 no-tool mode 開始。只有當請求（request）無法靠目前任務文字與已載入的安全 context 完成時，才升級。

設計或審查 Global AGENTS、workspace overlays、UniText adapters 與 skill routing 時，使用以下 budget levels：

1. `L0-no-tool`：自然語言回答、改寫、翻譯、一般腦暴與靜態推理。
2. `L1-light-retrieval`：檔名、中繼資料（metadata）、本機 registry summaries 或短片段。
3. `L2-targeted-retrieval`：特定檔案回答、有限比較或精確 evidence chunks。
4. `L3-artifact`：需要對應 skill 或 connector 的 PDF、DOCX、slides、spreadsheet、image 或其他 artifact 建立與編輯。
5. `L4-complex`：多檔案綜合、大型轉換、資料密集（data-heavy）分析，或明確合理化的高 context 任務。

Always-loaded surface 應限制在安全規則（safety rules）、權威順序（authority order）、憑證處理（credential handling）、Git 與刪除安全（deletion safety），以及精簡 routing map。Tool schemas、connector details、skill bodies、project histories 與長背景筆記都應留在 task trigger 後 lazy-loaded。

Skill routing records 應標示 trigger、最小 instruction path 或 registry entry，以及 avoid-when cases。不要把完整 skill bodies、完整 platform tool descriptions、本機路徑、private planning notes 或 raw conversation archives 貼進權威 registry 記錄。

稽核本機 prompt overhead 時，執行 `npm run scan:context-budget`。此命令會把本機 evidence 寫到 `reports/context-budget-audit.md` 與 `reports/context-budget-audit.json`。報告只是估算：platform system prompts、developer instructions、native tool schemas 與 connector schemas 屬於 runtime-owned surface，只能從本機檔案部分觀察。

## Shared Resource Coordination

Lag、timeout、browser automation 變慢、tool response 延遲或 UI 卡頓，不等於目標專案不穩。先比較 target-local evidence 與 shared host pressure，再判斷是 `target-unhealthy`、`environment-contention` 或 `unknown-degraded`。

優先使用既有本機機制，不新增沉重常駐服務：

- DevGov dashboard `/api/state`、`/api/service-status` 與 `/api/resource-coordination`。
- `registry/resource-coordination.registry.json` 作為權威 shared-resource coordination 合約。
- `npm run scan:resource-coordination` 產生 on-demand 輕量快照到 `reports/`。
- 既有 service-control、dashboard event reports 與作業系統 CPU、記憶體、行程（process）、GPU、磁碟（disk）、browser 或畫面觀察（screen-observation）工具。
Codex memory short-term resource hints 只能作為 soft awareness，不得當成 authoritative current state。

狀態必須 time-bound。Resource snapshots 與 exclusive-resource claims 需要 generated、observed、refreshed 或 expiry timestamps；過期 claim 或 snapshot 只能作為歷史 evidence，不能阻擋目前工作或支撐目前 remediation。

使用容量受限（capacity-limited）或獨占（exclusive）資源前，先登記意圖，尤其是：

- 已認證的 browser profiles、browser automation sessions、DevTools sessions 或 extension state；
- GPU-heavy 3D rendering、WebGL/WebGPU、canvas verification、video rendering 或 local model 推論（inference）；
- 前景畫面（foreground screen）、指標（pointer）、鍵盤、模擬器（simulator）、顯示（display）或互動式桌面控制。

登記應使用 resource-coordination surface 或 sanitized report/event artifact。不得把 secrets、cookies、session data、credential paths、完整本機路徑、command lines、含有私人資料的 screenshots 或 personal activity 放進權威 registry data。

Codex memory 可以在 explicit memory-update workflow 被要求時，記錄近期資源使用的正向、短期 RCG hints。Hints 必須包含 `observedAt`、`validUntil`、`authority: soft-hint-only` 與 `afterExpiry: historical-only`。不要寫「目前無佔用」這類負向 availability state。Missing、duplicated、delayed 或 expired hints 不得被視為 lock、task gate、transaction record、scheduling approval，或資源目前可用的證明。

Project AGENTS rollout 應使用 thin resource-coordination overlay templates 與 proposal-only scanner。用 `npm run scan:agents -- --agents-file <path>` 產生 proposal reports，並把 evidence 保留在 `reports/`。不要 bulk-apply overlay，也不要靜默編輯目標專案（target project）的 AGENTS files。

Codex memory-hint rollout 應使用 proposal-only template `templates/CODEX.memory.rcg-hint.md` 與 `npm run scan:resource-coordination -- --memory-hint-proposal`。Scanner 可以把 reviewed proposal artifacts 寫到 `reports/`，但不得寫入真實 Codex memory；明確 memory-update request 應在 review 後交由 `memory-field` 或 runtime-owned memory update architecture 處理。

真實 Codex memory updates 需要 `templates/CODEX.memory.rcg-update-gate.md` 的 reviewed gate。Proposal generation、planning approval、acknowledgement-only replies、timeouts、dashboard refreshes、scanners、tests、Doctor runs 與模糊 OK 都不足以授權 memory writes。使用任何 runtime-approved memory update mechanism 前，必須先 review 精確 JSON proposal。

Review 精確 JSON proposal 後，交由 `memory-field` 或 runtime-owned memory update architecture 處理真實 memory update。DevGov scanners、Doctor 與 reports 必須維持 proposal-only，不得寫入真實 memory。

Scheduling 是 future work，仍維持 review-gated。Automatic throttling、pausing、restarting、killing、priority changes 或 cross-project scheduling 都需要另一個明確 operator request、service-control review、rollback plan 與 privacy review。

## Port Governance Rules

1. 修改 port allocation rules 前，先讀 `registry/ports.registry.json`。
2. 不要新增 random port 或 auto-increment fallback port。
3. 預設 development host 是 `127.0.0.1`。
4. DevGov 儀表板配置是 `127.0.0.1:3000`；不得靜默改用其他 dashboard port。
5. Service startup commands 應先使用 `scripts/require-governed-port.mjs` 這類 governed-port preflight entry，再綁定（bind）已審核（review）的 port。
6. 任何 `0.0.0.0` binding 都必須以 `visibility` 與 `notes` 文件化。
7. 掃描目標專案時，不得執行目標專案的 config files。
8. 不得從 `.env` files 印出 secrets；`reports` 只能顯示 port 與 host 相關值。
9. 既有專案掃描維持只讀，除非未來明確提供已審查的 patch generation command。
10. Version 1 不包含 `apply-project` command；所有目標專案修改都維持手動（manual）與 review-gated。

## Terminal、Startup、Public Route、API Key 與 Search 規則

1. Terminal profile 掃描採 audit-first。除非使用者明確要求已審查（reviewed）的 apply command，否則不得修改 Windows Terminal settings。
2. 套用任何 Terminal settings 修正（fix）前，必須先在 settings 檔旁建立 timestamped backup。
3. Startup 掃描可以檢查 Startup folder、Registry Run、Scheduled Tasks 與 Windows services，但完整 command lines 只能留在 `reports/`。
4. Cloudflare route 掃描不得讀取或印出 credential JSON、憑證（certs）、私密金鑰（private keys）、API tokens、PEM 內容。
5. Public routes 提升到 `registry/public-routes.registry.json` 前，必須記錄 exposure class、Access requirement、health URL 與 review status。
6. API key 掃描可以記錄變數名稱（variable names）與儲存範圍（storage scopes），但不得印出值（values）。Process-only 變數僅作為報告證據（report evidence），除非操作者明確批准提升（elevation）。
7. 靜態文件檢索只寫入 `reports/` 本機 artifacts，不得啟動 service 或設定 port。
8. Dashboard startup 採 opt-in。Registration scripts 只有在操作者明確執行時，才可寫入 Windows Startup entries。

## 本機防毒治理

1. 本機防毒與 endpoint-protection 阻擋必須先使用 `npm run av:triage` 作為 DevGov 入口，再考慮任何 exclusion。
2. Codex 與 agent workflows 可使用 `npm run codex:av-hook` 作為 trigger wrapper，當 alert text、command output 或 supplied paths 顯示防毒阻擋時轉入 triage。
3. Antivirus triage 與 hook handling 預設都是 dry-run，不得關閉 protection、清除 quarantine、還原檔案、加入 exclusions、修改 firewall rules，或修改 browser / OS security settings。
4. Triage evidence 可以包含 Defender threat detections、Defender 排除偏好（exclusion preferences）、檔案雜湊（file hashes）、本機路徑、指令輸出（command logs）與生成報告詳情（generated report details）；這些 evidence 屬於 `reports/`，不得放入權威 registry data。
5. Candidate exclusions 必須是 exact generated files 或窄範圍 generated artifact folders；可用時應附重建證據（rebuild evidence）。
6. 預設拒絕 drive roots、user profiles、project roots、source folders、`.git`、整個 `node_modules`、browser profiles、credential stores，以及 common interpreter 或 browser process exclusions。
7. 如果 alert 提到 credential theft、勒索軟體（ransomware）、後門（backdoor）、持久化（persistence）、混淆（obfuscation）、注入（injection）、篡改（tampering）或可疑網路行為（suspicious network behavior），必須留在 security triage，不得產生 allowlist candidates。
8. 真正套用 antivirus exclusion 不屬於 v1 command surface，必須有另一個明確操作者（operator）需求與最新證據（fresh evidence）確認。

## UniText 協調

當 AGENTS governance 需要共享視覺化、共享 adapter behavior 或跨專案 source attribution 時，DevGov 應與 UniText 協調。目前低耦合路徑如下：

1. DevGov 在 `registry/agent-instructions.registry.json` 維護權威 AGENTS taxonomy。
2. DevGov 在 `reports/` 產生本機 query artifacts。
3. UniText project-map 或 governance-folder adapters 可在操作者明確指向本 repo 時，讀取這些 generated artifacts 或權威 registry。
4. DevGov 不得把 UniText 本機路徑（local paths）、生成的瀏覽器狀態（generated browser state）或私人規劃筆記（private planning notes）複製到權威 registry records。

一般 DevGov AGENTS 編輯不需要協調；只有在變更 shared adapter contracts、新增 UniText dependency、或將 generated governance views 發布到本機以外時，才需要先協調。

## Worktree Governance Rules

1. Worktree scans 是 read-only，不可 remove、prune、stage、commit、reset、checkout 或 discard files。
2. 專案數應以 Git common-dir 計算，不以 checkout folder 數計算。
3. 新 linked worktree 優先使用 `Q:\Projects\<repo-name>.worktrees\<task-or-branch>-<yyyyMMdd-HHmmss>`。
4. 既有 `Q:\Projects\<repo-name>-worktrees\...` container 仍有效，掃描器必須納入。
5. `*.worktrees` 與 `*-worktrees` folder 視為操作型儲存空間，不視為獨立 project。
6. Cleanup recommendations 只是訊號（signal）；實際 `git worktree remove` 與 `git worktree prune` 必須另經 review gate。
7. Dirty 或 unmerged worktrees 在移除決策前必須先備份，包含 branch refs、patches 與 local artifacts，並放到已審查的 `.clean` 位置。

## 驗證

回報完成批次前，先執行：

```powershell
npm test
npm run scan:agents
npm run validate:registry
npm run doctor
```
