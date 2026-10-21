# UFFS Search Router — 第二階段本機測試版

**狀態：已完成本機可信任 Host 原型，Global AGENTS 治理規則尚未生效。**

來源：scripts/lib/uffs-search-router.mjs
測試：tests/uffs-search-router.test.mjs
治理提案：docs/uffs-agent-search-governance.zh-tw.md

## 使用介面與界線

從來源模組匯入 createSearchRouter。由可信任 Host 提供 policy：allowedRoots（Windows 允許的根目錄），必要時設定 uffsExecutable（CLI 路徑）與 enableFullDriveUFFS（預設 false）。呼叫 search，傳入 intent、scope、pattern、可選的 limit（1–200，預設 50）。**Agent 不能自行設定 policy 權限。** 本模組不是作業系統 ACL 的替代品，也不是公網服務。

回傳 status、provider、matches（僅中繼資料）、count、reason、coverage、observedAt，視需要加上 routingReason。狀態有 found、not_found_with_coverage、partial、denied、unavailable、error、routed、not_required。routed 只表示選定目標 Provider，**不表示已執行下游工具**。

## 已實作功能

- none：不搜尋。
- ntfs-metadata＋允許的專案子目錄：透過唯讀檔案系統列舉搜尋檔名，不讀檔案內容；不會為窄範圍查詢執行全磁碟 UFFS。
- ntfs-metadata＋明確授權的整顆已索引磁碟，且 enableFullDriveUFFS=true：先檢查 daemon 與已索引磁碟，再使用 UFFS CLI；v0.6.44 的 JSON 輸出實際為 NDJSON（逐行 JSON）。
- content、git：先驗證本機 Scope，回傳應轉交授權的內容／Git 搜尋工具；**尚未執行下游搜尋**。
- semantic、external：回傳外部 Provider 路由；**尚未執行下游搜尋**。

採用 Windows 路徑邊界、realpath、目錄類型與敏感路徑拒絕清單檢查；本機掃描不追蹤 Symlink/Junction，遇到無法讀取、跳過目錄、上限或逾時時標記部分涵蓋。UFFS 結果會再過濾，但此舉不等於可授權給遠端／多租戶的權限隔離。

**目前尚未證明 UFFS 可在後端查詢前保證子樹範圍限制。** 因此專案子目錄先以本機搜尋安全降級，不做全磁碟 UFFS；整顆磁碟若未索引也不自動遞迴掃描。UFFS 查詢為 0 不等於不存在，應標記為 partial。daemon 狀態探測後仍存在查詢瞬間發生服務變化、自動重啟的競態風險，故僅供可信任本機測試。

## 2026-10-21 本機測試證據

UFFS v0.6.44 daemon Ready，只載入 C:、E:、F:，沒有 D:。

- D: 專案子目錄：查找 Router 原始碼，found、native-fs、1 筆，涵蓋完整。
- 明確允許整顆 C:：查找 notepad.exe，found、uffs-cli、顯示 5 筆；結果受上限限制，涵蓋不完整。
- 明確允許整顆 D:：查找 Registry 檔名，unavailable，**未誤報查無檔案**。
- 新增單元測試首次執行 11／11 通過。

## 驗證指令

在 D:/projects/.worktrees/devgov-uffs-search-20261021 執行：

~~~powershell
node --test tests/uffs-search-router.test.mjs
npm run validate:registry
npm run scan:agents
npm test
~~~

全新 Worktree 不一定含有 Node 相依套件，必須安全處理，不得影響已有未提交變更的主工作樹。

## 進入正式部署前的阻塞

1. 可信任 Caller／Local Files alias Resolver，避免由模型自行指定允許根目錄。
2. 驗證 UFFS 後端查詢前子樹限制與搜尋涵蓋；否則繼續只允許完整磁碟的可信任操作。
3. 本機限定、可授權的 Agent／stdio MCP 接口；不公開原生 UFFS HTTP。
4. 強化 Junction／TOCTOU、禁止非預期啟動、資源限制與失敗紀錄。
5. 端對端授權、p50／p95 與正確性驗收，再另行審核 Canonical Registry、Global AGENTS 正式發布。
