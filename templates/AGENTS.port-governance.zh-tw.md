# 連接埠治理

啟動任何 dev server 前：

1. 先讀 `PORTS.md`。
2. 只使用已宣告的 ports。
3. 不要自行選 random ports。
4. 不要接受 auto-incremented fallback ports。
5. 預設 host 必須是 `127.0.0.1`。
6. 除非任務明確需要 LAN 或 mobile testing，否則不要 bind 到 `0.0.0.0`。
7. 如果 port 已被占用，停止並回報 requested port、可偵測到的 occupied process，以及 proposed fix。
8. 任何新服務都必須更新 `PORTS.md`、`.env.example`、startup scripts 與 global port registry。
9. 將 generated scan reports 視為 evidence，不要視為 policy。
10. 除非專案明確提供已 review 的 command，否則不要執行 automatic patch/apply flow。
11. 若有 governed-port preflight command，啟動服務必須先走它，例如 `node Q:/Projects/dev-governance-kit/scripts/require-governed-port.mjs --project <project> --service <service> -- <raw-command>`。
12. 可重複使用的 `check-ports.mjs` template 只檢查 TCP availability；UDP allocations 必須使用 protocol-specific command 驗證。

Docker services：

- Internal-only services 使用 `expose`。
- 只有需要 host access 時才使用 `ports`。
