# ChatGPT Governance Panel

The DevGov Governance Pulse is a read-heavy MCP App surface for ChatGPT and Codex. It presents a bounded set of high-value signals and exposes only reviewed local controls: live service exceptions, governed project and port coverage, local-agent and route counts, shared host pressure, Doctor actions, and confirmed Restart actions.

## Local architecture

- `scripts/serve-dashboard.mjs` continues to own `127.0.0.1:3000` and now exposes the stateless `/mcp` endpoint.
- `scripts/lib/chatgpt-governance-app.mjs` registers the MCP App tools, control projection, restart-confirmation boundary, and responsive UI resource.
- `scripts/lib/service-control-core.mjs` remains the only runtime execution authority for Doctor and Restart wrappers.
- `plugins/devgov-governance-panel/` packages the local MCP endpoint as a Codex plugin.
- `.agents/plugins/marketplace.json` is the repo-local marketplace entry used for installation and update-safe caching.

The source of truth remains the DevGov registries and live probes. Widget state stores presentation and bounded operation status only; it does not copy or replace canonical governance data.

## Desktop and mobile behavior

The inline surface applies the host-provided theme and CSS variables to its document root, including the conversation background, font, text colors, dividers, spacing, and button behavior. A matching light/dark fallback is used until host context arrives. It has no outer card fill or nested scrolling. A `ResizeObserver` reports intrinsic-height changes to the host so the widget follows its content.

Desktop and narrow hosts use the same content-first DOM. Inline mode keeps the four service counts, a compact governance/capacity line, and at most two exceptions with their available Doctor or Restart controls. `Manage` requests fullscreen and then renders all exceptions, full governance coverage, and shared-capacity details. This progressive disclosure keeps the inline result below the host height cap instead of creating an internal scrollbar. Narrow layouts preserve usable action targets, honor host safe-area insets, and wrap long English or Traditional Chinese text.

The plugin, MCP endpoint, canonical data, and widget view state survive ordinary ChatGPT application updates because they are stored outside the packaged application.

## Governed operations

- `Refresh` is app-only and read-only.
- `Doctor` appears only for a currently surfaced exception with an approved registry action. It uses the existing resolver and audit-event path and returns a bounded summary.
- `Restart` appears only when the approved registry entry also contains the required restart policy fields.
- A restart requires a target-bound, random, single-use confirmation token that expires after one minute. The server consumes the token before execution and rechecks the approved registry entry and restart policy.
- Missing, expired, replayed, mismatched, or no-longer-approved confirmations fail closed.
- The app does not expose arbitrary target/action execution, wrapper paths, commands, local paths, credentials, raw logs, `doctor:repair`, install/startup actions, or public-route mutation.

## Local verification

Start the existing dashboard and inspect the MCP endpoint with an MCP client:

```powershell
npm run dashboard
```

Install the repo marketplace only after reviewing the plugin manifests:

```powershell
codex plugin marketplace add Q:\Projects\dev-governance-kit
codex plugin add devgov-governance-panel@devgov-local
```

Use a new ChatGPT/Codex task after installing or refreshing the plugin.

Focused implementation verification:

```powershell
node --test tests/chatgpt-governance-app.test.mjs
```

## Remote access boundary

ChatGPT mobile requires an HTTPS-reachable MCP endpoint and a developer-mode or reviewed app registration. Do not publish `/mcp`, change Cloudflare routes, or create an app registration from this local implementation step. The new local controls do not change that boundary; remote publication would require a separate authentication, authorization, origin, privacy, and public-exposure review.
