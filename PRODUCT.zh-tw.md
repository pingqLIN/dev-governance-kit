# Product

## Register

product

## Users

DevGov 服務的主要對象，是需要維護多個本機開發 repository 的操作者與 AI agents。使用者需要快速檢查治理狀態、確認服務 port 與 startup surface 是否已被登錄，並執行會留下 evidence 的檢查，同時避免意外修改 target project。

次要使用者包含專案維護者。他們需要穩定的 templates、registry contracts，以及在啟動服務或發布 route 變更前可重用的本機 dashboard 視圖。

## Product Purpose

DevGov 讓本機開發治理保持可稽核。它集中管理 ports、startup entries、Terminal profile assets、public routes、local service agents、development API key locations、Git worktrees，以及 AGENTS instruction scope 的 canonical records。這些 records 會搭配 scanners、validators、generated reports，以及 `127.0.0.1:3101` 的 loopback dashboard。

成功狀態是使用者不需要猜測，就能回答三件事：目前已登錄什麼、本機產生了哪些 evidence、還有哪些項目在 mutation 前需要 review gate。Canonical shared data 屬於 `registry/`；generated evidence 屬於 `reports/`；可重用的 project-facing assets 屬於 `templates/`。

## Brand Personality

DevGov 應該精準、沉穩、有操作現場感。它是工作台上的儀器，不是 marketing surface。介面可以有記憶點，但信任優先：高密度資訊要保持可讀，controls 要熟悉，所有 status label 都要清楚呈現 safety boundary。

語氣要直接、適合 field operation。它偏好精確名稱、明確 review state、stable IDs，以及具體的下一步檢查，而不是宣傳式語言。

## Anti-References

- 不要像 generic SaaS landing page。
- 不要使用裝飾性的 glassmorphism、purple-blue gradients，或過度慶祝感的 dashboard theatrics。
- 不要用模糊的成功語言隱藏 safety gates。
- 除非已有明確 reviewed apply path，不要讓 registry evidence 看起來可以直接編輯。
- 若缺少對應 registry policy，不要暗示 public exposure、restart control、credential access 或 cleanup 是安全的。

## Strategic Design Principles

- Audit-first：預設 surface 應該像 inspection 與 evidence，而不是 action。
- Registry-centered：canonical records、generated reports、reusable templates 必須在視覺與概念上清楚分離。
- Local and reversible：loopback services、generated artifacts、manual review gates 應該在介面中可見。
- Dense but legible：tables 可以承載多個 fields，但 typography、spacing、contrast 與 wrapping 必須支援反覆掃讀。
- Safety vocabulary is product vocabulary：`approved`、`review_required`、`blocked`、`local`、`public` 等詞必須有一致且高對比的視覺呈現。
- Agent-readable and human-readable：UI copy 與文件要同時幫助 human operator 與 future agent 理解同一個 boundary。
