# Resource Coordination Governance

DevGov 將本機多專案開發共享資源視為需要治理的 observation surface。目標是讓多個並行 LLM 開發工作能分辨「目標專案真的不健康」與「主機層資源競爭」，且不新增沉重的常駐協調器。

## 模型

v1 平台採 observe-first：

- `registry/resource-coordination.registry.json` 是 canonical policy 與 channel contract。
- `npm run scan:resource-coordination` 會把輕量 snapshot 寫入 `reports/`。
- 儀表板提供 `/api/resource-coordination` 作為同一份 read model。
- 優先重用既有 dashboard state、service-status rows、service-control events 與作業系統觀測機制。

此平台本身不會 throttle、restart、pause、kill 或 schedule 工作。

## 診斷

不要把 lag 直接當作 target instability 證據。Degraded observations 應分類為：

| 狀態 | 意義 |
| --- | --- |
| `target-unhealthy` | 有 target-local evidence，例如 health check 失敗、listener crash、project error 或 Doctor failure。 |
| `environment-contention` | target evidence 薄弱或健康，但 shared host pressure 或 exclusive resource use 足以解釋 lag。 |
| `unknown-degraded` | evidence 過期或不足；remediation 前要先 refresh。 |

## 排他資源

使用 capacity-limited 或 exclusive resources 前，先登記意圖：

- authenticated browser profiles、browser automation sessions、DevTools sessions 或 extension state
- GPU-heavy 3D rendering、WebGL/WebGPU、canvas checks、video rendering 或 local model inference
- foreground screen、pointer、keyboard、simulator、display 或 interactive desktop control

登記只是 coordination signal，不是權限覆寫。Claims 必須 sanitized 且 time-bound。不要把 secrets、cookies、session data、credential paths、完整 command lines、private screenshots 或 personal activity 放進 canonical registry data。

## 時效

Coordination status 必須會過期。Snapshots 與 exclusive-resource claims 需要 generated、observed、refreshed 或 expiry timestamps。Stale status 只能當歷史 evidence；沒有 refresh 前，不得阻擋目前工作或合理化目前 remediation。

## 指令

執行：

```powershell
npm run scan:resource-coordination
```

預設 scan 刻意保持很小：短時間 CPU/memory sample 加上既有 DevGov registry counts。只有需要 process-family counts 時才使用 `--include-processes`；它只記錄名稱與數量，不記錄 command lines 或 process IDs。

## Project AGENTS Rollout

不要把完整 DevGov policy 複製到每個專案。請使用薄 overlay template：

- `templates/AGENTS.resource-coordination.md`
- `templates/AGENTS.resource-coordination.zh-tw.md`

若要在不修改專案的前提下檢查單一 project AGENTS file，執行：

```powershell
npm run scan:agents -- --agents-file path\to\AGENTS.md --resource-proposal-out reports\agent-resource-overlay.md
```

scanner 只會把 proposal report 寫到 `reports/`。它不會 patch、apply 或 bulk-edit target projects。請先 review proposed snippet，並依專案實際情境調整 project-specific exclusive-resource declarations，再手動編輯該專案 AGENTS file。

## 未來調度

Scheduling 是日後的 reviewed apply path。Automatic throttling、pausing、restarting、killing、priority changes 或 cross-project scheduling 都需要明確 operator approval、service-control review、rollback expectations 與 privacy review。
