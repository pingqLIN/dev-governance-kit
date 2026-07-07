import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildDocsIndex, renderSearchHtml } from "../scripts/lib/docs-index-core.mjs";
import { buildServiceTargets, buildUniTextAgentInstructionIndex, buildWorkspaceGovernancePredictionModel, checkServiceStatuses, loadDashboardState, renderDashboardHtml } from "../scripts/lib/dashboard-core.mjs";
import { runDoctorChecks } from "../scripts/lib/doctor-core.mjs";
import { buildServiceOnboardingAudit } from "../scripts/lib/service-onboarding-core.mjs";
import { executeServiceControl, loadApprovedServiceControls, readServiceControlEvents, SERVICE_CONTROL_PORT } from "../scripts/lib/service-control-core.mjs";
import { isAllowedControlOrigin, SERVICE_CONTROL_ALLOWED_ORIGINS } from "../scripts/lib/service-control-resolver.mjs";
import { buildApiKeyRegistryEntries, renderApiKeyAudit, scanProjectApiKeyReferences } from "../scripts/lib/api-keys-core.mjs";
import { validateApiKeysRegistry, validateDesignSystemRegistry, validateLocalAgentsRegistry, validateLocalCloudflareRegistry, validatePublicRoutesRegistry, validateServiceControlRegistry, validateServiceOnboardingRegistry, validateStartupRegistry, validateTerminalProfilesRegistry } from "../scripts/lib/governance-registry-core.mjs";
import { parseCloudflaredConfig } from "../scripts/lib/public-routes-core.mjs";
import { scanStartupFolder } from "../scripts/lib/startup-core.mjs";
import { buildTerminalFixPlan, scanTerminalSettingsObject } from "../scripts/lib/terminal-core.mjs";

test("terminal scanner flags invalid profile assets and builds a dry-run fix plan", async () => {
  const settings = {
    profiles: {
      list: [
        { guid: "{codex}", name: "Codex", icon: "robot" },
        { guid: "{pwsh}", name: "PowerShell", icon: "ms-appx:///ProfileIcons/pwsh.png" }
      ]
    }
  };

  const scan = await scanTerminalSettingsObject(settings, "settings.json");
  const plan = buildTerminalFixPlan([scan]);

  assert.equal(scan.findings.length, 1);
  assert.equal(scan.findings[0].profileName, "Codex");
  assert.equal(plan.actions[0].action, "delete icon");
});

test("startup scanner classifies Codex startup-folder entries without promoting paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-startup-"));
  await writeFile(
    join(root, "Codex Remote Services.cmd"),
    '@echo off\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "Q:\\Projects\\demo\\Start.ps1"\n',
    "utf8"
  );

  const entries = await scanStartupFolder(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].classification, "codex-created");
  assert.equal(entries[0].risk, "bypass-policy-review");
});

test("public route parser extracts cloudflared ingress routes and ignores fallback status services", () => {
  const routes = parseCloudflaredConfig(`
tunnel: 8f494f33-5983-4933-bb71-5812b56cad56
credentials-file: should-not-be-reported.json
ingress:
  - hostname: mcp.example.test
    service: http://127.0.0.1:43189
  - service: http_status:404
`);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].hostname, "mcp.example.test");
  assert.equal(routes[0].localHost, "127.0.0.1");
  assert.equal(routes[0].localPort, 43189);
});

test("public route scan flags duplicate hostnames across config files", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-routes-"));
  await writeFile(join(root, "a.yml"), "tunnel: one\ningress:\n  - hostname: mcp.example.test\n    service: http://127.0.0.1:43189\n", "utf8");
  await writeFile(join(root, "b.yml"), "tunnel: two\ningress:\n  - hostname: mcp.example.test\n    service: http://127.0.0.1:3189\n", "utf8");
  const { scanPublicRouteConfigs } = await import("../scripts/lib/public-routes-core.mjs");

  const scan = await scanPublicRouteConfigs(root);
  assert.equal(scan.routes.length, 2);
  assert.ok(scan.routes.every((route) => route.risk === "duplicate-hostname-review"));
});

