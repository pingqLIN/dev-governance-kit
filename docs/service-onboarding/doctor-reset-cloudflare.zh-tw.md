# Doctor、Reset 與本機 Cloudflare 程序

本文件定義 DevGov 已登記本機服務的通用程序集合。

## 程序欄位

每個 service onboarding record 都必須描述：

- `healthProcedure`: 安全的唯讀檢查，通常是 loopback 或 public health URL。
- `doctorProcedure`: 診斷 command 或 checklist。Doctor 可以檢查與回報；repair 必須有明確邊界。
- `resetProcedure`: reset、restart、recover、republish、clear-state 的政策。
- `startupProcedure`: 已審查的 start 或 ensure path。
- `dashboardProcedure`: DevGov 如何顯示該服務，以及為什麼允許或不允許 dashboard execution。
- `cloudflareProcedure`: 本機 Cloudflare Tunnel、Access 與 public-route 處理方式。

## Reset 語意

reset 或 restart procedure 中的 `REVIEW_REQUIRED` 代表：

- 已有或預期會有候選 reset/restart path
- DevGov 尚未核准自動執行
- dashboard 不得直接執行
- 必須先由 operator 或 reviewed apply path 定義 command 邊界、rollback expectation、log handling 與 credential safety

這和 `MISSING` 不同。`MISSING` 代表還沒有已知穩定 reset/start path。`REVIEW_REQUIRED` 代表路徑存在或可建立，但它會改變本機 runtime state，所以仍需要 execution gate。

## Doctor 規則

Doctor 預設應該安全：

- 讀取 registry data 與 generated reports
- 檢查 local listener 與 health endpoints
- 驗證 startup refs 與 route metadata
- 回報缺失但不印出 secret values
- 將 evidence 寫在 `reports/`

Doctor repair 只能做明確文件化的本機 repair。重新產生 report artifacts 可以接受。Restart service、清 queue、刪 runtime state、編輯 tunnel config、修改 startup registration，都需要另一個 reviewed reset/start procedure。

## 本機 Cloudflare 架構

本機服務透過 Cloudflare 對外時，使用這個模型：

1. Local service 綁定到 governed loopback origin，例如 `127.0.0.1:<port>`。
2. `registry/ports.registry.json` 擁有 local origin allocation。
3. `registry/public-routes.registry.json` 擁有 hostname、tunnel、local target、exposure class、Access requirement、health URL 與 review status。
4. Cloudflare credential files、tunnel config paths、certs、private keys、API tokens 不得進入 canonical registry data。
5. Generated scans 與 host-local evidence 留在 `reports/`。
6. Public health routes 只能暴露最小 readiness data，不得提供 command execution。
7. Protected app/API routes 應要求 Cloudflare Access，除非該 route 明確分類為 public health。
8. Tunnel restart 或 ingress changes 需要 backup/rollback evidence 才能 apply。

## Service Review Checklist

服務要往 `READY` 推進前，確認：

- health procedure 安全且 deterministic
- Doctor procedure 存在，且預設唯讀
- reset procedure 明確 disabled 或標為 `REVIEW_REQUIRED`
- startup procedure 使用穩定且已審查的 reference
- Cloudflare procedure 符合 local/public exposure
- dashboard status row 不暴露 unsafe execution
- registry validation 與 Doctor 通過
