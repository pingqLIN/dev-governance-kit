# Live Governance 測試分流

本文件定義 DevGov 測試中，會連線至 live endpoint 或執行已 review service control 的明確 opt-in 邊界。一般的 `npm test` 維持安全預設，不會 discovery opt-in 測試檔。

## 測試分流

| 指令 | 預設行為 | 影響 |
| --- | --- | --- |
| `npm test` | 自動執行 | 僅執行 static、fixture、registry、scanner 與非 live governance 測試。 |
| `npm run test:live-governance` | 未解除保護時跳過 | 執行本機與公開 health probe、Chrome AI storage quickcheck、Dashboard health 與 port availability 檢查。 |
| `npm run test:service-controls` | 未解除保護時跳過 | 執行已 review 的 Doctor control 與 DevGov Dashboard ensure-running Restart control；可能更新本機 report，或在 Dashboard 不健康時啟動 Dashboard。 |

Opt-in 測試檔刻意使用 `.opt-in.mjs`，而不是 `.test.mjs`，因此 Node 預設 test discovery 不會納入這些檔案。

## PowerShell opt-in

Live governance 檢查必須先完成連線至已登記 endpoint 的 review 決策：

```powershell
$env:DEVGOV_ALLOW_LIVE_GOVERNANCE_TESTS = "1"
npm run test:live-governance
Remove-Item Env:DEVGOV_ALLOW_LIVE_GOVERNANCE_TESTS
```

可執行 service control 需要另一個 runtime mutation 核准：

```powershell
$env:DEVGOV_ALLOW_SERVICE_CONTROL_TESTS = "1"
npm run test:service-controls
Remove-Item Env:DEVGOV_ALLOW_SERVICE_CONTROL_TESTS
```

設定任一變數只會授權目前 shell 中相符的測試分流；不會授權 provider model call、browser 登入、credential 存取、公開 exposure 變更、deployment 或其他無關 service control。

## 證據處理

- Opt-in 測試被跳過代表刻意未執行，不是通過證據。
- 執行任一分流前，記錄核准來源與相關 runtime 狀態。
- 執行後檢查 `reports/` 是否有新增證據或 side effect。
- 除非另有明確 review 核准，否則不要 commit machine-local report evidence。
