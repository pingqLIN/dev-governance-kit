# DevGov 治理面板原生化重新設計計畫

狀態：已核准在 `codex/devgov-chatgpt-native-panel` 分支實作

## 目標

讓 DevGov Governance Pulse 在 Codex／ChatGPT 對話中呈現原生感，同時維持 DevGov 的 registry、runtime control、隱私與回復邊界。

本次重新設計必須：

- 取消獨立 dashboard／card 外觀，繼承宿主介面；
- 依內容自動調整大小，不產生巢狀捲軸；
- 顯示 pulse 契約已包含但目前 UI 未呈現的治理欄位；
- 加入安全的重新整理、Doctor 與經審查的 Restart 操作；
- 以英文文件為權威來源，維護繁中 companion。

## 證據與參考來源

- 現行實作：`scripts/lib/chatgpt-governance-app.mjs`。
- 既有控制權威：`scripts/lib/service-control-core.mjs`、`scripts/lib/service-control-resolver.mjs` 與 `registry/service-control.registry.json`。
- 既有 dashboard 互動：`scripts/lib/dashboard-core.mjs`。
- OpenAI 官方 Apps SDK UI guidelines：<https://developers.openai.com/apps-sdk/concepts/ui-guidelines>。
- OpenAI 官方 `window.openai` bridge reference：<https://developers.openai.com/apps-sdk/reference#capabilities>。
- 2026-07-17 對現行 app、tests、docs 與 control path 的較低階模型唯讀審查。

官方指引要求 inline card 保持輕量、不得有 nested scrolling、primary action 最多兩個、繼承系統字體與色彩，並使用動態 intrinsic height。審查另外指出：現有本機 MCP endpoint 採較寬鬆 CORS，故 restart 不得設計為 generic direct action。

## 資訊架構

### 對話內 inline surface

預設 inline 介面包含：

1. 精簡 overall state、摘要與新鮮度；
2. service online／offline／error／unknown 數量；
3. 一行精簡呈現 registered projects、ports、protected routes、CPU、memory 與 coordination state；
4. 最多兩筆高價值例外或 registry error；
5. 只有 server 為畫面上的 target 投影出已核准 action 時，才顯示對應 contextual control；
6. 其餘例外與完整治理／資源明細透過 `Manage` 進入查看。

兩個 primary action 固定為 `Refresh` 與 `Manage`／`Full screen`。Doctor 與 Restart 是例外列中的 tertiary contextual action，不增加 primary CTA 數量。

### Fullscreen surface

Fullscreen 使用相同資料契約與 DOM，會呈現所有受限筆數的例外詳情及操作、完整治理涵蓋及共用資源原因，但不加入 tabs 或深層導覽。

## 原生視覺契約

- `html`、`body` 與 root shell 使用宿主提供的對話背景；host context 未抵達前，改用相符的 light/dark fallback。
- 不使用外層卡片底色、邊框、陰影或過大的品牌標題。
- 使用宿主／系統字體與宿主 CSS variables，並提供保守的亮暗色 fallback。
- 使用 body-small 字級、精簡的 4／8／12／16 spacing、細系統分隔線及單色 outline control。
- 狀態色只作為 accent，不改變內容背景。
- 以 `min-width: 0`、wrapping、`minmax(0, 1fr)` 與 `overflow-wrap: anywhere` 處理長英文及繁中文字串。
- 不使用固定 viewport height、`100vh`、內部 scroll container，或以 overflow clipping 隱藏內容。
- `ResizeObserver` 在初次 render 及每次重要 layout 變化後呼叫 `window.openai.notifyIntrinsicHeight()`。
- 從 280 px 起的窄版面仍可使用，control target 至少維持 36 px。

此處的「原生」是遵循公開 Apps SDK 的 system token、字體、spacing 與互動模型，不是複製 Codex 私有實作 CSS。

## 資料與控制契約

### Pulse 投影

Pulse 繼續是精簡 allowlist 投影，新增 `controls` 欄位，但只能包含：

- 穩定 target ID；
- 允許的 action 名稱；
- widget 顯示必要的 readiness／policy-safe label。

不得回傳 wrapper path、command、本機 path、credential、log、raw process data 或未限量 registry record。

### Refresh

- App-only、唯讀 MCP tool。
- 重新讀取 pulse 並更新 widget。

### Doctor

- 只有 server 投影出已核准 doctor control 的 target 才能執行。
- 沿用既有 `executeServiceControl` allowlist／resolver／audit path。
- 只回傳受限 operation result：target、action、status、summary、event ID 與完成時間。
- 不暴露 raw wrapper output。

### Restart

只有具備 approved restart entry 及完整 restart policy 的 target 才會啟用 Restart。

必要流程：

1. app 針對一個已投影 target 請求 restart confirmation；
2. server 再次核對 approved registry entry，簽發隨機、單次、綁定 target、短效 token；
3. UI 顯示確切 target 與 rollback 導向警告，以及 `Cancel`／`Confirm restart`；
4. 使用者確認後才呼叫 restart tool；
5. server 消耗 token、再次檢查 registry 與 restart policy，再呼叫既有 control authority；
6. UI 顯示 pending／success／failure，之後刷新 pulse；
7. replay、expired、target mismatch、缺 policy 或未核准請求一律 fail closed。

不加入 generic command execution、`doctor:repair`、dependency install、startup registration、public-route mutation 或任意 wrapper reference。

## 實作切片

1. 擴充 pulse／control projection，加入受限 operation helpers。
2. 註冊 Doctor、prepare-restart 與 confirmed-restart MCP tools，設定正確 annotations 與必要的 app-only visibility。
3. 以透明、intrinsic-height layout 取代現行 widget markup／CSS／JS。
4. 補上中英文 operation、confirmation、empty、stale、pending、success、failure 文案。
5. 擴充 focused tests：projection redaction、control allowlist、token expiry／replay／mismatch、原生 CSS 約束、防 overflow、accessibility label 與 host bridge call。
6. 更新英文及繁中 operator documentation。

## 驗證

依序執行：

1. `node --test tests/chatgpt-governance-app.test.mjs`
2. `npm test`
3. `npm run scan:agents`
4. `npm run validate:registry`
5. `npm run doctor`
6. 透過已安裝 plugin 執行 live `show_governance_pulse`。
7. 更新後 plugin source 生效時，在新的 Codex task 進行視覺檢查。

測試寬度：280、320、375、480、620 px。測試 empty、單筆與六筆 exception、缺少 metric、長英文／繁中 label、Doctor success／failure，以及 restart token failure modes。

## 回復方式

所有實作都隔離在 `codex/devgov-chatgpt-native-panel` worktree。本批次的可審查 Git diff 即為回復邊界；實作與測試不會修改 installed plugin cache、public route、startup entry、dependency 或執行中的服務。
