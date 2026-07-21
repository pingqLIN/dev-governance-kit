# AGENTS_migration_plan.zh-tw.md 建議移動內容清單

> 目的：將原始 `AGENTS.md` 重構為「系統層級主治理規範」，並把平台、workspace、本機路徑、工具實作、暫時性流程移至較窄的 overlay 或環境檔。
>
> 本檔是 DevGov `templates/global/` 底下的遷移審查文件，不是 agent-runtime instruction file。
>
> 建議搭配 `templates/global/AGENTS.md` 使用。該檔對應原始附件 `AGENTS.optimized.md`，是可在審閱後安裝到 live global-home 位置並改名為 `AGENTS.md` 的完整修正版。不要用它覆寫 DevGov repo-local `AGENTS.md`。

產出日期：2026-07-06

## 1. 總體遷移原則

新版主檔應只保留穩定、跨 repository、平台中立的治理規範。下列資訊應移出 global `AGENTS.md`：

- 平台特定行為，例如 Codex 或 ChatGPT 的輸出節奏、工具名稱、工具路由。
- 本機環境事實，例如磁碟代號、固定 workspace 路徑、本機帳號、本機 alias。
- Repo 專屬 workflow，例如 branch naming、test command、design system、role inventory。
- Workspace 專屬規則，例如預設開發根目錄、DevGov workspace gate、專案 registry。
- Credential/authentication 相關細節，例如 API key provider、token location、登入方式。
- 暫時性或實驗性工具實作，例如某個 MCP server 的臨時設定。

主檔應保留：

- authority order / 權限順序，
- non-relaxable global invariants / 不可放鬆的全域底線，
- risk levels / 風險分級，
- Git safety，
- public push hygiene，
- file deletion safety，
- data and secret handling，
- tool / MCP / web governance 的抽象規範，
- command execution baseline，
- testing and verification，
- reporting and audit trail，
- instruction file hygiene。

## 2. 建議移動內容決策表

| 原內容 / 段落 | 類型 | 建議目標檔 | 處理方式 | 理由 |
|---|---|---|---|---|
| `## Codex execution behavior` | platform-specific | `AGENTS.CODEX.md` | 搬移 | 這是 Codex 執行平台的回報節奏，不應放在跨平台 global baseline。 |
| `Do not send optional commentary...` | platform-specific | `AGENTS.CODEX.md` | 搬移並保留原語意 | 可保留為 Codex overlay 的 progress reporting rule。 |
| `## 2.2 Project Workspace Location` | workspace/path-specific | `ENVIRONMENT.md` 或 workspace-level `AGENTS.md` | 搬移 | `Q:\` 與 `C:\Users\miles` 是本機與 workspace 事實，不是 global policy。 |
| `Project development must use directories under Q:\ by default.` | path-specific | `ENVIRONMENT.md` | 搬移 | 固定磁碟代號屬於 local environment fact。 |
| `If operating only under Q:\ cannot satisfy... C:\Users\miles...` | path-specific / permission gate | `ENVIRONMENT.md` + workspace overlay | 搬移並改成 approved roots gate | 保留安全意圖，但不讓 global file 寫死使用者本機路徑。 |
| Browser tool names 或未來新增的工具名稱 | platform/tool-specific | `AGENTS.CHATGPT.md`、`AGENTS.CODEX.md` 或 workspace overlay | 不應放入 global | Global 只保留「選擇最窄工具」原則。 |
| MCP server 具體名稱、啟動命令、版本、可讀路徑 | tool implementation / workspace-specific | workspace-level `AGENTS.md`、`.devgov/agent-policy.json`、MCP catalog | 不應放入 global | Global 只留最低權限、tool filtering、approval、audit 原則。 |
| 本機 aliases、帳號、路徑、drive topology | environment-specific | `ENVIRONMENT.md` | 搬移或新增 | 原始檔已定義這類資訊應放在 `ENVIRONMENT.md` 或 narrower overlays。 |
| Repo branch naming conventions | repo-specific | repo-local `AGENTS.md` | 保持 extension model | Global 只說 repo 可定義，不寫死任何 convention。 |
| Repo test commands | repo-specific | repo-local `AGENTS.md` | 保持 extension model | Global 只保留 verification ladder。 |
| Design system / project structure | repo-specific | repo-local `AGENTS.md` | 保持 extension model | 避免跨 repo 污染。 |
| Local agent role inventory | repo/workspace-specific | repo-local 或 workspace-level `AGENTS.md` | 保持 extension model | Global 只保留 fallback aliases，例如 `explorer`、`reviewer`。 |
| Credential/authentication-specific procedure | credential-specific | secure local doc / secret manager / environment overlay | 不進 global | Global 只能定義 secret handling 底線，不應寫 secret location 或 token handling detail。 |
| Temporary or experimental workflow | temporary / experimental | 專案 issue、local notes、workspace overlay | 不進 global | Global 應穩定，避免短期流程長期污染。 |

## 3. 建議建立或更新的補充檔

### 3.1 `AGENTS.CODEX.md`

用途：Codex-specific overlay。只放 Codex 平台專屬行為。

建議內容：

```md
# AGENTS.CODEX.md