test("new governance registries validate canonical shared data only", () => {
  assert.deepEqual(validateTerminalProfilesRegistry({
    schema: "devgov.terminal-profiles.registry.v1",
    profiles: [{ id: "codex", name: "Codex", status: "approved", assetPolicy: "none", source: "terminal audit", notes: "invalid icon removed" }]
  }), []);

  assert.deepEqual(validateStartupRegistry({
    schema: "devgov.startup.registry.v1",
    entries: [{
      id: "codex-remote-services",
      project: "codex-remote",
      trigger: "startup-folder",
      purpose: "start supervised remote service",
      scriptRef: "scripts/start.ps1",
      status: "candidate",
      source: "startup audit",
      notes: "requires review",
      managedByCodex: true
    }]
  }), []);

  assert.deepEqual(validatePublicRoutesRegistry({
    schema: "devgov.public-routes.registry.v1",
    routes: [{
      id: "mcp-prod",
      serviceId: "mcp-prod",
      hostname: "mcp.example.test",
      tunnelId: "8f494f33-5983-4933-bb71-5812b56cad56",
      localHost: "127.0.0.1",
      localPort: 43189,
      protocol: "http",
      exposureClass: "prod-protected",
      accessRequired: true,
      healthUrl: "https://mcp.example.test/health",
      status: "candidate",
      source: "public route audit",
      notes: "Access verification required"
    }]
  }), []);

  assert.deepEqual(validateLocalAgentsRegistry({
    schema: "devgov.local-agents.registry.v1",
    agents: [{
      id: "local-agent",
      project: "local-agent",
      kind: "windows-service-agent",
      serviceId: "LocalAgentService",
      displayName: "Local Agent",
      healthUrl: "http://127.0.0.1:8787/health",
      portRef: "local-agent:http",
      startupRef: "local-agent-service",
      status: "candidate",
      source: "service audit",
      notes: "loopback service agent",
      managedByCodex: true
    }]
  }), []);

  assert.deepEqual(validateApiKeysRegistry({
    schema: "devgov.api-keys.registry.v1",
    entries: [{
      id: "openai-api-key",
      project: "system-environment",
      service: "OpenAI Platform",
      variableName: "OPENAI_API_KEY",
      credentialKind: "api-key",
      storageLocation: "Windows Machine environment variables",
      accessMethod: "Environment variable consumed by OpenAI SDKs.",
      settingsUrl: "https://platform.openai.com/api-keys",
      rules: "Never commit values; rotate in the owning service dashboard.",
      status: "candidate",
      source: "API key environment audit",
      notes: "Stores only the variable name and policy."
    }]
  }), []);

  assert.deepEqual(validateServiceOnboardingRegistry({
    schema: "devgov.service-onboarding.registry.v1",
    entries: [{
      id: "demo-web-http",
      project: "demo",
      service: "web-http",
      readiness: "PARTIAL",
      ownerKind: "source-repo",
      sourceRef: "registry/ports.registry.json#demo:web-http",
      healthProcedure: "Use /health.",
      doctorProcedure: "Use package.json#scripts.doctor.",
      resetProcedure: "REVIEW_REQUIRED until reviewed.",
      startupProcedure: "Use reviewed startup registry entry.",
      dashboardProcedure: "Service Status row exists.",
      cloudflareProcedure: "No public route.",
      reviewStatus: "needs-implementation",
      reviewEvidence: "reports/service-onboarding-audit.json#demo:web-http",
      nextAction: "Register Doctor.",
      notes: "No machine-local paths."
    }]
  }), []);

  assert.deepEqual(validateLocalCloudflareRegistry({
    schema: "devgov.local-cloudflare.registry.v1",
    items: [{
      id: "cloudflare.loopback-origin",
      kind: "loopback-origin",
      requirement: "Use governed loopback origin.",
      ownerRegistry: "registry/ports.registry.json",
      verification: "Run port preflight.",
      status: "approved",
      notes: "No host-local path."
    }]
  }), []);

  assert.deepEqual(validateDesignSystemRegistry({
    schema: "devgov.design-system.registry.v1",
    description: "Reusable design tokens.",
    sourceOfTruth: "DESIGN.md",
    status: "candidate",
    colorFormat: "oklch",
    themes: {
      light: {
        ink: "oklch(23% 0.018 248)",
        muted: "oklch(47% 0.035 248)",
        line: "oklch(82% 0.027 240)",
        paper: "oklch(96% 0.01 86)",
        panel: "oklch(99% 0.007 86)",
        panelRaised: "oklch(94% 0.015 145)",
        input: "oklch(99% 0.007 86)",
        accent: "oklch(47% 0.106 183)",
        accentInk: "oklch(99% 0.007 86)",
        link: "oklch(45% 0.13 261)",
        okBg: "oklch(90% 0.067 170)",
        warnBg: "oklch(91% 0.08 86)",
        badBg: "oklch(90% 0.07 27)",
        neutralBg: "oklch(92% 0.021 248)",
        gridLine: "oklch(23% 0.018 248 / .045)",
        headerBg: "oklch(99% 0.007 86 / .94)",
        focus: "oklch(58% 0.13 183)"
      },
      dark: {
        ink: "oklch(92% 0.012 248)",
        muted: "oklch(72% 0.03 248)",
        line: "oklch(37% 0.03 248)",
        paper: "oklch(18% 0.018 248)",
        panel: "oklch(22% 0.02 248)",
        panelRaised: "oklch(28% 0.035 178)",
        input: "oklch(18% 0.018 248)",
        accent: "oklch(70% 0.116 176)",
        accentInk: "oklch(16% 0.018 248)",
        link: "oklch(76% 0.102 253)",
        okBg: "oklch(34% 0.063 170)",
        warnBg: "oklch(36% 0.064 86)",
        badBg: "oklch(35% 0.064 27)",
        neutralBg: "oklch(30% 0.025 248)",
        gridLine: "oklch(92% 0.012 248 / .045)",
        headerBg: "oklch(20% 0.018 248 / .94)",
        focus: "oklch(77% 0.13 176)"
      }
    },
    typography: Object.fromEntries(["display", "headline", "title", "body", "label", "mono"].map((role) => [role, {
      fontFamily: "Aptos, Segoe UI, system-ui, sans-serif",
      fontSize: "14px",
      fontWeight: 400,
      lineHeight: 1.45,
      letterSpacing: "0"
    }])),
    rounded: { none: "0" },
    spacing: { sm: "8px" },
    layout: { narrowBreakpoint: "820px" },
    components: { table: { border: "2px solid {themes.light.ink}" } },
    statusSemantics: { ok: ["approved"] },
    rules: ["Keep status words visible."]
  }), []);
  assert.deepEqual(validateServiceControlRegistry({
    schema: "devgov.service-control.registry.v1",
    entries: [{
      id: "devgov-dashboard-restart",
      controlTargetId: "devgov-dashboard",
      surfaceTargets: ["devgov-dashboard"],
      action: "restart",
      approved: true,
      wrapperRef: "scripts/service-control/restart-devgov-dashboard.ps1",
      resolverRef: "scripts/lib/service-control-resolver.mjs#resolveControlTarget",
      inputContract: "No user input.",
      auditLevel: "server-authored-local-log",
      timeoutSeconds: 15,
      rollbackNotes: "Use local opener manually.",
      uiLabel: "Restart",
      requiresConfirmation: true,
      status: "approved",
      notes: "Reviewed local-only control."
    }]
  }), []);
});

