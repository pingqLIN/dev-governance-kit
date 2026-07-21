## 共用資源協調

本專案遵循 DevGov 共用資源協調機制。

在把 lag、timeout、browser automation 變慢、UI 回應變慢或 tool 回應延遲直接判定為專案失敗前，先檢查目前 DevGov resource-coordination status，並將觀測分類為 `target-unhealthy`、`environment-contention` 或 `unknown-degraded`。

使用排他性或容量有限資源前，例如 browser profiles、DevTools sessions、GPU-heavy rendering、3D/WebGL/WebGPU、foreground screen control、keyboard、pointer、simulator 或 display control，必須先透過 DevGov resource-coordination surface 登記經清洗、具時間界限的 claim。

過期的 resource snapshot 或 claim 只能作為歷史證據。若要用於目前診斷、資源占用或排程判斷，必須先更新到最新狀態。

### 專案獨占資源

只宣告本專案實際可能占用的資源。若本專案不使用某類資源，填 `None known`。

- Browser automation: `<描述 browser profile、extension state、DevTools，或 None known>`
- GPU/rendering/model inference: `<描述 WebGL/WebGPU/video/local model work，或 None known>`
- Foreground control: `<描述 screen、pointer、keyboard、simulator、display 使用情境，或 None known>`

Generated resource-coordination reports 是 evidence，不是 policy。套用本 overlay 必須透過 reviewed AGENTS diff；不要對多個專案自動 bulk apply。
