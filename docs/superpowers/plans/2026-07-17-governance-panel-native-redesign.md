# DevGov Governance Panel Native Redesign Plan

Status: approved for implementation on `codex/devgov-chatgpt-native-panel`

## Goal

Make the DevGov Governance Pulse feel native inside a Codex/ChatGPT conversation while preserving DevGov's registry, runtime-control, privacy, and rollback boundaries.

The redesign must:

- remove the standalone dashboard/card appearance and inherit the host surface;
- size itself to content without nested scrollbars;
- expose the useful governance fields already present in the pulse contract;
- add safe refresh, doctor, and reviewed restart controls;
- keep English authoritative and maintain the Traditional Chinese companion.

## Evidence and reference inputs

- Current implementation: `scripts/lib/chatgpt-governance-app.mjs`.
- Existing control authority: `scripts/lib/service-control-core.mjs`, `scripts/lib/service-control-resolver.mjs`, and `registry/service-control.registry.json`.
- Existing dashboard interaction behavior: `scripts/lib/dashboard-core.mjs`.
- Official OpenAI Apps SDK UI guidelines: <https://developers.openai.com/apps-sdk/concepts/ui-guidelines>.
- Official `window.openai` bridge reference: <https://developers.openai.com/apps-sdk/reference#capabilities>.
- Lower-tier read-only review of the current app, tests, docs, and control path on 2026-07-17.

The official guidance establishes that inline cards should stay lightweight, use no nested scrolling, limit primary actions to two, inherit system typography and colors, and use dynamic intrinsic height. The reviewer additionally found that restart must not be exposed as a generic direct action on the current CORS-wide local MCP endpoint.

## Information architecture

### Inline conversation surface

The default inline surface will contain:

1. compact overall state, summary, and freshness;
2. services online/offline/error/unknown counts;
3. one compact line for registered projects, ports, protected routes, CPU, memory, and coordination state;
4. at most two high-value exceptions or registry errors;
5. contextual controls only when the server projects an approved action for one of those visible targets;
6. a `Manage` transition for the remaining exceptions and complete governance/capacity detail.

The two primary actions are `Refresh` and `Manage`/`Full screen`. Doctor and restart controls are tertiary, contextual row actions rather than additional primary CTAs.

### Fullscreen surface

Fullscreen uses the same data contract and DOM. It shows all bounded exception details and controls, the complete governance coverage, and shared-capacity reasons without adding tabs or nested navigation.

## Native visual contract

- `html`, `body`, and the root shell use the host-provided conversation background, with matching light/dark fallbacks until host context arrives.
- No outer card fill, border, shadow, or oversized branded heading.
- Use the host/system font stack and host CSS variables with conservative light/dark fallbacks.
- Use body-small typography, compact 4/8/12/16 spacing, thin system dividers, and monochrome outlined controls.
- Status color is an accent only; it does not recolor content backgrounds.
- Layout uses `min-width: 0`, wrapping, `minmax(0, 1fr)`, and `overflow-wrap: anywhere` for long English and Traditional Chinese text.
- No fixed viewport height, `100vh`, internal scroll container, or overflow clipping used to conceal content.
- A `ResizeObserver` calls `window.openai.notifyIntrinsicHeight()` after initial render and every meaningful layout change.
- Narrow layouts remain usable from 280 px upward and retain at least 36 px control targets.

“Native” means matching the public Apps SDK system-token, typography, spacing, and interaction model. It does not mean copying private Codex implementation CSS.

## Data and control contract

### Pulse projection

The pulse remains a compact, allowlisted projection. It will add a `controls` field containing only:

- stable target ID;
- permitted action names;
- readiness/policy-safe labels required by the widget.

It must not return wrapper paths, commands, local paths, credentials, logs, raw process data, or unbounded registry records.

### Refresh

- App-only, read-only MCP tool.
- Reloads the pulse and re-renders the widget.

### Doctor

- Available only for a target whose approved doctor control is projected by the server.
- Uses the existing `executeServiceControl` allowlist/resolver/audit path.
- Returns a bounded operation result: target, action, status, summary, event ID, and completion time.
- Never exposes raw wrapper output.

### Restart

Restart is enabled only for targets with an approved restart entry and complete restart policy.

The required flow is:

1. the app requests a restart confirmation for one projected target;
2. the server rechecks the approved registry entry and issues a random, single-use, target-bound token with a short expiry;
3. the UI displays the exact target and rollback-oriented warning with `Cancel` and `Confirm restart`;
4. the restart tool is invoked only after confirmation;
5. the server consumes the token, rechecks the registry and restart policy, and calls the existing control authority;
6. the UI renders pending/success/failure state, then refreshes the pulse;
7. replayed, expired, mismatched, missing-policy, or unapproved requests fail closed.

No generic command execution, `doctor:repair`, dependency install, startup registration, public-route mutation, or arbitrary wrapper reference is added.

## Implementation slices

1. Extend the pulse/control projection and add bounded operation helpers.
2. Register doctor, prepare-restart, and confirmed-restart MCP tools with accurate annotations and app-only visibility where appropriate.
3. Replace the widget markup/CSS/JS with the transparent, intrinsic-height layout.
4. Add localized operation, confirmation, empty, stale, pending, success, and failure copy.
5. Expand focused tests for projection redaction, control allowlisting, token expiry/replay/mismatch, native CSS constraints, overflow prevention, accessibility labels, and host bridge calls.
6. Update the English and Traditional Chinese operator documentation.

## Verification

Run, in order:

1. `node --test tests/chatgpt-governance-app.test.mjs`
2. `npm test`
3. `npm run scan:agents`
4. `npm run validate:registry`
5. `npm run doctor`
6. Live `show_governance_pulse` call through the installed plugin.
7. Visual inspection in a fresh Codex task when the updated plugin source is active.

Test widths: 280, 320, 375, 480, and 620 px. Test empty, one-exception, and six-exception states; missing metrics; long English/Traditional Chinese labels; doctor success/failure; and restart token failure modes.

## Rollback

The implementation is isolated to the `codex/devgov-chatgpt-native-panel` worktree. Rollback is the reviewable Git diff for this batch. No installed plugin cache, public route, startup entry, dependency, or running service is changed by implementation or tests.
