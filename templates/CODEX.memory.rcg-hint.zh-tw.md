# CODEX.memory.rcg-hint

Codex Resource Coordination Governance memory hint 的 proposal-only template。

除非 operator 明確要求「更新記憶」，不要把這個 template 或衍生 hint 寫入真實 Codex memory。

## 目的

RCG memory hints 是本機多專案並行開發時的短期 soft awareness。它協助 Codex 推理某個專案近期的 browser、GPU、foreground、DevTools 或 local-model 工作，可能影響另一個專案現在的速度。

它不是：

- authoritative current-state ledger
- resource lock
- transaction store
- scheduling queue
- task-dispatch gate

因為 hint 只改善脈絡品質，所以 eventual consistency、重複 hint、漏登與 memory sync 延遲都可以接受。

## Hint Shape

```json
{
  "kind": "rcg-short-term-resource-hint",
  "project": "stable-project-id",
  "resourceClass": "browser-profile | gpu-rendering | foreground-control | local-model | devtools",
  "intent": "short sanitized description",
  "observedAt": "ISO-8601 timestamp",
  "validUntil": "ISO-8601 timestamp",
  "confidence": "observed | declared | inferred",
  "source": "codex-task | devgov-scan | dashboard-event",
  "authority": "soft-hint-only",
  "afterExpiry": "historical-only"
}
```

## 規則

- 只寫正向近期使用 hint；不要寫「目前無佔用」或類似的負向 availability state。
- 必須包含 `observedAt` 與 `validUntil`；由讀取端判斷 hint 是否仍新鮮。
- 過期 hint 只能作為 historical context。
- 沒有 hint 不代表資源一定可用。
- 不要包含 secrets、cookies、session data、credential paths、完整 commands、screenshots、personal activity 或 machine-local paths。

只產生 proposal、不寫 memory：

```powershell
npm run scan:resource-coordination -- --memory-hint-proposal --memory-hint-project stable-project-id --memory-hint-resource-class browser-profile --memory-hint-intent "Browser automation smoke check"
```
