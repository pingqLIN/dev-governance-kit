# Existing Service Onboarding Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the operator-designated DevGov follow-up batch, then complete and review Doctor, Reset, Startup, Dashboard, and Cloudflare governance for every registered existing service.

**Architecture:** Treat the current dirty worktree as two independent pending batches: API key governance and dashboard deck-mode UI. After those are reviewed or isolated, process service onboarding one service at a time by promoting stable evidence into DevGov registries and keeping target-project mutation review-gated.

**Tech Stack:** Node.js 20 ESM scripts, PowerShell entry points, JSON registries under `registry/`, Markdown procedures under `docs/`, generated evidence under `reports/`, and `node --test` verification.

---

## File Structure

- Modify: `registry/api-keys.registry.json`
  - Owns stable credential-location records only. It must not contain API key values, full local credential paths, shell history, or raw command lines.
- Modify: `scripts/lib/api-keys-core.mjs`
  - Owns API key scanner patterns and redaction logic. The only intended current change is adding operator-designated known environment variable names.
- Modify: `tests/environment-governance.test.mjs`
  - Owns registry, scanner, dashboard, Doctor, and onboarding verification tests. API key assertions must be committed with API key scanner changes only.
- Review separately: `scripts/lib/dashboard-core.mjs`
  - Owns rendered dashboard HTML, CSS, and client-side behavior. Current deck-mode card UI changes require browser verification before commit.
- Modify later as each service passes review: `registry/service-onboarding.registry.json`
  - Owns canonical onboarding procedure status for each existing registered service.
- Modify later when stable service-status rows are approved: `registry/local-agents.registry.json`, `registry/public-routes.registry.json`, `registry/startup.registry.json`, and the dashboard service target source already loaded by `scripts/lib/dashboard-core.mjs`.
- Create later as generated evidence only: `reports/service-onboarding-audit.md`, `reports/service-onboarding-audit.json`, and per-project audit notes under `reports/`.

---

### Task 1: Commit Operator-Designated API Key Governance Batch

**Files:**
- Modify: `registry/api-keys.registry.json`
- Modify: `scripts/lib/api-keys-core.mjs`
- Modify: `tests/environment-governance.test.mjs`

- [ ] **Step 1: Confirm the diff only contains operator-designated API key changes**

Run:

```powershell
git diff -- registry/api-keys.registry.json scripts/lib/api-keys-core.mjs tests/environment-governance.test.mjs
```

Expected:

```text
registry/api-keys.registry.json adds machine-openai-api-key-falcon and machine-openai-api-key-translate.
scripts/lib/api-keys-core.mjs adds openai_api_key_falcon and openai_api_key_translate to KNOWN_ENV_NAME_PATTERN.
tests/environment-governance.test.mjs updates only the API key scanner test fixture and expected findings.
No dashboard, service onboarding, or Cloudflare hunks appear in this diff.
```

- [ ] **Step 2: Run focused validation**

Run:

```powershell
npm run validate:registry
node --test tests/environment-governance.test.mjs
npm run scan:api-keys
```

Expected:

```text
Registry validation succeeds.
environment-governance.test.mjs passes.
scan:api-keys writes a report without printing credential values.
```

- [ ] **Step 3: Stage only the API key governance batch**

Run:

```powershell
git add -- registry/api-keys.registry.json scripts/lib/api-keys-core.mjs tests/environment-governance.test.mjs
git diff --cached --check
git diff --cached --stat
git diff --cached -- registry/api-keys.registry.json scripts/lib/api-keys-core.mjs tests/environment-governance.test.mjs
```

Expected:

```text
git diff --cached --check has no output.
The cached diff contains only API key registry, API key scanner, and API key test changes.
```

- [ ] **Step 4: Commit the API key batch**

Run:

```powershell
git commit -m "Add operator API key location records"
git status --short --branch
```

Expected:

```text
A new commit is created.
scripts/lib/dashboard-core.mjs may remain modified for Task 2.
No API key files remain dirty.
```

