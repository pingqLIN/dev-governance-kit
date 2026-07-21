# CODEX.memory.rcg-update-gate

狀態：此檔已在 DevGov 本機作為 proposal-only 更新閘道，不再作為正式套件流程。

這個檔案現在只是 external handoff reference stub。它保留舊 DevGov 入口的可發現性，但正式 RCG memory update gate 屬於 `memory-field` architecture：

```text
memory-field:research/handoff/rcg-memory-update-gate.md
```

DevGov 維持 proposal-only。這不是 apply command、writer、runtime-control path、queue、scheduler，也不是 Codex memory mutation mechanism。

## Required Operator Intent

只有在 operator 明確要求「把已 review 的 RCG proposal 交給 memory-field 或 runtime-owned memory architecture」時，才能繼續。

下列情況不得視為 approval：

- 產生 proposal
- 對 planning 說 OK
- timeout
- 只有 acknowledgement 的回覆
- dashboard refresh
- scanner、test 或 Doctor run

## Source Artifact

從 `reports/` 底下產生的 proposal 開始，例如 `resource-coordination-memory-hint-proposal.json`。

Review 精確 JSON proposal。不要從記憶、聊天紀錄或非正式 summary 重新拼出 hint。

## DevGov Handoff Reference

DevGov handoff reference 應維持最小欄位：

```json
{
  "proposalSchema": "devgov.resource-coordination.memory-hint-proposal.v1",
  "sourceReport": "reports/resource-coordination-memory-hint-proposal.json",
  "reviewGate": "memory-field:research/handoff/rcg-memory-update-gate.md",
  "targetArchitecture": "memory-field",
  "authority": "proposal-only",
  "consumerAction": "external-runtime-owned",
  "noDevGovWrite": true
}
```

## Required Checks Before Handoff

- proposal 指向上方 memory-field review gate。
- hint 是正向近期使用事件，不是負向 availability state。
- `project` 是 stable project id，不是 machine-local path。
- `intent` 已 sanitized，且沒有 secrets、credential paths、完整 commands、screenshots 或 personal activity。
- `resourceClass`、`confidence`、`source`、`observedAt`、`validUntil`、`authority` 與 `afterExpiry` 符合 RCG proposal schema。
- `validUntil` 是短期時效。
- hint 保持 `authority: "soft-hint-only"` 與 `afterExpiry: "historical-only"`。
- handoff reference 保持 `consumerAction: "external-runtime-owned"` 與 `noDevGovWrite: true`。

## DevGov Write Surface

DevGov 沒有真實 Codex memory write surface。DevGov scanners、dashboard refreshes、tests、Doctor 與 report-generation commands 都不得寫入真實 Codex memory。

handoff 後，只回報 reviewed proposal 已交給 external memory architecture。不要印出 secrets 或不相關的 memory content。
