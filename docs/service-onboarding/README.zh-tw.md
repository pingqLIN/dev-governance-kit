# 服務導入紀錄

這個資料夾紀錄已存在於 DevGov registry 中的服務導入計畫。

Canonical machine-readable source 是 `registry/service-onboarding.registry.json`。產生出的 evidence 保留在 `reports/service-onboarding-audit.json` 與 `reports/service-onboarding-audit.md`。共用 Doctor/reset/Cloudflare 程序定義在 `docs/service-onboarding/doctor-reset-cloudflare.zh-tw.md`。

Chrome built-in AI model-cache sharing 程序記錄在 `docs/service-onboarding/chrome-ai-model-store.zh-tw.md`。

## 審核規則

每個 service record 建立或更新後，都必須完成審核。審核內容包含：

- service 仍存在於 `registry/ports.registry.json`
- health、Doctor、startup、dashboard procedure 都有明確描述
- reset 與 Cloudflare procedure 都有明確描述
- machine-local paths、credentials、process IDs、logs、temporary probe details 不得進入 canonical registry data
- dashboard restart 維持停用，除非日後有另一個 reviewed apply path 明確核准 execution

## 本批次

| Service | Readiness | Review | Next action |
|---|---|---|---|
| `devgov:dashboard-http` | `READY` | `reviewed` | 作為 reference implementation。 |
| `local-archive-maintainer:app-server-http` | `PARTIAL` | `needs-implementation` | 新增或登記 project Doctor。 |
| `codex-calendar-todo:staging-http` | `PARTIAL` | `needs-implementation` | 將 runtime operations 包成 Doctor。 |
| `codex-remote:remote-services-http` | `PARTIAL` | `needs-implementation` | 對齊 `/health` 與 `/healthz`，再新增 Doctor。 |
| `tb2:tb2-mcp-http` | `BLOCKED` | `needs-implementation` | 將 TB2 status/start scripts 提升為穩定 refs。 |
| `taste:web-http` | `BLOCKED` | `needs-implementation` | 將 `runtime:check` 提升為 Doctor，並補 start governance。 |
| `lm-studio:local-api-http` | `BLOCKED` | `needs-owner` | 確認 external app startup owner。 |
| `color-management-Shader:display-shader-control-lab-http` | `PARTIAL` | `reviewed` | 治理靜態 preview server 與本機健康檢查。 |
| `sbs:local-proxy-http` | `BLOCKED` | `needs-implementation` | 登記既有 proxy Doctor scripts。 |
| `url-hero:vite-dev` | `BLOCKED` | `needs-implementation` | 補 governed dev-server wrapper 與 Doctor。 |
| `photo-hdr-flow:web-ui-http` | `PARTIAL` | `reviewed` | 已透過 `photo_hdr_flow web` loopback authority 登記本機 `/api/health`、Doctor 與 Restart。 |
| `chrome-ai-model-store:shared-model-cache` | `READY` | `reviewed` | 已登記 Stable primary model store 與 secondary channel 的 Doctor、Reset wrappers。 |

## 批次審核

本批次只審核 DevGov planning 與 recording change。它不修改 target projects、不登記新 startup entries，也不啟用 dashboard restart execution。