test("API key scanner records names and redacts values", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-api-keys-"));
  await writeFile(join(root, ".env"), "OPENAI_API_KEY=sk-test-secret\nAPP_PORT=3101\n", "utf8");
  await writeFile(join(root, "README.md"), "Use OPENAI_API_KEY, openai_api_key_falcon, openai_api_key_translate, and CF_API_TOKEN for local tests.", "utf8");

  const project = await scanProjectApiKeyReferences(root);
  const report = renderApiKeyAudit({
    generatedAt: "2026-05-31T00:00:00.000Z",
    project,
    environment: [{
      scope: "machine",
      name: "OPENAI_API_KEY",
      service: "OpenAI Platform",
      storageLocation: "Windows Machine environment variables",
      accessMethod: "Environment variable consumed by OpenAI SDKs.",
      settingsUrl: "https://platform.openai.com/api-keys",
      rules: "Never commit values; rotate in the owning service dashboard.",
      risk: "persistent-review"
    }]
  });

  assert.equal(project.findings.length, 5);
  assert.doesNotMatch(report, /sk-test-secret/);
  assert.match(report, /OPENAI_API_KEY=<redacted>/);
  assert.match(report, /openai_api_key_falcon/);
  assert.match(report, /openai_api_key_translate/);
  assert.match(report, /machine-openai-api-key/);
});

test("API key registry suggestions promote only machine scope by default", () => {
  const entries = buildApiKeyRegistryEntries([
    {
      scope: "process",
      name: "ANTHROPIC_API_KEY",
      service: "Anthropic Console",
      storageLocation: "Current process environment",
      accessMethod: "Environment variable consumed by Anthropic SDKs.",
      settingsUrl: "https://console.anthropic.com/settings/keys",
      rules: "Never commit values.",
      risk: "transient-review"
    },
    {
      scope: "machine",
      name: "OPENAI_API_KEY",
      service: "OpenAI Platform",
      storageLocation: "Windows Machine environment variables",
      accessMethod: "Environment variable consumed by OpenAI SDKs.",
      settingsUrl: "https://platform.openai.com/api-keys",
      rules: "Never commit values.",
      risk: "persistent-review"
    }
  ]);

  assert.deepEqual(entries.map((entry) => entry.id), ["machine-openai-api-key"]);
});

test("docs index excludes reports and redacts credential-like content", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-docs-"));
  await mkdir(join(root, "docs"));
  await mkdir(join(root, "reports"));
  await mkdir(join(root, "scripts"));
  await writeFile(join(root, "README.md"), "# Project\n\nTOKEN=should-not-leak\nPort governance", "utf8");
  await writeFile(join(root, "reports", "local.md"), "# Local report\n\nprivate", "utf8");
  await writeFile(join(root, "scripts", "intenal.mjs"), "console.log('not indexed')", "utf8");

  const index = await buildDocsIndex(root);
  assert.equal(index.documents.length, 1);
  assert.equal(index.documents[0].path, "README.md");
  assert.doesNotMatch(index.documents[0].preview, /should-not-leak/);
});