---

### Task 2: Review Dashboard Deck-Mode UI Batch

**Files:**
- Review and possibly modify: `scripts/lib/dashboard-core.mjs`
- Test: `tests/environment-governance.test.mjs`

- [ ] **Step 1: Inspect the dashboard diff as a UI change, not a service-onboarding change**

Run:

```powershell
git diff -- scripts/lib/dashboard-core.mjs
```

Expected:

```text
The diff adds deck-mode CSS, metric card buttons, drag/tap behavior, and Motion helpers.
No registry or Doctor semantics are changed by this file alone.
```

- [ ] **Step 2: Run non-browser verification**

Run:

```powershell
node --test tests/environment-governance.test.mjs
npm run doctor
```

Expected:

```text
Tests pass.
Doctor passes.
No generated registry changes are required.
```

- [ ] **Step 3: Run the dashboard locally**

Run:

```powershell
npm run dashboard
```

Expected:

```text
The dashboard binds to the governed DevGov dashboard port 127.0.0.1:3000.
If port 3000 is already occupied by the same dashboard, reuse the existing listener.
If port 3000 is occupied by another process, stop and report before changing ports.
```

- [ ] **Step 4: Browser-review the actual dashboard surface**

Open:

```text
http://127.0.0.1:3000
```

Check:

```text
Deck-mode metric cards render within the first viewport.
Cards are clickable and enter the expected dashboard section.
Dragging a card does not accidentally open a section.
Language and theme controls still work.
Reduced-motion users still get functional navigation.
Mobile-width layout does not overlap text or controls.
```

- [ ] **Step 5: Decide whether to commit or revise**

If all checks pass, run:

```powershell
git add -- scripts/lib/dashboard-core.mjs
git diff --cached --check
git commit -m "Add dashboard metric deck interaction"
```

If checks fail, revise only `scripts/lib/dashboard-core.mjs`, rerun Steps 2 through 4, then commit.

Expected:

```text
Dashboard UI changes are committed independently from API key and service-onboarding registry work.
```

---

### Task 3: Regenerate Service-Onboarding Baseline Evidence

**Files:**
- Read: `registry/service-onboarding.registry.json`
- Generate: `reports/service-onboarding-audit.md`
- Generate: `reports/service-onboarding-audit.json`

- [ ] **Step 1: Regenerate the onboarding audit**

Run:

```powershell
npm run scan:service-onboarding
```

Expected:

```text
reports/service-onboarding-audit.md and reports/service-onboarding-audit.json are refreshed.
The summary lists READY, PARTIAL, BLOCKED, missing Doctor, missing restart governance, and missing dashboard status counts.
```

- [ ] **Step 2: Confirm canonical registry still validates**

Run:

```powershell
npm run validate:registry
```

Expected:

```text
registry/service-onboarding.registry.json validates.
registry/local-cloudflare.registry.json validates.
No machine-local paths are promoted into canonical registry data.
```

- [ ] **Step 3: Select the next service by readiness and owner clarity**

Use this order:

```text
1. local-archive-maintainer / app-server-http
2. codex-calendar-todo / staging-http
3. codex-remote / remote-services-http
4. sbs / local-proxy-http
5. taste / web-http
6. color-management-Shader / display-shader-control-lab-http
7. tb2 / tb2-mcp-http
8. lm-studio / local-api-http
9. url-hero / vite-dev
10. video-render-kit / control-panel-http
```

Expected:

```text
Start with services that already have owner evidence or existing local agent/public route records.
Defer needs-owner services until owner discovery is complete.
```

---

### Task 4: Apply The Per-Service Onboarding Review Loop

**Files:**
- Modify when approved: `registry/service-onboarding.registry.json`
- Modify when approved: `registry/startup.registry.json`
- Modify when approved: `registry/public-routes.registry.json`
- Modify when approved: `registry/local-agents.registry.json`
- Generate: `reports/service-onboarding-audit.md`
- Generate: `reports/service-onboarding-audit.json`

