# CODEX.memory.rcg-update-gate

將 RCG memory hint proposal 轉成真實 Codex memory update 前使用的 reviewed gate template。

這不是 apply command。它定義的是 proposal 產生後、任何 memory update 發生前必須經過的人工 checkpoint。

## Required Operator Intent

只有在 operator 明確要求「把已 review 的 RCG hint 更新到 Codex memory」時，才能繼續。

下列情況不得視為 approval：

- 產生 proposal
- 對 planning 說 OK
- timeout
- 只有 acknowledgement 的回覆
- dashboard refresh
- scanner、test 或 Doctor run

## Source Artifact

從 `reports/` 底下產生的 proposal 開始，例如 `resource-coordination-memory-hint-proposal.json`。

Review 即將被寫入的精確 JSON。不要從記憶、聊天紀錄或非正式 summary 重新拼出 hint。

## Required Checks

- hint 是正向近期使用事件，不是負向 availability state。
- `project` 是 stable project id，不是 machine-local path。
- `intent` 已 sanitized，且沒有 secrets、credential paths、完整 commands、screenshots 或 personal activity。
- `resourceClass`、`confidence`、`source`、`observedAt`、`validUntil`、`authority` 與 `afterExpiry` 符合 RCG schema。
- `validUntil` 是短期時效。
- hint 保持 `authority: "soft-hint-only"` 與 `afterExpiry: "historical-only"`。

## Memory Write Surface

只能使用 runtime-approved Codex memory update mechanism。DevGov scanners、dashboard refreshes、tests、Doctor 與 report-generation commands 都不得寫入真實 Codex memory。

寫入 memory 後，只回報 reviewed hint 已記錄。不要印出 secrets 或不相關的 memory content。