test("scan CLIs keep generated evidence inside reports by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-terminal-"));
  const settingsPath = join(root, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ profiles: { list: [{ name: "Codex", icon: "robot" }] } }), "utf8");

  const result = spawnSync(
    process.execPath,
    ["scripts/scan-terminal.mjs", "--settings", settingsPath, "--out", join(tmpdir(), "terminal-audit.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-docs writes static search artifacts under reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-docs-cli-"));
  await writeFile(join(root, "README.md"), "# Searchable\n\nregistry startup terminal", "utf8");
  const indexOut = "reports/test-search-index.json";
  const htmlOut = "reports/test-search.html";

  const result = spawnSync(
    process.execPath,
    ["scripts/scan-docs.mjs", "--root", root, "--out", indexOut, "--html-out", htmlOut],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const index = JSON.parse(await readFile(indexOut, "utf8"));
  const html = await readFile(htmlOut, "utf8");
  assert.equal(index.documents[0].title, "Searchable");
  assert.match(html, /const docs = \[/);
  assert.match(renderSearchHtml(index), /搜尋 AGENTS、registry、templates、docs/);
});

test("dashboard renders canonical DevGov registry state", async () => {
  const state = await loadDashboardState(".");
  const html = renderDashboardHtml(state);

  assert.equal(state.app.name, "DevGov");
  assert.equal(state.dashboardPort.port, 3000);
  assert.ok(state.localAgents.some((agent) => agent.id === "local-archive-maintainer"));
  assert.equal(state.summary.agentInstructions, state.agentInstructions.entries.length);
  assert.equal(state.summary.registeredProjects, state.registeredProjects.length);
  assert.equal(state.workspacePrediction.schema, "devgov.workspace-governance-predictor.v1");
  assert.equal(state.workspacePrediction.defaultWorkspaceRoot, "Q:\\Projects");
  assert.equal(state.summary.workspacePredictionRules, state.workspacePrediction.rules.length);
  assert.ok(state.workspacePrediction.rules.some((rule) => rule.id === "workspace.location.q-projects"));
  assert.ok(state.agentInstructions.entries.some((entry) => entry.id === "agent.authority.single-runtime-source"));
  assert.equal(state.localFileCompanions["AGENTS.md"], "AGENTS.zh-tw.md");
  assert.ok(state.serviceTargets.some((target) => target.id === "devgov-dashboard"));
  assert.ok(state.registeredProjects.some((project) => project.project === "devgov" && project.services.includes("dashboard-http")));
  assert.ok(state.webEntrypoints.some((entry) => entry.project === "tb2" && entry.url === "https://tb2.colorgeek.co/health"));
  assert.ok(state.webEntrypoints.some((entry) => entry.project === "tb2" && entry.url === "https://tb2-health-staging.colorgeek.co/health"));
  assert.match(html, /DevGov Dashboard/);
  assert.match(html, /本機治理主控台/);
  assert.match(html, /總覽/);
  assert.match(html, /本機登記專案/);
  assert.match(html, /registered-projects/);
  assert.match(html, /服務狀態/);
  assert.match(html, /English/);
  assert.match(html, /Local Service Agents/);
  assert.match(html, /API Key Governance/);
  assert.match(html, /Agent Instructions/);
  assert.match(html, /Workspace Rule Predictor/);
  assert.match(html, /workspace-predictor/);
  assert.match(html, /prediction-tabs/);
  assert.match(html, /workspace-predictor-run/);
  assert.match(html, /execution-status/);
  assert.match(html, /Execution Status/);
  assert.match(html, /beginExecutionTask/);
  assert.match(html, /finishExecutionTask/);
  assert.match(html, /ruleHeaders/);
  assert.match(html, /type: '類型'/);
  assert.match(html, /layer: '治理層'/);
  assert.match(html, /evidence: '依據'/);
  assert.match(html, /'safety-gate': '安全門檻 \(safety-gate\)'/);
  assert.match(html, /workspace: '工作區 \(workspace\)'/);
  assert.match(html, /EFFECTIVE: '生效 \(EFFECTIVE\)'/);
  assert.match(html, /loadedPolicyPathClass: '依已載入政策與選取路徑分類預測。'/);
  assert.match(html, /Service Status/);
  assert.match(html, /service-onboarding/);
  assert.match(html, /Web 入口/);
  assert.match(html, /tb2\.colorgeek\.co\/health/);
  assert.match(html, /Quick Test/);
  assert.match(html, /status-action/);
  assert.match(html, /action-key/);
  assert.match(html, /service-control-dialog/);
  assert.match(html, /control-dialog-log/);
  assert.match(html, /refreshServiceStatus\(\{ silent: true \}\)/);
  assert.match(html, /syncViewUrl/);
  assert.match(html, /hashchange/);
  assert.match(html, /popstate/);
  assert.match(html, /&#128477;&#65039;/);
  assert.doesNotMatch(html, /action-button inline-action/);
  assert.doesNotMatch(html, /id="refresh-status"/);
  assert.match(html, /\/file\?path=/);
  assert.match(html, /\/api\/unitext-agent-instructions/);
  assert.match(html, /Progress tags/);
  assert.match(html, /專案進度由已登錄資料彙整/);
  assert.match(html, /projectTagPill/);
  assert.match(html, /Repo \+ Cloudflared/);
  assert.match(html, /renderProjectSourceChip/);
  assert.match(html, /source-chip/);
  assert.match(html, /下一步/);
  assert.match(html, /來源/);
  assert.match(html, /agent\.authority\.single-runtime-source/);
  assert.match(html, /file-ref-companion/);
  assert.match(html, /"AGENTS\.md":"AGENTS\.zh-tw\.md"/);
  assert.match(html, /127\.0\.0\.1:3000/);
});

test("workspace governance predictor model keeps local path policy out of canonical registry entries", async () => {
  const state = await loadDashboardState(".");
  const model = buildWorkspaceGovernancePredictionModel(state.agentInstructions);

  assert.equal(model.schema, "devgov.workspace-governance-predictor.v1");
  assert.equal(model.defaultWorkspaceRoot, "Q:\\Projects");
  assert.ok(model.layers.some((layer) => layer.id === "repo-local"));
  assert.ok(model.entries.some((entry) => entry.id === "agent.safety.review-gates"));
  assert.equal(model.entries.some((entry) => entry.id === "workspace.location.q-projects"), false);
  assert.ok(model.rules.some((rule) => rule.id === "workspace.git.pre-edit"));
  assert.ok(model.checks.some((check) => check.id === "check.git-status"));
});

test("dashboard exposes UniText query records and service targets", async () => {
  const state = await loadDashboardState(".");
  const unitext = buildUniTextAgentInstructionIndex(state.agentInstructions);
  const targets = state.serviceTargets;
  const registeredProjects = state.registeredProjects;
  const devgovProject = registeredProjects.find((project) => project.project === "devgov");
  const codexRemoteProject = registeredProjects.find((project) => project.project === "codex-remote");
  const dashboardTarget = targets.find((target) => target.id === "devgov-dashboard");
  const serviceControlTarget = targets.find((target) => target.id === "devgov-service-control");
  const devgovGovTarget = targets.find((target) => target.id === "public-route:devgov-gov");
  const devgovDevTarget = targets.find((target) => target.id === "public-route:devgov-dev");
  const localAgentTarget = targets.find((target) => target.id === "local-agent:local-archive-maintainer");
  const mcpRouteTarget = targets.find((target) => target.id === "public-route:mcp-colorgeek");
  const stagingRouteTarget = targets.find((target) => target.id === "public-route:codex-calendar-todo-staging");
  const tunnelClientTarget = targets.find((target) => target.id === "onboarding:tunnel-client-local-filesystem-mcp");
  const ps3eyeTarget = targets.find((target) => target.id === "onboarding:ps3eye-windows-virtual-camera");
  const tasteTarget = targets.find((target) => target.id === "public-route:taste");
  const sbsTarget = targets.find((target) => target.id === "onboarding:sbs-local-proxy-http");
  const displayShaderLabTarget = targets.find((target) => target.id === "onboarding:color-management-shader-display-shader-control-lab-http");
  const urlHeroTarget = targets.find((target) => target.id === "onboarding:url-hero-vite-dev");
  const comfyUiTarget = targets.find((target) => target.id === "onboarding:comfyui-local-http");
  const photoHdrFlowTarget = targets.find((target) => target.id === "onboarding:photo-hdr-flow-web-ui-http");
  const gsdfEotfTarget = targets.find((target) => target.id === "onboarding:gsdf-eotf-video-adjuster-vite-dev");
  const skill0GuiTarget = targets.find((target) => target.id === "onboarding:skill-0-gui-review-studio-http");
  const nowledgeCompatTarget = targets.find((target) => target.id === "onboarding:chatgpt-local-files-mcp-nowledge-compat-http");

  assert.equal(unitext.schema, "devgov.unitext-agent-instructions.v1");
  assert.equal(devgovProject.progressTag, "PARTIAL");
  assert.ok(devgovProject.tags.includes("reviewed"));
  assert.ok(devgovProject.sourceRefs.some((ref) => ref.includes("registry/ports.registry.json#devgov:dashboard-http")));
  assert.equal(codexRemoteProject.progressTag, "READY");
  assert.equal(registeredProjects.some((project) => project.project === "taste-web"), false);
  assert.equal(registeredProjects.some((project) => project.project === "tb2-mcp-http"), false);
  assert.ok(unitext.nodes.some((node) => node.id === "instruction:agent.authority.single-runtime-source"));
  assert.ok(unitext.edges.some((edge) => edge.kind === "classifies"));
  assert.ok(targets.some((target) => target.kind === "dashboard" && target.url.endsWith("/health")));
  assert.ok(targets.some((target) => target.kind === "public-route"));
  assert.equal(dashboardTarget.doctor.state, "FOUND");
  assert.equal(dashboardTarget.restart.state, "FOUND");
  assert.equal(dashboardTarget.restart.policyReadiness.complete, true);
  assert.equal(dashboardTarget.controlReadiness, "PARTIAL");
  assert.equal(serviceControlTarget.project, "devgov");
  assert.equal(serviceControlTarget.target, "127.0.0.1:3201");
  assert.equal(serviceControlTarget.doctor.state, "FOUND");
  assert.equal(serviceControlTarget.restart.state, "REVIEW_REQUIRED");
  assert.equal(serviceControlTarget.controlReadiness, "PARTIAL");
  assert.equal(devgovGovTarget.doctor.state, "FOUND");
  assert.equal(devgovGovTarget.restart.state, "FOUND");
  assert.equal(devgovGovTarget.restart.policyReadiness.complete, true);
  assert.equal(devgovGovTarget.controlReadiness, "PARTIAL");
  assert.equal(devgovDevTarget.doctor.state, "FOUND");
  assert.equal(devgovDevTarget.restart.state, "FOUND");
  assert.equal(devgovDevTarget.restart.policyReadiness.complete, true);
  assert.equal(devgovDevTarget.controlReadiness, "PARTIAL");
  assert.equal(localAgentTarget.doctor.state, "FOUND");
  assert.equal(localAgentTarget.restart.state, "FOUND");
  assert.equal(localAgentTarget.restart.policyReadiness.complete, true);
  assert.equal(localAgentTarget.controlReadiness, "PARTIAL");
  assert.equal(mcpRouteTarget.doctor.state, "FOUND");
  assert.equal(mcpRouteTarget.restart.state, "REVIEW_REQUIRED");
  assert.equal(mcpRouteTarget.controlReadiness, "PARTIAL");
  assert.equal(stagingRouteTarget.controlTargetId, "codex-calendar-todo-staging");
  assert.equal(stagingRouteTarget.doctor.state, "FOUND");
  assert.equal(stagingRouteTarget.restart.state, "FOUND");
  assert.equal(stagingRouteTarget.controlReadiness, "PARTIAL");
  assert.equal(tunnelClientTarget.project, "openai-mcp-tunnel");
  assert.equal(tunnelClientTarget.target, "127.0.0.1:8080");
  assert.equal(tunnelClientTarget.doctor.state, "FOUND");
  assert.equal(tunnelClientTarget.restart.state, "FOUND");
  assert.equal(tunnelClientTarget.controlReadiness, "PARTIAL");
  assert.equal(ps3eyeTarget.project, "ps3eye-windows-virtual-camera");
  assert.equal(ps3eyeTarget.quickTest.state, "CHECKING");
  assert.equal(ps3eyeTarget.doctor.state, "FOUND");
  assert.equal(ps3eyeTarget.restart.state, "FOUND");
  assert.equal(ps3eyeTarget.controlReadiness, "PARTIAL");
  assert.equal(tasteTarget.project, "taste-web");
  assert.equal(tasteTarget.doctor.state, "FOUND");
  assert.equal(tasteTarget.restart.state, "FOUND");
  assert.equal(tasteTarget.controlReadiness, "PARTIAL");
  assert.equal(sbsTarget.project, "sbs");
  assert.equal(sbsTarget.target, "127.0.0.1:3287");
  assert.equal(sbsTarget.doctor.state, "FOUND");
  assert.equal(sbsTarget.restart.state, "FOUND");
  assert.equal(sbsTarget.controlReadiness, "PARTIAL");
  assert.equal(displayShaderLabTarget.project, "color-management-Shader");
  assert.equal(displayShaderLabTarget.target, "127.0.0.1:4173");
  assert.equal(displayShaderLabTarget.doctor.state, "FOUND");
  assert.equal(displayShaderLabTarget.restart.state, "FOUND");
  assert.equal(displayShaderLabTarget.controlReadiness, "PARTIAL");
  assert.equal(urlHeroTarget.project, "url-hero");
  assert.equal(urlHeroTarget.target, "127.0.0.1:3100");
  assert.equal(urlHeroTarget.doctor.state, "FOUND");
  assert.equal(urlHeroTarget.restart.state, "FOUND");
  assert.equal(urlHeroTarget.controlReadiness, "PARTIAL");
  assert.equal(comfyUiTarget.project, "ComfyUI");
  assert.equal(comfyUiTarget.target, "127.0.0.1:8188");
  assert.equal(comfyUiTarget.doctor.state, "FOUND");
  assert.equal(comfyUiTarget.restart.state, "FOUND");
  assert.equal(comfyUiTarget.controlReadiness, "PARTIAL");
  assert.equal(photoHdrFlowTarget.project, "photo-hdr-flow");
  assert.equal(photoHdrFlowTarget.target, "127.0.0.1:8765");
  assert.equal(photoHdrFlowTarget.doctor.state, "FOUND");
  assert.equal(photoHdrFlowTarget.restart.state, "FOUND");
  assert.equal(photoHdrFlowTarget.controlReadiness, "PARTIAL");
  assert.equal(gsdfEotfTarget.project, "gsdf-eotf-video-adjuster");
  assert.equal(gsdfEotfTarget.target, "127.0.0.1:3101");
  assert.equal(gsdfEotfTarget.doctor.state, "FOUND");
  assert.equal(gsdfEotfTarget.restart.state, "FOUND");
  assert.equal(gsdfEotfTarget.controlReadiness, "PARTIAL");
  assert.equal(skill0GuiTarget.project, "skill-0-GUI");
  assert.equal(skill0GuiTarget.target, "127.0.0.1:3102");
  assert.equal(skill0GuiTarget.doctor.state, "FOUND");
  assert.equal(skill0GuiTarget.restart.state, "FOUND");
  assert.equal(skill0GuiTarget.controlReadiness, "PARTIAL");
  assert.equal(nowledgeCompatTarget.project, "chatgpt-local-files-mcp");
  assert.equal(nowledgeCompatTarget.target, "127.0.0.1:14242");
  assert.equal(nowledgeCompatTarget.doctor.state, "FOUND");
  assert.equal(nowledgeCompatTarget.restart.state, "FOUND");
  assert.equal(nowledgeCompatTarget.controlReadiness, "PARTIAL");
});

test("live service-status view excludes retired targets from the active control surface and recomputes readiness from probe results", async () => {
  const status = await checkServiceStatuses(".");
  const dashboardTarget = status.services.find((target) => target.id === "devgov-dashboard");
  const serviceControlTarget = status.services.find((target) => target.id === "devgov-service-control");
  const devgovGovTarget = status.services.find((target) => target.id === "public-route:devgov-gov");
  const devgovDevTarget = status.services.find((target) => target.id === "public-route:devgov-dev");
  const localArchiveTarget = status.services.find((target) => target.id === "local-agent:local-archive-maintainer");
  const lmStudioLocalTarget = status.services.find((target) => target.id === "local-agent:lmstudio-local-agent");
  const ps3eyeTarget = status.services.find((target) => target.id === "onboarding:ps3eye-windows-virtual-camera");
  const mcpRouteTarget = status.services.find((target) => target.id === "public-route:mcp-colorgeek");
  const lmStudioRouteTarget = status.services.find((target) => target.id === "public-route:lmstudio");
  const retiredRouteTarget = status.retiredServices.find((target) => target.id === "public-route:mcp-colorgeek");
  const tunnelClientTarget = status.services.find((target) => target.id === "onboarding:tunnel-client-local-filesystem-mcp");

  assert.equal(status.schema, "devgov.service-status.v1");
  assertLiveReadiness(dashboardTarget);
  assertLiveReadiness(serviceControlTarget);
  assertLiveReadiness(devgovGovTarget);
  assertLiveReadiness(devgovDevTarget);
  assertLiveReadiness(localArchiveTarget);
  assertLiveReadiness(lmStudioLocalTarget);
  assertLiveReadiness(ps3eyeTarget);
  assertLiveReadiness(mcpRouteTarget);
  assertLiveReadiness(lmStudioRouteTarget);
  assertLiveReadiness(tunnelClientTarget);
  if (localArchiveTarget.quickTest.statusCode === 401) {
    assert.equal(localArchiveTarget.quickTest.state, "ONLINE");
  }
  if (lmStudioLocalTarget.quickTest.statusCode === 401) {
    assert.equal(lmStudioLocalTarget.quickTest.state, "ONLINE");
  }
  if (lmStudioRouteTarget.quickTest.statusCode === 401) {
    assert.equal(lmStudioRouteTarget.quickTest.state, "ONLINE");
  }
  assert.equal(mcpRouteTarget.doctor.state, "FOUND");
  assert.equal(mcpRouteTarget.restart.state, "REVIEW_REQUIRED");
  assert.equal(mcpRouteTarget.controlReadiness, "PARTIAL");
  assert.equal(retiredRouteTarget, undefined);
});

function assertLiveReadiness(target) {
  assert.ok(target);
  assert.ok(["ONLINE", "OFFLINE", "ERROR", "MISSING"].includes(target.quickTest.state));
  assert.equal(target.controlReadiness, expectedLiveReadiness(target));
}

function expectedLiveReadiness(target) {
  const quickState = target.quickTest?.state;
  const hasQuickSignal = ["ONLINE", "OFFLINE", "ERROR"].includes(quickState);
  const hasControl = [target.doctor?.state, target.restart?.state].some((state) => ["FOUND", "REVIEW_REQUIRED"].includes(state));
  if (quickState === "ONLINE" && target.doctor?.state === "FOUND" && target.restart?.state === "FOUND") return "READY";
  if (hasQuickSignal && hasControl) return "PARTIAL";
  return "BLOCKED";
}

test("service control registry and approved DevGov action are executable through the reviewed wrapper", async () => {
  const eventsPath = "reports/service-control-events.json";
  const originalEvents = await readFile(eventsPath, "utf8").catch(() => null);
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "devgov-dashboard" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "devgov-dashboard" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
  assert.equal(SERVICE_CONTROL_PORT, 3201);

  try {
    const doctorResult = await executeServiceControl(".", { controlTargetId: "devgov-dashboard", action: "doctor" }, { origin: "http://127.0.0.1:3000", clientIp: "127.0.0.1" });
    const result = await executeServiceControl(".", { controlTargetId: "devgov-dashboard", action: "restart" }, { origin: "http://127.0.0.1:3000", clientIp: "127.0.0.1" });
    const events = await readServiceControlEvents(".");

    assert.equal(doctorResult.ok, true);
    assert.match(doctorResult.summary, /DevGov doctor passed/i);
    assert.equal(result.ok, true);
    assert.match(result.summary, /DevGov dashboard/i);
    assert.ok(events.some((event) => event.controlTargetId === "devgov-dashboard" && event.action === "doctor" && event.ok));
    assert.ok(events.some((event) => event.controlTargetId === "devgov-dashboard" && event.action === "restart" && event.ok));
  } finally {
    if (originalEvents === null) {
      await rm(eventsPath, { force: true });
    } else {
      await writeFile(eventsPath, originalEvents, "utf8");
    }
  }
});

test("service control allows reviewed local and protected DevGov dashboard origins only", () => {
  assert.ok(SERVICE_CONTROL_ALLOWED_ORIGINS.has("http://127.0.0.1:3000"));
  assert.equal(isAllowedControlOrigin("https://dev.colorgeek.co"), true);
  assert.equal(isAllowedControlOrigin("https://gov.colorgeek.co"), true);
  assert.equal(isAllowedControlOrigin("https://codex-calendar-todo-staging.colorgeek.co"), false);
  assert.equal(isAllowedControlOrigin("https://example.com"), false);
});

test("service control registry exposes tunnel client doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "tunnel-client-local-filesystem-mcp" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "tunnel-client-local-filesystem-mcp" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);

  const result = await executeServiceControl(".", { controlTargetId: "tunnel-client-local-filesystem-mcp", action: "doctor" }, { origin: "http://127.0.0.1:3000", clientIp: "127.0.0.1" });

  assert.equal(result.ok, true);
  assert.match(result.summary, /Tunnel client doctor passed/i);
});

test("service control registry exposes local archive maintainer doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "local-archive-maintainer" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "local-archive-maintainer" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes the DevGov service-control listener doctor without self-restart", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "devgov-service-control" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "devgov-service-control" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl, undefined);
});

