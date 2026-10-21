# UFFS 搜尋治理 — 第一至四階段本機驗收

日期：2026-10-21。分支：feat/uffs-search-governance-20261021。
狀態：本機單 Session Canary 通過；全域升級尚未核准。

## 階段一：Local Files MCP Alias 範圍
實作：scripts/lib/local-files-scoped-search.mjs。
可信任 Host 透過內部設定來源提供 Alias Root，並以啟動環境的 UFFS_CANARY_SCOPE 固定單一子樹。Agent 無權修改上述參數。搜尋前驗證 Alias、相對路徑、realpath、目錄型態及被排除目錄，輸出只包含 Alias 路徑。現有 Local Files MCP 已能列出相同測試子目錄。

界線：獨立 Canary 是從安裝在本機的 Local Files MCP 編譯設定模組讀取 loadConfig()，屬於**設定與路徑規則一致性**，不是即時伺服器授權憑證，也**沒有繼承 Cloudflare Access 使用者身分**。遠端 Agent 正式使用前，必須建置由認證過的 Local Files MCP 後端簽發／執行的 Scope Grant。

## 階段二：UFFS 子目錄限制
官方 MCP 文件提供 path_contains；CLI 文件明言 --in-path 是路徑解析後進行的 Post-filter。UFFS v0.6.44 實機查詢 C: 的 notepad.exe，原本 7 筆，指定 System32 路徑過濾後剩 2 筆，兩筆皆落在 System32。這能證明輸出篩選，不代表查詢前 ACL 或中繼資料隔離。

因此 Canary 的專案子樹搜尋改用受限 Native File Search，不使用全磁碟 UFFS 再濾除結果。Canary 即使收到由可信任 Host 設定的全磁碟選項，也強制關閉；底層原型的全磁碟 UFFS 僅限另行明確授權的可信任本機操作。

官方來源：
https://github.com/skyllc-ai/UltraFastFileSearch/blob/main/docs/user-manual/mcp.md
https://github.com/skyllc-ai/UltraFastFileSearch/blob/main/docs/user-manual/filters.md

## 階段三：單一 Agent stdio MCP
實作：scripts/uffs-local-mcp-stdio.mjs；驗收用 Client：scripts/test-uffs-stdio-canary.mjs。
僅提供一個唯讀 search_file_names 工具，參數為 relativeFolder、pattern、limit。不提供檔案內容、寫入或 HTTP 介面。實際使用 MCP SDK 完成 initialize、tools/list、15 次成功查詢與 1 次穿越拒絕。不修改 Codex、ChatGPT、VS Code 的全域設定或永久安裝服務。

由操作者管理的啟動環境：
- UFFS_LOCAL_FILES_CONFIG_MODULE：可信任的 Local Files MCP 編譯設定模組絕對路徑。
- UFFS_CANARY_SCOPE：固定 Alias 子樹，例如 windows-projects:.worktrees/devgov-uffs-search-20261021/scripts/lib。
上述主機路徑不會返回 Agent。重新測試需有符合 Lockfile 的 Node 依賴。

## 階段四：實機驗收

| 項目 | 結果 |
| --- | --- |
| MCP SDK 初始化／工具清單 | 通過，僅 1 個 Tool |
| 授權範圍內搜尋 | 15／15 通過 |
| 子樹路徑穿越 | 拒絕 |
| 已觀察回應中的 Host 實體路徑 | 未觀察到洩漏 |
| p50（15 次 stdio＋小型 Native 搜尋） | 4.11 ms |
| p95（同樣本） | 16.23 ms |
| 新增單元測試 | 16／16 通過，含 Windows Junction 跳脫 |
| UFFS 索引狀態 | C、E、F 已載入；D 未載入，不誤判不存在 |
| Cloudflare Access Caller 身分傳遞 | 未實作 |
| UFFS 查詢前子樹授權 | 未證明 |
| Agent 永久註冊 | 未執行 |
| Global AGENTS 與有效 Registry 更新 | 未執行 |

這些延遲值是 stdio MCP＋小型專案子樹 Native 搜尋，不是 UFFS 全磁碟效能，也不能用於聲稱正式 SLA。上線前還需大型資料集的 p95/p99、假陰性及權限案例測試。

## 回歸測試與復原
在 Feature Worktree 執行：
- node --test tests/uffs-local-files-scope.test.mjs tests/uffs-search-router.test.mjs
- npm run validate:registry
- npm run scan:agents
- npm test
- 設定可信任 Host 環境後執行 node scripts/test-uffs-stdio-canary.mjs

復原方式：關閉 stdio Client 或放棄本次開發分支。目前未安裝 HTTP Listener、Broker、排程服務或修改 Global AGENTS。

## 正式升級判定
Global AGENTS 強制 UFFS 搜尋、遠端 Agent 接入：**NO-GO**。尚缺經認證的後端 Scope Grant、Caller 身分綁定、UFFS 查詢前隔離或替代安全設計、Windows Junction／TOCTOU 加固與大量資料驗收。
單一可信任本機 Agent 的限定 stdio Canary：**GO**。
