# ChatGPT Governance Panel

The DevGov Governance Pulse is a read-only MCP App surface for ChatGPT and Codex. It intentionally presents only high-value signals: live service exceptions, governed project coverage, protected route counts, and shared host pressure.

## Local architecture

- `scripts/serve-dashboard.mjs` continues to own `127.0.0.1:3000` and now exposes the stateless `/mcp` endpoint.
- `scripts/lib/chatgpt-governance-app.mjs` registers the MCP App tools and responsive UI resource.
- `plugins/devgov-governance-panel/` packages the local MCP endpoint as a Codex plugin.
- `.agents/plugins/marketplace.json` is the repo-local marketplace entry used for installation and update-safe caching.

The source of truth remains the DevGov registries and live read-only probes. Widget state stores presentation preferences only; it does not copy or replace canonical governance data.

## Desktop and mobile behavior

Desktop uses an inline summary with optional fullscreen and picture-in-picture display modes. Narrow and mobile hosts switch to a single-column exception-first view, preserve touch target size, honor safe-area insets, and hide the PiP action.

PiP is session-scoped. The plugin, MCP endpoint, canonical data, and widget view state survive ordinary ChatGPT application updates because they are stored outside the packaged application.

## Local verification

Start the existing dashboard and inspect the MCP endpoint with an MCP client:

```powershell
npm run dashboard
```

Install the repo marketplace only after reviewing the plugin manifests:

```powershell
codex plugin marketplace add Q:\Projects\dev-governance-kit.worktrees\chatgpt-native-panel-20260717
codex plugin add devgov-governance-panel@devgov-local
```

Use a new ChatGPT/Codex task after installing or refreshing the plugin.

## Remote access boundary

ChatGPT mobile requires an HTTPS-reachable MCP endpoint and a developer-mode or reviewed app registration. Do not publish `/mcp`, change Cloudflare routes, or create an app registration from this local implementation step. Those are separate public-exposure and authentication review gates.