test("service control registry exposes ps3eye virtual camera doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "ps3eye-windows-virtual-camera" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "ps3eye-windows-virtual-camera" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes taste doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "taste" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "taste" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes codex calendar todo staging doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "codex-calendar-todo-staging" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "codex-calendar-todo-staging" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes sbs doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "sbs" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "sbs" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes color management shader doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "color-management-shader" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "color-management-shader" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes url hero doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "url-hero" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "url-hero" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes draw-draw doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "draw-draw" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "draw-draw" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
  assert.equal(restartControl.restartPolicy.permissionBoundary.includes("loopback-only"), true);
});

test("service control registry exposes codex remote doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "codex-remote" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "codex-remote" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes lm studio doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "lm-studio" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "lm-studio" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes tb2 doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "tb2" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "tb2" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes comfyui local doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "comfyui-local" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "comfyui-local" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes photo hdr flow web doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "photo-hdr-flow-web" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "photo-hdr-flow-web" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
});

test("service control registry exposes reviewed controls for newly supplemented service rows", async () => {
  const controls = await loadApprovedServiceControls(".");
  const gsdfDoctor = controls.find((entry) => entry.controlTargetId === "gsdf-eotf-video-adjuster" && entry.action === "doctor");
  const gsdfRestart = controls.find((entry) => entry.controlTargetId === "gsdf-eotf-video-adjuster" && entry.action === "restart");
  const skill0Doctor = controls.find((entry) => entry.controlTargetId === "skill-0-gui" && entry.action === "doctor");
  const skill0Restart = controls.find((entry) => entry.controlTargetId === "skill-0-gui" && entry.action === "restart");
  const mcpDoctor = controls.find((entry) => entry.controlTargetId === "mcp-colorgeek" && entry.action === "doctor");
  const nowledgeDoctor = controls.find((entry) => entry.controlTargetId === "chatgpt-local-files-mcp-nowledge-compat" && entry.action === "doctor");
  const nowledgeRestart = controls.find((entry) => entry.controlTargetId === "chatgpt-local-files-mcp-nowledge-compat" && entry.action === "restart");

  for (const control of [gsdfDoctor, gsdfRestart, skill0Doctor, skill0Restart, mcpDoctor, nowledgeDoctor, nowledgeRestart]) {
    assert.ok(control);
    assert.equal(control.status, "approved");
  }
  assert.equal(gsdfRestart.restartPolicy.permissionBoundary.includes("loopback-only"), true);
  assert.equal(skill0Restart.restartPolicy.permissionBoundary.includes("loopback-only"), true);
  assert.equal(nowledgeRestart.uiLabel, "Reset");
});

