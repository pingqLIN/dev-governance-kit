# 產品

## 產品登錄

## Users

DevGov 的主要使用者，是需要維護多個本機開發 repository 的操作者與 AI agents。使用者需要快速檢查治理狀態、確認服務埠與啟動入口是否已登錄，並執行可追蹤成為證據的檢查，同時避免意外修改目標專案。

次要使用者包含專案維護者。這些人需要穩定的 templates、registry contracts，以及在啟動服務或發布 route 變更前可重用的本機 dashboard 視圖。

## 產品目的

DevGov 讓本機開發治理保持可稽核。它集中管理連接埠、啟動項、Terminal profile assets、public routes、local service agents、開發 API 金鑰儲存位置，以及 AGENTS 指令範圍的權威紀錄。這些記錄搭配 scanners、validators、generated reports，與 `127.0.0.1:3101` 的 loopback dashboard 一起形成完整證據。

成功狀態是使用者不需要猜測，就能回答三件事：目前已登錄什麼、本機產生了哪些證據、還有哪些項目在變更前需要經過審查閘道。權威共享資料屬於 `registry/`；生成證據屬於 `reports/`；可重複使用的專案面向資產屬於 `templates/`。

## 品牌個性

DevGov 應該精準、沉穩、有操作現場感。它是工作台上的儀器，不是行銷頁面。介面可以有辨識度，但信任優先：高密度資訊要保持可讀，控制項要熟悉，所有狀態標籤都要清楚呈現安全邊界。

語氣要直接、適合一線作業。它偏好精確名稱、明確的審查狀態、穩定識別碼，以及具體的下一步檢查，而不是宣傳式語言。

## 反向參考規範

- 不要像一般 SaaS 開場頁。
- 不要使用裝飾性的 glassmorphism、purple-blue gradients，或過度慶祝感的 dashboard theatrics。
- 不要用模糊的成功語言隱藏安全閘道。
- 除非已有明確 reviewed apply path，不要讓 registry evidence 看起來可以直接編輯。
- 若缺少對應的 registry policy，不要暗示 public exposure、restart control、credential access 或 cleanup 是安全的。

## 策略設計原則

- 稽核優先：預設畫面應更像 inspection 與 evidence，而不是 action。
- Registry 導向：權威紀錄、生成報告、可重複使用模板必須在視覺與概念上清楚分離。
- 本地可回復：loopback services、generated artifacts、manual review gates 必須在介面中可見。
- 高密度但可讀：資料表可承載多個欄位，但字體、間距、對比與換行必須支援反覆掃讀。
- 安全詞彙即產品詞彙：`approved`、`review_required`、`blocked`、`local`、`public` 等詞必須有一致且高對比的視覺呈現。
- 同時可供人類與未來 AI agent 閱讀：UI 文案與文件要同時幫助 human operator 與 future agent 理解同一個 boundary。