Repeat the following steps for exactly one service at a time.

- [ ] **Step 1: Create a service evidence packet**

Run:

```powershell
npm run scan:service-onboarding
Select-String -Path reports/service-onboarding-audit.md -Pattern "<project> / <service>" -Context 0,20
```

Replace `<project>` and `<service>` with the exact registry values, for example:

```powershell
Select-String -Path reports/service-onboarding-audit.md -Pattern "local-archive-maintainer / app-server-http" -Context 0,20
```

Expected:

```text
The output shows socket, readiness, health URL, Doctor state, restart state, Service Status rows, startup refs, public routes, local agents, gaps, and next steps.
```

- [ ] **Step 2: Check target ownership without mutating target projects**

Run the narrowest available read-only probes:

```powershell
rg --files Q:\Projects | rg "(^|[\\/])(<project>|<likely-repo-name>)([\\/]|$)"
rg "<service>|doctor|doctor:repair|health|reset|startup|cloudflare|tunnel|strictPort|require-governed-port" Q:\Projects\<likely-repo-name> -n
```

Expected:

```text
The source repo, runtime repo, external app owner, or unresolved-owner status is identified.
No target project files are modified.
Secrets, token values, Cloudflare certs, and private keys are not printed.
```

- [ ] **Step 3: Classify the service-control outcome**

Use exactly one outcome:

```text
READY: healthProcedure, doctorProcedure, startupProcedure, dashboardProcedure, and cloudflareProcedure are all stable; resetProcedure is disabled, bounded, or explicitly REVIEW_REQUIRED with dashboard execution disabled.
PARTIAL: safe health and at least one stable Doctor or startup reference exists, but reset/start execution still needs review.
BLOCKED: health, Doctor, owner, or startup boundary is missing.
NEEDS_OWNER: ownerKind remains unresolved or external-app ownership is not confirmed.
```

Expected:

```text
The outcome maps to registry readiness and reviewStatus without inventing evidence.
```

- [ ] **Step 4: Promote only stable canonical updates**

Edit `registry/service-onboarding.registry.json` for the selected service only.

Example for a service that found a stable Doctor but still requires reset review:

```json
{
  "readiness": "PARTIAL",
  "doctorProcedure": "Use package.json#scripts.doctor in the source repo after registry preflight.",
  "resetProcedure": "REVIEW_REQUIRED: restart or state reset remains disabled in the dashboard until command boundaries and rollback evidence are reviewed.",
  "reviewStatus": "needs-reset-review",
  "reviewEvidence": "reports/service-onboarding-audit.json#project:service",
  "nextAction": "Review reset/start command boundaries before enabling dashboard execution."
}
```

Expected:

```text
Only stable IDs, stable refs, procedures, review status, and report anchors enter registry data.
Machine-local paths, process IDs, full commands with secrets, and temporary probe output stay in reports.
```

- [ ] **Step 5: Validate and audit after each service**

Run:

```powershell
npm run validate:registry
npm run scan:service-onboarding
npm run doctor
node --test tests/environment-governance.test.mjs
```

Expected:

```text
All commands pass.
reports/service-onboarding-audit.md reflects the updated selected service.
No unrelated service record changes appear in git diff.
```

- [ ] **Step 6: Review the selected service change**

Run:

```powershell
git diff -- registry/service-onboarding.registry.json registry/startup.registry.json registry/public-routes.registry.json registry/local-agents.registry.json reports/service-onboarding-audit.md reports/service-onboarding-audit.json
```

Review checklist:

```text
The selected service has a safe Doctor story.
Reset meaning is explicit: disabled, REVIEW_REQUIRED, or bounded.
Dashboard execution is not enabled for unsafe reset/restart paths.
Cloudflare exposure matches public-route records and Access policy.
Generated reports are evidence only.
No credential values or machine-local canonical paths were added.
```

- [ ] **Step 7: Commit the selected service**

Run:

