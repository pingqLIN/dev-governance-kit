# Service Control Readiness 規格

本規格定義 DevGov 如何在 dashboard 與查詢 API 中回報 service health check、Doctor 可用性，以及 restart readiness。

## 範圍

Service control readiness 是觀測模型。它用來告訴 operator 某個 service 是否具備安全 health check 與已審查的控制機制；它本身不授權 restart。

## 狀態欄位

每一列 service status 必須提供：

- `quickTest.state`: `ONLINE`、`OFFLINE`、`ERROR`、`CHECKING`、或 `MISSING`
- `quickTest.url`: 安全網路檢查使用的 health URL
- `doctor.state`: `FOUND`、`MISSING`、或 `NOT_APPLICABLE`
- `doctor.ref`: 穩定的 npm script、script path、registry ID、或文件參照
- `restart.state`: `FOUND`、`MISSING`、`DISABLED`、或 `REVIEW_REQUIRED`
- `restart.ref`: 可用時提供穩定 startup 或 restart 參照
- `restart.policyReadiness`: 可執行 restart control 的審查 metadata，可用時提供
- `controlReadiness`: `READY`、`PARTIAL`、或 `BLOCKED`

`controlReadiness` 推導規則：

- `READY`: quick test 可用、Doctor 為 `FOUND`，且 restart 為 `FOUND`。
- `PARTIAL`: quick test 可用，且 Doctor 或 restart 至少一項為 `FOUND` 或 `REVIEW_REQUIRED`。
- `BLOCKED`: quick test 不可用、Doctor 為 `MISSING`，且 restart 為 `MISSING` 或 `DISABLED`。

## 偵測規則

- Quick Test 只使用 network health URL。
- 只有已註冊或在目前專案中可穩定辨識的 project Doctor mechanism，才能標為 `FOUND`。
- 只有存在穩定且已審查的 start/restart mechanism，restart 才能標為 `FOUND`。
- 若有 startup 或 service reference，但尚未安全到可由 dashboard 執行，restart 必須標為 `REVIEW_REQUIRED`。
- 即使有輔助 script，只要 policy 明確禁止 dashboard restart，restart 必須標為 `DISABLED`。
- Reset/restart operations 和 Doctor 分開。標為 `REVIEW_REQUIRED` 的 reset path 是候選 control path，不是已核准的 dashboard action。
- 可執行的 restart control 必須有 approved registry entry，且具備 permission boundary、backup expectation 與 rollback expectation 審查 metadata。

## UI 規則

- `Network Service Status` 必須把 `Quick Test` 顯示為 table column，而不是獨立 action button。
- `Quick Test` cell 應同時呈現該 service 的 health、Doctor、restart 與 readiness。
- 同一個 cell 不得重複顯示狀態 label 與可執行 control。Doctor 或 restart 已核准可執行時，狀態 flag 本身就是一鍵控制，並帶有 reviewed-control marker。
- dashboard 不得提供一鍵 restart，直到另一次已審查的 apply path 定義 command 邊界、權限、backup 或 rollback expectation，以及 audit evidence。缺少完整審查 metadata 的 service 必須維持 `REVIEW_REQUIRED` 或 disabled。
- 受保護的 DevGov dashboard public origins 可以作為 loopback service-control listener 的 browser Origin allowlist，但 service-control listener 本身必須維持 loopback-only，不得作為 Cloudflare route 發布。

## API 規則

- `/api/service-status` 可以執行 health check 並回傳 readiness metadata。
- `/api/service-status` 不得執行 restart command。
- `/api/service-onboarding` 可以執行既有已登記服務的唯讀補充稽核。
- machine-local paths、完整 launch commands、credential paths、tokens、process IDs、logs 與暫時 evidence 不得進入 canonical registry data。

## Reset 與 Cloudflare 規則

- Doctor 預設唯讀；Doctor repair 必須有明確且窄的文件化邊界。
- Reset 指 restart、recover、republish、clear runtime state，或 repair startup/tunnel state。
- Reset 在 command boundaries、rollback expectations、log handling 與 credential safety 被審查前，一律是 `REVIEW_REQUIRED`。
- Cloudflare 本機架構必須將 governed loopback origins 放在 `ports.registry.json`，public exposure 放在 `public-routes.registry.json`。
- Cloudflare credential files、tunnel config paths、certs、private keys、API tokens、process IDs 與 local logs 留在 reports 或 local evidence，不進 canonical registries。

## 現有專案補充稽核

使用 `npm run scan:service-onboarding` 或 dashboard 的 Onboarding 視圖，稽核已經登記過的服務。這份補充 audit 應交叉檢查：

- `registry/ports.registry.json`
- `registry/startup.registry.json`
- `registry/public-routes.registry.json`
- `registry/local-agents.registry.json`
- 已露出的 Service Status rows 與其 readiness 欄位

## 驗證

接受此功能變更前，請執行：

```powershell
npm test
npm run validate:registry
npm run doctor
```

若修改 UI，也要用瀏覽器實測 dashboard，確認 service table 顯示 `Quick Test` 欄位、Doctor/Restart 狀態 flag 下方不再重複出現動作 label，且缺少完整審查 metadata 的 service 不會出現可執行 restart control。
