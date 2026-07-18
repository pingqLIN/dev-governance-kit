# ChatGPT 治理面板

DevGov Governance Pulse 是提供給 ChatGPT 與 Codex、以讀取為主的 MCP App 介面。它呈現有限且高價值的訊號，並只開放經審查的本機控制：即時服務例外、受治理專案與 port 涵蓋、本機 agent 與 route 數量、共用主機壓力、Doctor，以及經確認的 Restart。

## 本機架構

- `scripts/serve-dashboard.mjs` 繼續管理 `127.0.0.1:3000`，並新增 stateless `/mcp` endpoint。
- `scripts/lib/chatgpt-governance-app.mjs` 註冊 MCP App tools、control projection、restart confirmation boundary 與響應式 UI resource。
- `scripts/lib/service-control-core.mjs` 仍是 Doctor 與 Restart wrapper 唯一的 runtime execution authority。
- `plugins/devgov-governance-panel/` 把本機 MCP endpoint 封裝成 Codex plugin。
- `.agents/plugins/marketplace.json` 是 repo-local marketplace entry，供安裝與 update-safe cache 使用。

資料真相仍是 DevGov registries 與即時 probes。Widget state 只保存顯示資訊及受限的 operation status，不會複製或取代 canonical governance data。

## 桌面與手機行為

Inline surface 會把宿主提供的 theme 與 CSS variables 套用到 document root，包括對話背景、字體、文字色、divider、spacing 與 button 行為；host context 尚未抵達前，則使用相符的 light/dark fallback。介面沒有外層 card fill，也沒有 nested scrolling。`ResizeObserver` 會向宿主回報 intrinsic-height 變化，使 widget 高度跟隨內容。

桌面與窄畫面使用相同、以內容為主的 DOM。Inline mode 只顯示四個服務數量、一行治理／資源摘要，以及最多兩個 exception 與其可用的 Doctor 或 Restart control。`Manage` 會請求 fullscreen，並顯示所有 exception、完整治理涵蓋與共用資源明細。這個 progressive disclosure 會讓 inline 結果維持在宿主高度上限內，不建立內嵌 scrollbar。窄版面仍保留可用操作尺寸、支援 host safe-area inset，並讓長英文或繁中文字換行。

Plugin、MCP endpoint、canonical data 與 widget view state 都存放在 ChatGPT 安裝套件之外，因此一般 ChatGPT application update 不會覆蓋它們。

## 受治理操作

- `Refresh` 是 app-only 且唯讀。
- 只有目前 surfaced exception 具備 approved registry action 時，才顯示 `Doctor`。它沿用既有 resolver 與 audit-event path，只回傳受限摘要。
- 只有 approved registry entry 同時具備必要 restart policy 欄位時，才顯示 `Restart`。
- Restart 必須使用隨機、綁定 target、單次、有效期一分鐘的 confirmation token。Server 會先消耗 token，再次檢查 approved registry entry 與 restart policy，然後才執行。
- Missing、expired、replayed、mismatched 或已不再核准的 confirmation 一律 fail closed。
- App 不提供 arbitrary target/action、wrapper path、command、本機 path、credential、raw log、`doctor:repair`、install/startup action 或 public-route mutation。

## 本機驗證

啟動既有 dashboard，再以 MCP client 檢查 endpoint：

```powershell
npm run dashboard
```

檢查 plugin manifests 後，才安裝 repo marketplace：

```powershell
codex plugin marketplace add Q:\Projects\dev-governance-kit
codex plugin add devgov-governance-panel@devgov-local
```

安裝或更新 plugin 後，請用新的 ChatGPT/Codex task 進行測試。

Focused implementation verification：

```powershell
node --test tests/chatgpt-governance-app.test.mjs
```

## 遠端存取邊界

ChatGPT 手機端需要可由 HTTPS 連線的 MCP endpoint，以及 developer-mode 或通過審查的 app registration。本機實作階段不會發布 `/mcp`、修改 Cloudflare route 或建立 app registration。新的本機 control 不會改變此邊界；遠端發布仍需要另外完成 authentication、authorization、origin、privacy 與 public-exposure review。