```powershell
git add -- registry/service-onboarding.registry.json registry/startup.registry.json registry/public-routes.registry.json registry/local-agents.registry.json reports/service-onboarding-audit.md reports/service-onboarding-audit.json
git diff --cached --check
git commit -m "Complete <project> service onboarding review"
```

Expected:

```text
One reviewed service is committed.
The next service starts from a clean, reviewable baseline.
```

---

### Task 5: Handle Needs-Owner Services

**Files:**
- Modify when confirmed: `registry/service-onboarding.registry.json`
- Generate: `reports/service-onboarding-audit.md`
- Generate: `reports/service-onboarding-audit.json`

- [ ] **Step 1: Investigate `lm-studio / local-api-http` ownership**

Run:

```powershell
npm run scan:service-onboarding
Select-String -Path reports/service-onboarding-audit.md -Pattern "lm-studio / local-api-http" -Context 0,20
```

Expected:

```text
If LM Studio is manually started, keep readiness BLOCKED and reviewStatus needs-owner.
If a launcher, service, or startup owner is confirmed, update ownerKind and nextAction only after evidence exists.
```

- [ ] **Step 2: Investigate `video-render-kit / control-panel-http` ownership**

Run:

```powershell
npm run scan:service-onboarding
Select-String -Path reports/service-onboarding-audit.md -Pattern "video-render-kit / control-panel-http" -Context 0,20
rg "8765|control-panel|video-render-kit|render kit" Q:\Projects -n
```

Expected:

```text
If no owner is confirmed, keep readiness BLOCKED and reviewStatus needs-owner.
If the entry is only a planning placeholder, create a reviewed retirement recommendation before removing or changing registry policy.
```

- [ ] **Step 3: Commit owner-resolution decisions one service at a time**

Run after each service decision:

```powershell
npm run validate:registry
npm run scan:service-onboarding
npm run doctor
git add -- registry/service-onboarding.registry.json reports/service-onboarding-audit.md reports/service-onboarding-audit.json
git diff --cached --check
git commit -m "Resolve <project> onboarding ownership"
```

Expected:

```text
Owner-resolution records are reviewed and committed independently.
No source project is mutated by this task.
```

---

### Task 6: Final Batch Verification And Summary

**Files:**
- Read: `registry/service-onboarding.registry.json`
- Read: `reports/service-onboarding-audit.md`
- Read: `reports/service-onboarding-audit.json`

- [ ] **Step 1: Run full DevGov verification**

Run:

```powershell
npm test
npm run scan:agents
npm run validate:registry
npm run doctor
npm run scan:service-onboarding
```

Expected:

```text
All verification commands pass.
Generated service-onboarding reports are current.
```

- [ ] **Step 2: Confirm no unintended dirty files remain**

Run:

```powershell
git status --short --branch
git diff --stat
```

Expected:

```text
Only intentional generated reports or active next-service changes remain.
If no active work remains, the worktree is clean.
```

- [ ] **Step 3: Produce final operator report**

Report:

```text
API key governance commit hash.
Dashboard deck-mode commit hash or reason it was deferred.
Per-service onboarding result for every service.
Remaining REVIEW_REQUIRED resets and why dashboard execution is disabled.
Cloudflare public-route and Access posture for every public service.
Verification commands and pass/fail results.
```

Expected:

```text
The operator can see exactly which projects are READY, PARTIAL, BLOCKED, or NEEDS_OWNER and what remains review-gated.
```

---

## Self-Review

- Spec coverage: This plan confirms the operator-designated dirty changes, separates API key and dashboard work, and defines a per-project Doctor, Reset, Startup, Dashboard, and Cloudflare completion loop.
- Placeholder scan: No task uses unresolved marker wording or generic test instructions without commands and expected results.
- Type consistency: Registry field names match `registry/service-onboarding.registry.json` and validator expectations: `readiness`, `reviewStatus`, `healthProcedure`, `doctorProcedure`, `resetProcedure`, `startupProcedure`, `dashboardProcedure`, and `cloudflareProcedure`.
