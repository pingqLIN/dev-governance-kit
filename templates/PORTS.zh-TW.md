# 專案 Port Map

來源：`registry/ports.registry.json`

這個檔案是目標專案中，根據已核准 registry entries 產生或維護的 read model。不要把它當作暫存 process state 的 scratchpad。

| 服務 | Port | Host | Visibility | Protocol | Notes |
|---|---:|---|---|---|---|
| `<service>` | `<port>` | `127.0.0.1` | `local` | `tcp` | `<why this service owns this port>` |

## 規則

- 不要默默 auto-increment ports。
- 除非任務明確需要 LAN 或 mobile testing，否則 development services 不要 bind 到 `0.0.0.0`。
- Public 或 LAN exposure 必須同時記錄在此檔案與 global registry。
- Docker internal services 應使用 `expose`；只有需要 host access 時才使用 `ports`。
- 如果 port 已被占用，停止並回報 requested port、可偵測到的 owning process，以及 proposed fix。
- Generated scan reports 只是 evidence；有意義的變更必須 review 後，再提升到此檔案與 registry。