> Codex-specific overlay. This file refines the global `AGENTS.md` only for
> Codex execution behavior.

## Progress Reporting

Do not send optional commentary. Spend time on thinking and task execution.
Only report progress when it changes the user's next decision, indicates a
blocking issue, or summarizes completed verification.

## Authority

This file refines global `AGENTS.md` for Codex only. It must not relax global
non-relaxable invariants, including Git safety, privacy, credential handling,
file deletion safety, approval gates, or platform/system/developer/runtime
instructions.
```

### 3.2 `ENVIRONMENT.md`

用途：本機環境事實。可放路徑、磁碟、local aliases、工具可用性，但不能放 secret value。

建議內容：

```md
# ENVIRONMENT.md

> Local environment facts. This file is not a cross-repository governance
> baseline and must not contain secret values.

## Approved Workspace Roots

- Project development defaults to `Q:\`.
- Access outside `Q:\`, including `C:\Users\miles`, requires explicit user
  approval unless a narrower overlay authorizes a specific path for the current
  task.

## Path Access Rule

If the task cannot be completed inside the approved workspace root, the agent
must report:

- requested path,
- reason,
- risk level,
- safer alternative if available.

## Local Tool Availability

Document local tools, browser availability, MCP connectors, and DevGov service
endpoints here or in a workspace overlay. Do not include secret values.
```

### 3.3 workspace-level `AGENTS.md`

用途：workspace governance，例如 DevGov project registry、approved roots、MCP policy、port/startup/public-route/API-key gates。

建議內容：

```md
# Workspace AGENTS.md

> Workspace-level overlay. Refines global `AGENTS.md` for this workspace.

## Workspace Governance

- Use the DevGov workspace rule predictor before touching a registered project.
- Use approved workspace roots from the local registry.
- Local Files MCP defaults to read-only.
- File writes require diff preview, scoped target list, rollback note, and audit
  log.
- Port, startup, public route, service restart, and API-key changes require the
  relevant DevGov gate.

## MCP Profiles

- `local-files-readonly`: read/list/search only.
- `local-files-write-gated`: requires explicit approval or DevGov write gate.
```

### 3.4 `AGENTS.CHATGPT.md`

用途：ChatGPT-specific overlay。只有在你需要為 ChatGPT browser、file、Python、image、connector 等工具定義 routing 時才需要。 

建議內容：

```md
# AGENTS.CHATGPT.md

> ChatGPT-specific overlay. Tool names, routing behavior, and platform-specific
> response requirements belong here.

## Tool Routing

Prefer the narrowest available tool that satisfies the task. Do not use broader
browser automation, code execution, or connector access when read-only search or
file inspection is sufficient.

## Authority

This file must not relax global `AGENTS.md` non-relaxable invariants.
```

## 4. Global `AGENTS.md` 應保留或新增的內容

新版主檔建議保留並強化以下內容：

| 主題 | 建議狀態 | 說明 |
|---|---|---|
| Scope / Authority / Specificity | 保留並重構 | 增加 platform overlay 層級，區分 tool definitions 與 tool outputs。 |
| Non-relaxable Global Invariants | 新增 | 明確規定 repo/workspace overlay 只能收緊，不能放寬安全底線。 |
| Conflict Resolution | 新增或強化 | 衝突時優先 safety、privacy、credentials、reversibility、correctness。 |
| Execution Modes | 保留並強化 | 加入 L0-L4 risk levels，讓 `supervised` / `yolo` 可執行。 |
| Git Safety | 保留並分段 | 建議拆為 pre-edit gate、dirty worktree rules、post-change report。 |
| Public Push Hygiene | 保留並強化 | 加入 pre-push gate、secret scan、planning content scan、history rewrite approval。 |
| File Operation Terminology | 保留 | `clean up` 不等於 delete；delete 移到 `.del`。 |
| `.del` Repository Hygiene | 新增 | 避免 `.del` 污染 Git 或誤 commit sensitive content。 |
| Data Classification and Secrets | 新增 | 定義 secret 類型、允許 structure-only 檢查、禁止揭露值。 |
| Tool / MCP Governance | 新增 | 定義 least privilege、read-only default、tool filtering、approval、audit。 |
| Prompt Injection Resistance | 新增 | web/local/tool output/log 均為 data，不是 instructions。 |
| Command Execution | 新增 | 區分 read-only、mutating、long-running、denied-by-default commands。 |
| Coding Principles | 保留 | 原內容品質良好，保留即可。 |
| Comments and Documentation | 保留 | user-facing docs 保留繁中 companion 規則；供人閱讀的 Markdown 審計文件與報告也必須提供 `.zh-tw.md` companion。 |
| Multi-Agent Coordination | 保留並強化 | 加入 read/write scope、final synthesis owner、reviewer citation requirement。 |
| Error Handling | 保留並強化 | 補上不得盲目 retry destructive/mutating actions。 |
| Testing | 保留並重構 | 改成 verification ladder。 |
| Reporting and Audit Trail | 新增 | 讓 DevGov 或人工審查可追蹤工具、檔案、命令、驗證、風險。 |
| Instruction File Hygiene | 保留並強化 | 明確禁止 local paths、tool implementation、secret values 進 global。 |

