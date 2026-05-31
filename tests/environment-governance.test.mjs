import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildDocsIndex, renderSearchHtml } from "../scripts/lib/docs-index-core.mjs";
import { buildServiceTargets, buildUniTextAgentInstructionIndex, loadDashboardState, renderDashboardHtml } from "../scripts/lib/dashboard-core.mjs";
import { runDoctorChecks } from "../scripts/lib/doctor-core.mjs";
import { buildApiKeyRegistryEntries, renderApiKeyAudit, scanProjectApiKeyReferences } from "../scripts/lib/api-keys-core.mjs";
import { validateApiKeysRegistry, validateDesignSystemRegistry, validateLocalAgentsRegistry, validatePublicRoutesRegistry, validateStartupRegistry, validateTerminalProfilesRegistry } from "../scripts/lib/governance-registry-core.mjs";
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
});

test("API key scanner records names and redacts values", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-api-keys-"));
  await writeFile(join(root, ".env"), "OPENAI_API_KEY=sk-test-secret\nAPP_PORT=3101\n", "utf8");
  await writeFile(join(root, "README.md"), "Use OPENAI_API_KEY and CF_API_TOKEN for local tests.", "utf8");

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

  assert.equal(project.findings.length, 3);
  assert.doesNotMatch(report, /sk-test-secret/);
  assert.match(report, /OPENAI_API_KEY=<redacted>/);
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
  await writeFile(join(root, "scripts", "internal.mjs"), "console.log('not indexed')", "utf8");

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
  assert.equal(state.dashboardPort.port, 3101);
  assert.ok(state.localAgents.some((agent) => agent.id === "local-archive-maintainer"));
  assert.equal(state.summary.agentInstructions, state.agentInstructions.entries.length);
  assert.ok(state.agentInstructions.entries.some((entry) => entry.id === "agent.authority.single-runtime-source"));
  assert.ok(state.serviceTargets.some((target) => target.id === "devgov-dashboard"));
  assert.match(html, /DevGov Dashboard/);
  assert.match(html, /Local Service Agents/);
  assert.match(html, /API Key Governance/);
  assert.match(html, /Agent Instructions/);
  assert.match(html, /Service Status/);
  assert.match(html, /Quick Test/);
  assert.doesNotMatch(html, /id="refresh-status"/);
  assert.match(html, /\/file\?path=/);
  assert.match(html, /\/api\/unitext-agent-instructions/);
  assert.match(html, /agent\.authority\.single-runtime-source/);
  assert.match(html, /127\.0\.0\.1:3101/);
});

test("dashboard exposes UniText query records and service targets", async () => {
  const state = await loadDashboardState(".");
  const unitext = buildUniTextAgentInstructionIndex(state.agentInstructions);
  const targets = buildServiceTargets({
    dashboardPort: state.dashboardPort,
    publicRoutes: state.publicRoutes,
    localAgents: state.localAgents,
    startupEntries: state.startupEntries
  });
  const dashboardTarget = targets.find((target) => target.id === "devgov-dashboard");
  const localAgentTarget = targets.find((target) => target.id === "local-agent:local-archive-maintainer");

  assert.equal(unitext.schema, "devgov.unitext-agent-instructions.v1");
  assert.ok(unitext.nodes.some((node) => node.id === "instruction:agent.authority.single-runtime-source"));
  assert.ok(unitext.edges.some((edge) => edge.kind === "classifies"));
  assert.ok(targets.some((target) => target.kind === "dashboard" && target.url.endsWith("/health")));
  assert.ok(targets.some((target) => target.kind === "public-route"));
  assert.equal(dashboardTarget.doctor.state, "FOUND");
  assert.equal(dashboardTarget.restart.state, "FOUND");
  assert.equal(dashboardTarget.controlReadiness, "READY");
  assert.equal(localAgentTarget.doctor.state, "MISSING");
  assert.equal(localAgentTarget.restart.state, "REVIEW_REQUIRED");
  assert.equal(localAgentTarget.controlReadiness, "PARTIAL");
});

test("doctor verifies DevGov dashboard governance without modifying canonical registries", async () => {
  const result = await runDoctorChecks(".");

  assert.equal(result.ok, true, JSON.stringify(result.checks.filter((check) => !check.ok), null, 2));
  assert.equal(result.repairs.length, 0);
  assert.ok(result.checks.some((check) => check.id === "dashboard-port-registry" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "dashboard-startup-registry" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "local-agent-registry" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "api-key-registry" && check.ok));
});