test("service onboarding audit summarizes registered service gaps", async () => {
  const state = await loadDashboardState(".");
  const audit = buildServiceOnboardingAudit(state);
  const devgov = audit.services.find((row) => row.id === "devgov:dashboard-http");
  const devgovServiceControl = audit.services.find((row) => row.id === "devgov:service-control-http");
  const archive = audit.services.find((row) => row.id === "local-archive-maintainer:app-server-http");
  const gsdfEotf = audit.services.find((row) => row.id === "gsdf-eotf-video-adjuster:vite-dev");
  const skill0Gui = audit.services.find((row) => row.id === "skill-0-GUI:review-studio-http");
  const nowledgeCompat = audit.services.find((row) => row.id === "chatgpt-local-files-mcp:nowledge-compat-http");

  assert.equal(audit.schema, "devgov.service-onboarding-audit.v1");
  assert.ok(audit.summary.services >= state.ports.length);
  assert.equal(audit.summary.missingDoctor, 0);
  assert.equal(audit.summary.missingDashboardStatus, 0);
  assert.equal(devgov.readiness, "PARTIAL");
  assert.equal(devgov.flags.missingDoctor, false);
  assert.equal(devgovServiceControl.readiness, "PARTIAL");
  assert.equal(devgovServiceControl.flags.missingDoctor, false);
  assert.equal(devgovServiceControl.flags.missingRestart, false);
  assert.equal(devgovServiceControl.flags.missingDashboardStatus, false);
  assert.equal(archive.readiness, "PARTIAL");
  assert.equal(archive.flags.missingDoctor, false);
  assert.ok(archive.quickLinks.some((link) => link.label === "Doctor"));
  assert.ok(archive.quickLinks.some((link) => link.label === "Health"));
  for (const row of [gsdfEotf, skill0Gui, nowledgeCompat]) {
    assert.ok(row);
    assert.equal(row.flags.missingDoctor, false);
    assert.equal(row.flags.missingRestart, false);
    assert.equal(row.flags.missingDashboardStatus, false);
    assert.ok(row.quickLinks.some((link) => link.label === "Doctor"));
    assert.ok(row.quickLinks.some((link) => link.label === "Health"));
  }
});

test("doctor verifies DevGov dashboard governance without modifying canonical registries", async () => {
  const result = await runDoctorChecks(".");

  assert.equal(result.ok, true, JSON.stringify(result.checks.filter((check) => !check.ok), null, 2));
  assert.equal(result.repairs.length, 0);
  assert.ok(result.checks.some((check) => check.id === "dashboard-port-registry" && check.ok));
  const startupCheck = result.checks.find((check) => check.id === "dashboard-startup-registry");
  assert.ok(startupCheck?.ok);
  assert.match(startupCheck.detail, /devgov-gov-public-route-login/);
  assert.ok(result.checks.some((check) => check.id === "script-scripts/register-dashboard-protocol.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/start-gov-public-route.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/register-gov-public-route-startup.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/require-governed-port.mjs" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/service-control/doctor-devgov-service-control.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "registry-service-onboarding.registry.json" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "registry-local-cloudflare.registry.json" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "local-agent-registry" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "api-key-registry" && check.ok));
});
