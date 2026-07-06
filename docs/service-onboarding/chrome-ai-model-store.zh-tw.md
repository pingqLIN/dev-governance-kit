# Chrome AI Model Store 治理

這份紀錄治理本機檔案系統程序：讓已安裝的多個 Chrome channel 共用 Chrome built-in AI 模型檔案。

## 政策

- Stable Chrome 擔任主要 `OptGuideOnDeviceModel` 儲存點。
- 已安裝的次要 channel，例如 Beta、Dev、Canary，應透過 filesystem link 指回 Stable primary store。
- 未安裝的 channel 會被略過。Reset 路徑不會憑空建立新的 browser profile root，除非 operator 明確用底層 script 的 include flag。
- 需要修復 link 時必須先關閉 Chrome。Reset wrapper 若偵測到 Chrome 正在執行且需要改動 channel model path，會拒絕修改。
- 被替換的實體資料夾或錯誤 link 會先搬到 channel-local `.del` 資料夾，並加上 timestamp，之後才建立新 link。

## 指令

執行 Doctor：

```powershell
npm run chrome-ai:doctor
```

執行 Reset：

```powershell
npm run chrome-ai:reset
```

直接實作在 `scripts/service-control/Manage-ChromeAiModelStore.ps1`。DevGov dashboard 會透過已審核的 service-control wrappers 執行，不直接呼叫底層 script。

## Doctor 檢查內容

- Stable primary model directory 存在，而且是實體資料夾。
- Stable primary model directory 內有版本資料夾與 `weights.bin`。
- 已安裝的 secondary channel root 內，`OptGuideOnDeviceModel` 是 `SymbolicLink` 或 `Junction`。
- Secondary channel links 指回 Stable primary store。

## Reset 修復內容

Reset 只修復已安裝的 secondary channels。Stable primary store 不會被替換；如果 Stable 缺失或不健康，Reset 會失敗並回報 blocker。

每個有 drift 的已安裝 secondary channel，Reset 會：

1. 若 Chrome 正在執行，拒絕繼續。
2. 將現有 `OptGuideOnDeviceModel` 搬到 `.del\OptGuideOnDeviceModel-<timestamp>`。
3. 建立指向 Stable primary store 的 `SymbolicLink`；若 symbolic link 無法建立，則 fallback 到 `Junction`。
4. 再跑一次 Doctor 並回報最終狀態。

## 回滾

先關閉 Chrome，再把受影響 channel 的 timestamped `.del` backup 還原回 `OptGuideOnDeviceModel`。如果 Stable primary store 是健康的，重新執行 Reset 會再次建立共用 link layout。
