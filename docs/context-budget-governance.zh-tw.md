# Context Budget Governance

DevGov 將 context budget 視為需要治理的 runtime surface。目標是在不削弱安全性、正確性與明確使用者意圖的前提下，降低 always-loaded prompt、tool、skill、memory 與 project context。

## 模型

使用 DevGov 作為 canonical governance record，UniText 作為本機 routing consumer：

- DevGov 在 `registry/agent-instructions.registry.json` 記錄穩定的 context-budget rules。
- DevGov 將本機量測 evidence 寫入 `reports/`。
- UniText-style adapters 消費精簡索引，而不是完整 skill bodies 或長篇 project histories。
- Live Global AGENTS 變更仍需 review gate，且必須有明確 operator request。

## Budget Levels

| Level | 名稱 | 使用情境 | 載入規則 |
| --- | --- | --- | --- |
| L0 | no-tool | 自然語言回答、改寫、翻譯、腦暴、靜態推理 | 不載入檔案、工具、connector 或 skill body。 |
| L1 | light-retrieval | 檔名、metadata、registry summaries、短片段 | 只取最小必要本機 evidence。 |
| L2 | targeted-retrieval | 特定檔案問題、有限比較、精確 evidence chunks | 先搜尋，再只讀匹配段落。 |
| L3 | artifact | PDF、DOCX、slides、spreadsheets、images 或 connector-backed artifacts | 只載入對應 skill 或 connector instructions。 |
| L4 | complex | 多檔案綜合、大型轉換、data-heavy analysis | 可使用較大 context，但中間結果要摘要。 |

## Routing Rules

預設使用 `L0-no-tool`。只有當 request 無法靠目前任務文字與已載入的安全 context 完成時，才升級。

Always-loaded surface 只保留：

- authority order 與 conflict handling
- safety、credentials、Git、deletion 與 publication gates
- 精簡 tool / skill routing map
- active user constraints 與 unresolved task state

以下內容應 lazy-loaded：

- 完整 skill bodies
- connector-specific instructions
- platform tool details
- 完整 documents 與舊 conversation history
- project histories 與 private planning notes

## Audit Command

執行：

```powershell
npm run scan:context-budget
```

此命令會寫入：

- `reports/context-budget-audit.md`
- `reports/context-budget-audit.json`

報告只估算可觀察的本機來源。Platform system prompts、developer instructions、native tool schemas 與 connector schemas 屬於 runtime-owned surface，無法只靠 repository files 完整量測。

## Promotion Rules

只有穩定 routing rules 可以提升到 `registry/`。不要把完整本機路徑、raw conversation archives、完整 skill bodies、private planning notes 或含 secret 風險的 config 內容放進 canonical records。

本機 evidence 放在 reports。已 review 的 policy 放在 registry。