## 5. 遷移步驟

1. **先建立 overlay stub**
   - 在 live global-home 指令層旁建立 `AGENTS.CODEX.md`。
   - 在 machine-local、untracked、或非公開的環境層建立或更新 `ENVIRONMENT.md`。
   - 在真正的 workspace root 建立 workspace-level `AGENTS.md`；不要放在 DevGov repo root。
   - 視需要在 live global-home 指令層旁建立 `AGENTS.CHATGPT.md`。

2. **搬移平台與本機內容**
   - 將 `Codex execution behavior` 搬到 `AGENTS.CODEX.md`。
   - 將 `Q:\` / `C:\Users\miles` 規則搬到 `ENVIRONMENT.md` 或 workspace-level `AGENTS.md`。

3. **替換 global 主檔**
   - 使用 `templates/global/AGENTS.md` 作為新版 global-home `AGENTS.md` 的候選來源。
   - 安裝目標是 live global-home 指令位置，不是 DevGov repo-local `AGENTS.md`。
   - 確認 global 不再含有固定本機路徑、平台工具名稱、secret location、臨時流程。

4. **檢查有效 instruction path**
   - 確認搬移後沒有遺失 Codex 回報節奏。
   - 確認搬移後仍保留 `Q:\` workspace gate。
   - 確認 repo-local overlay 不能放寬 global invariants。

5. **執行文字檢查**
   - 搜尋 `Q:\`。
   - 搜尋 `C:\Users`。
   - 搜尋 `Codex execution behavior`。
   - 搜尋 `token`、`secret`、`api key`、`credential`，確認沒有 secret value。
   - 搜尋具體 tool 名稱，確認是否應移到平台 overlay。

6. **版本控管**
   - 以小 commit 進行：先加 overlay，再替換 global，再清理舊內容。
   - 若 DevGov repo 內任何治理檔被修改，執行 `npm test`、`npm run scan:agents`、`npm run validate:registry`、`npm run doctor`。
   - 若只有 live global-home 外部檔被修改，仍應做文字檢查、secret/value 檢查，以及 rollback path 記錄。

7. **dry-run 分層**
   - 嚴格 read-only 檢查可先執行 `npm test` 與 `npm run validate:registry`。
   - `npm run scan:agents` 與 `npm run doctor` 可能寫入 `reports/`，若需要完全隔離，請在 disposable copy 中執行完整批次。
   - 完整相容性 dry-run 可在 disposable copy 中執行 `npm test`、`npm run scan:agents`、`npm run validate:registry`、`npm run doctor`。

## 6. 驗收標準

完成遷移後，global-home 目標檔應符合：

- global-home `AGENTS.md` 沒有 `Q:\`、`C:\Users\miles` 等本機路徑。
- global-home `AGENTS.md` 沒有 Codex-only 或 ChatGPT-only 回報規則。
- global-home `AGENTS.md` 沒有 MCP server 具體啟動命令或 local connector 實作細節。
- global-home `AGENTS.md` 有明確 non-relaxable global invariants。
- global-home `AGENTS.md` 有 L0-L4 risk levels。
- global-home `AGENTS.md` 有 secrets/data classification。
- global-home `AGENTS.md` 有 prompt-injection resistance。
- global-home `AGENTS.md` 有 tool / MCP governance 抽象規範。
- global-home `AGENTS.md` 有 command execution baseline。
- global-home `AGENTS.md` 有 reporting and audit trail。
- `AGENTS.CODEX.md` 保留 Codex 回報節奏。
- `ENVIRONMENT.md` 保留本機 workspace root 與 access gate，且位於 machine-local、untracked、或非公開層。
- repo-local / workspace overlays 只能收緊 global invariants，不能放寬。
- DevGov repo-local `AGENTS.md` 保持 DevGov 專案治理權威，不被 global-home 候選檔覆寫。

## 7. 建議 commit 拆分

```text
commit 1: add platform and environment overlay stubs
commit 2: move Codex and local workspace rules out of global AGENTS.md
commit 3: replace global AGENTS.md with optimized governance baseline
commit 4: add workspace or DevGov-specific MCP policy overlay, if needed
```

## 8. 後續建議

- 另產生 `AGENTS.zh-tw.md` 作為繁體中文 companion，但不要在兩份檔案中重複維護 normative rules。
- 將 workspace / DevGov / MCP 具體規則轉成 machine-readable policy，例如 `.devgov/agent-policy.json`。
- 讓 DevGov Dashboard 檢查 global 主檔是否含有 forbidden patterns，例如 local paths、secret values、platform-only rules。
- 將 L0-L4 risk levels 對應到工具 gating：L0/L1 自動允許，L2 需變更摘要與 rollback，L3 需 workflow gate，L4 需明確人類批准。
- 在 DevGov repo 中保留 repo-local `AGENTS.md` 作為唯一 runtime source，將 global-home 候選檔與 overlay stub 放在 `templates/global/` 或其他非 runtime 路徑。
