# ChatGPT 治理面板

DevGov Governance Pulse 是提供給 ChatGPT 與 Codex 的唯讀 MCP App 介面。它刻意只呈現高價值訊號：即時服務例外、受治理專案覆蓋、受保護公開路由數量，以及共用主機壓力。

## 本機架構

- `scripts/serve-dashboard.mjs` 繼續管理 `127.0.0.1:3000`，並新增 stateless `/mcp` endpoint。
- `scripts/lib/chatgpt-governance-app.mjs` 註冊 MCP App tools 與響應式 UI resource。
- `plugins/devgov-governance-panel/` 把本機 MCP endpoint 封裝成 Codex plugin。
- `.agents/plugins/marketplace.json` 是 repo-local marketplace entry，供安裝與 update-safe cache 使用。

資料真相仍是 DevGov registries 與即時唯讀 probes。Widget state 只保存顯示偏好，不會複製或取代 canonical governance data。

## 桌面與手機行為

桌面使用 inline 摘要，並可切換 fullscreen 與 picture-in-picture。窄畫面與手機 host 會切換成單欄、例外優先的檢視，保留觸控尺寸、支援 safe-area inset，並隱藏 PiP 操作。

PiP 只維持目前 session。Plugin、MCP endpoint、canonical data 與 widget view state 都存放在 ChatGPT 安裝套件之外，因此一般 ChatGPT application update 不會覆蓋它們。

## 本機驗證

啟動既有 dashboard，再以 MCP client 檢查 endpoint：

```powershell
npm run dashboard
```

檢查 plugin manifests 後，才安裝 repo marketplace：

```powershell
codex plugin marketplace add Q:\Projects\dev-governance-kit.worktrees\chatgpt-native-panel-20260717
codex plugin add devgov-governance-panel@devgov-local
```

安裝或更新 plugin 後，請用新的 ChatGPT/Codex task 進行測試。

## 遠端存取邊界

ChatGPT 手機端需要可由 HTTPS 連線的 MCP endpoint，以及 developer-mode 或通過審查的 app registration。本機實作階段不會發布 `/mcp`、修改 Cloudflare route 或建立 app registration；這些屬於另一個公開曝露與 authentication review gate。
