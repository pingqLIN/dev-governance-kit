import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

export const DASHBOARD_HOST = "127.0.0.1";
export const DASHBOARD_PORT = 3101;
export const DASHBOARD_URL = `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`;

export async function loadDashboardState(root = ".") {
  const [pkg, ports, startup, publicRoutes, terminalProfiles, localAgents, apiKeys, agentInstructions] = await Promise.all([
    readJson(path.join(root, "package.json")),
    readJson(path.join(root, "registry", "ports.registry.json")),
    readJson(path.join(root, "registry", "startup.registry.json")),
    readJson(path.join(root, "registry", "public-routes.registry.json")),
    readJson(path.join(root, "registry", "terminal-profiles.registry.json")),
    readJson(path.join(root, "registry", "local-agents.registry.json")),
    readJson(path.join(root, "registry", "api-keys.registry.json")),
    readJson(path.join(root, "registry", "agent-instructions.registry.json"))
  ]);

  const dashboardPort = ports.entries.find((entry) => (
    entry.project === "devgov"
    && entry.service === "dashboard-http"
  ));

  return {
    app: {
      name: "DevGov",
      packageName: pkg.name,
      version: pkg.version,
      url: DASHBOARD_URL
    },
    dashboardPort,
    summary: {
      ports: ports.entries.length,
      startupEntries: startup.entries.length,
      publicRoutes: publicRoutes.routes.length,
      terminalProfiles: terminalProfiles.profiles.length,
      localAgents: localAgents.agents.length,
      apiKeys: apiKeys.entries.length,
      agentInstructions: agentInstructions.entries.length
    },
    ports: ports.entries,
    startupEntries: startup.entries,
    publicRoutes: publicRoutes.routes,
    terminalProfiles: terminalProfiles.profiles,
    localAgents: localAgents.agents,
    apiKeys: apiKeys.entries,
    agentInstructions: {
      sourceOfTruth: agentInstructions.sourceOfTruth,
      layers: agentInstructions.layers,
      itemTypes: agentInstructions.itemTypes,
      entries: agentInstructions.entries
    },
    serviceTargets: buildServiceTargets({
      dashboardPort,
      publicRoutes: publicRoutes.routes,
      localAgents: localAgents.agents,
      startupEntries: startup.entries
    })
  };
}

export function buildServiceTargets({ dashboardPort, publicRoutes = [], localAgents = [], startupEntries = [] }) {
  const targets = [];
  const startupById = new Map(startupEntries.map((entry) => [entry.id, entry]));
  const startupByProject = new Map(startupEntries.map((entry) => [entry.project, entry]));

  if (dashboardPort) {
    const target = {
      id: "devgov-dashboard",
      project: "devgov",
      label: "DevGov Dashboard",
      kind: "dashboard",
      registryStatus: "approved",
      url: `${dashboardPort.protocol}://${dashboardPort.host}:${dashboardPort.port}/health`,
      target: `${dashboardPort.host}:${dashboardPort.port}`,
      quickTest: buildQuickTest(`${dashboardPort.protocol}://${dashboardPort.host}:${dashboardPort.port}/health`),
      doctor: {
        state: "FOUND",
        ref: "package.json#scripts.doctor",
        notes: "DevGov Doctor is exposed through npm run doctor and /api/doctor."
      },
      restart: {
        state: "FOUND",
        ref: "scripts/open-dashboard.mjs",
        notes: "Reviewed on-demand starter exists. Dashboard execution remains disabled."
      }
    };
    targets.push(withControlReadiness(target));
  }

  for (const agent of localAgents) {
    const startup = startupById.get(agent.startupRef) ?? startupByProject.get(agent.project);
    const target = {
      id: `local-agent:${agent.id}`,
      project: agent.project,
      label: agent.displayName,
      kind: "local-agent",
      registryStatus: agent.status,
      url: agent.healthUrl,
      target: agent.serviceId,
      quickTest: buildQuickTest(agent.healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: "No stable project Doctor mechanism is registered for this local agent."
      },
      restart: startup ? {
        state: "REVIEW_REQUIRED",
        ref: startup.scriptRef,
        notes: "A startup/service reference exists, but it is not approved for dashboard restart execution."
      } : {
        state: "MISSING",
        ref: "",
        notes: "No stable startup or restart reference is registered."
      }
    };
    targets.push(withControlReadiness(target));
  }

  for (const route of publicRoutes) {
    const startup = startupByProject.get(route.serviceId);
    const target = {
      id: `public-route:${route.id}`,
      project: route.serviceId,
      label: route.hostname,
      kind: "public-route",
      registryStatus: route.status,
      url: route.healthUrl,
      target: `${route.localHost}:${route.localPort}`,
      quickTest: buildQuickTest(route.healthUrl),
      doctor: {
        state: "MISSING",
        ref: "",
        notes: "Public-route health URL is a quick test, not a registered project Doctor."
      },
      restart: startup ? {
        state: "REVIEW_REQUIRED",
        ref: startup.scriptRef,
        notes: "Startup governance exists for this service, but dashboard restart execution is not approved."
      } : {
        state: "MISSING",
        ref: "",
        notes: "No stable startup or restart reference is registered for this public route."
      }
    };
    targets.push(withControlReadiness(target));
  }

  return targets;
}

export async function checkServiceStatuses(root = ".", options = {}) {
  const state = await loadDashboardState(root);
  const timeoutMs = options.timeoutMs ?? 2500;
  const statuses = await Promise.all(state.serviceTargets.map(async (target) => {
    const live = await checkUrl(target.url, timeoutMs);
    return {
      ...target,
      live,
      quickTest: {
        ...target.quickTest,
        ...live
      }
    };
  }));

  return {
    schema: "devgov.service-status.v1",
    generatedAt: new Date().toISOString(),
    timeoutMs,
    services: statuses
  };
}

function buildQuickTest(url) {
  return {
    state: url ? "CHECKING" : "MISSING",
    url,
    notes: url ? "Safe HTTP health check only." : "No health URL is registered."
  };
}

function withControlReadiness(target) {
  return {
    ...target,
    controlReadiness: deriveControlReadiness(target)
  };
}

function deriveControlReadiness(target) {
  const hasQuickTest = Boolean(target.quickTest?.url);
  if (hasQuickTest && target.doctor?.state === "FOUND" && target.restart?.state === "FOUND") {
    return "READY";
  }

  if (hasQuickTest && [target.doctor?.state, target.restart?.state].some((state) => ["FOUND", "REVIEW_REQUIRED"].includes(state))) {
    return "PARTIAL";
  }

  return "BLOCKED";
}

export function buildUniTextAgentInstructionIndex(agentInstructions) {
  const sourcePath = "registry/agent-instructions.registry.json";
  const nodes = [
    ...agentInstructions.layers.map((layer) => ({
      id: `layer:${layer.id}`,
      type: "agent-instruction-layer",
      label: layer.id,
      path: sourcePath,
      summary: layer.appliesTo,
      status: layer.status,
      searchText: [layer.id, layer.scope, layer.appliesTo, layer.notes].join(" ")
    })),
    ...agentInstructions.itemTypes.map((itemType) => ({
      id: `item-type:${itemType.id}`,
      type: "agent-instruction-item-type",
      label: itemType.label,
      path: sourcePath,
      summary: itemType.description,
      status: itemType.status,
      searchText: [itemType.id, itemType.label, itemType.description, itemType.governanceUse].join(" ")
    })),
    ...agentInstructions.entries.map((entry) => ({
      id: `instruction:${entry.id}`,
      type: "agent-instruction",
      label: entry.id,
      path: sourcePath,
      logicalPath: entry.evidence,
      summary: entry.requirement,
      status: entry.status,
      searchText: [
        entry.id,
        entry.type,
        entry.layer,
        entry.appliesTo,
        entry.requirement,
        entry.enforcement,
        entry.evidence,
        entry.notes
      ].join(" ")
    }))
  ];

  return {
    schema: "devgov.unitext-agent-instructions.v1",
    generatedAt: new Date().toISOString(),
    adapter: {
      id: "governance-folder",
      sourceOfTruth: agentInstructions.sourceOfTruth,
      canonicalRegistry: sourcePath,
      queryUse: "Ingest as a UniText-style governance-folder read model without copying local-only evidence."
    },
    nodes,
    edges: agentInstructions.entries.flatMap((entry) => [
      { from: `layer:${entry.layer}`, to: `instruction:${entry.id}`, kind: "governs" },
      { from: `item-type:${entry.type}`, to: `instruction:${entry.id}`, kind: "classifies" }
    ]),
    queryFields: ["id", "type", "label", "path", "logicalPath", "summary", "status", "searchText"]
  };
}

export function renderDashboardHtml(state) {
  const stateJson = JSON.stringify(state).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DevGov Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --ink: oklch(23% 0.018 248);
      --muted: oklch(47% 0.035 248);
      --line: oklch(82% 0.027 240);
      --paper: oklch(96% 0.01 86);
      --panel: oklch(99% 0.007 86);
      --panel-raised: oklch(94% 0.015 145);
      --input: oklch(99% 0.007 86);
      --accent: oklch(47% 0.106 183);
      --accent-ink: oklch(99% 0.007 86);
      --blue: oklch(45% 0.13 261);
      --ok-bg: oklch(90% 0.067 170);
      --warn-bg: oklch(91% 0.08 86);
      --bad-bg: oklch(90% 0.07 27);
      --neutral-bg: oklch(92% 0.021 248);
      --grid-line: oklch(23% 0.018 248 / .045);
      --header-bg: oklch(99% 0.007 86 / .94);
      --focus: oklch(58% 0.13 183);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --ink: oklch(92% 0.012 248);
        --muted: oklch(72% 0.03 248);
        --line: oklch(37% 0.03 248);
        --paper: oklch(18% 0.018 248);
        --panel: oklch(22% 0.02 248);
        --panel-raised: oklch(28% 0.035 178);
        --input: oklch(18% 0.018 248);
        --accent: oklch(70% 0.116 176);
        --accent-ink: oklch(16% 0.018 248);
        --blue: oklch(76% 0.102 253);
        --ok-bg: oklch(34% 0.063 170);
        --warn-bg: oklch(36% 0.064 86);
        --bad-bg: oklch(35% 0.064 27);
        --neutral-bg: oklch(30% 0.025 248);
        --grid-line: oklch(92% 0.012 248 / .045);
        --header-bg: oklch(20% 0.018 248 / .94);
        --focus: oklch(77% 0.13 176);
      }
    }
    [data-theme="light"] {
      color-scheme: light;
      --ink: oklch(23% 0.018 248);
      --muted: oklch(47% 0.035 248);
      --line: oklch(82% 0.027 240);
      --paper: oklch(96% 0.01 86);
      --panel: oklch(99% 0.007 86);
      --panel-raised: oklch(94% 0.015 145);
      --input: oklch(99% 0.007 86);
      --accent: oklch(47% 0.106 183);
      --accent-ink: oklch(99% 0.007 86);
      --blue: oklch(45% 0.13 261);
      --ok-bg: oklch(90% 0.067 170);
      --warn-bg: oklch(91% 0.08 86);
      --bad-bg: oklch(90% 0.07 27);
      --neutral-bg: oklch(92% 0.021 248);
      --grid-line: oklch(23% 0.018 248 / .045);
      --header-bg: oklch(99% 0.007 86 / .94);
      --focus: oklch(58% 0.13 183);
    }
    [data-theme="dark"] {
      color-scheme: dark;
      --ink: oklch(92% 0.012 248);
      --muted: oklch(72% 0.03 248);
      --line: oklch(37% 0.03 248);
      --paper: oklch(18% 0.018 248);
      --panel: oklch(22% 0.02 248);
      --panel-raised: oklch(28% 0.035 178);
      --input: oklch(18% 0.018 248);
      --accent: oklch(70% 0.116 176);
      --accent-ink: oklch(16% 0.018 248);
      --blue: oklch(76% 0.102 253);
      --ok-bg: oklch(34% 0.063 170);
      --warn-bg: oklch(36% 0.064 86);
      --bad-bg: oklch(35% 0.064 27);
      --neutral-bg: oklch(30% 0.025 248);
      --grid-line: oklch(92% 0.012 248 / .045);
      --header-bg: oklch(20% 0.018 248 / .94);
      --focus: oklch(77% 0.13 176);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
        linear-gradient(0deg, var(--grid-line) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font-family: "Aptos", "Segoe UI", system-ui, sans-serif;
    }
    header {
      border-bottom: 2px solid var(--ink);
      background: var(--header-bg);
      padding: 18px clamp(16px, 3vw, 34px);
      position: sticky;
      top: 0;
      z-index: 2;
      backdrop-filter: saturate(1.15) blur(8px);
    }
    .mast {
      align-items: end;
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr) auto;
      max-width: 1360px;
      margin: 0 auto;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(34px, 6vw, 72px);
      letter-spacing: 0;
      line-height: .9;
      margin: 0;
    }
    .header-actions {
      align-items: end;
      display: grid;
      gap: 10px;
      justify-items: end;
      min-width: 230px;
    }
    .status {
      align-items: center;
      display: flex;
      gap: 8px;
      font-size: 14px;
      justify-content: end;
      max-width: 34ch;
      overflow-wrap: anywhere;
    }
    .dot {
      background: var(--accent);
      border: 2px solid var(--ink);
      border-radius: 999px;
      height: 14px;
      width: 14px;
    }
    .theme-toggle {
      border: 2px solid var(--ink);
      background: var(--panel);
      justify-content: center;
      min-height: 38px;
      padding: 7px 12px;
      width: auto;
    }
    .theme-toggle:hover, .action-button:hover, nav button:hover {
      background: var(--panel-raised);
    }
    .theme-toggle:focus-visible, button:focus-visible, input:focus-visible, a:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    main {
      display: grid;
      gap: 22px;
      grid-template-columns: 290px minmax(0, 1fr);
      max-width: 1360px;
      margin: 0 auto;
      padding: 24px clamp(16px, 3vw, 34px) 42px;
    }
    nav {
      align-self: start;
      border: 2px solid var(--ink);
      background: var(--panel);
      position: sticky;
      top: 116px;
    }
    button {
      align-items: center;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      color: var(--ink);
      cursor: pointer;
      display: flex;
      font: inherit;
      gap: 10px;
      min-height: 44px;
      padding: 10px 14px;
      text-align: left;
      width: 100%;
    }
    button[aria-selected="true"] {
      background: var(--ink);
      color: var(--paper);
    }
    .action-button {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 38px;
      padding: 7px 12px;
      width: auto;
    }
    .action-button[disabled] {
      color: var(--muted);
      cursor: not-allowed;
      opacity: .7;
    }
    .glyph {
      border: 1px solid currentColor;
      display: inline-grid;
      font-size: 12px;
      height: 22px;
      place-items: center;
      width: 22px;
    }
    section { display: none; }
    section.active { display: block; }
    .strip {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(7, minmax(120px, 1fr));
      margin-bottom: 18px;
    }
    .metric {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 96px;
      padding: 12px;
    }
    .metric strong {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 36px;
      font-weight: 700;
      line-height: 1;
    }
    .metric span, .muted {
      color: var(--muted);
      font-size: 13px;
    }
    .toolbar {
      align-items: center;
      display: flex;
      gap: 10px;
      justify-content: space-between;
      margin: 8px 0 12px;
    }
    input {
      border: 2px solid var(--ink);
      background: var(--input);
      color: var(--ink);
      font: inherit;
      max-width: 420px;
      min-height: 42px;
      padding: 8px 10px;
      width: 100%;
    }
    a {
      color: var(--blue);
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    .guidance {
      background: var(--panel);
      border: 2px solid var(--ink);
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
      padding: 12px;
    }
    .guidance-row {
      display: grid;
      gap: 8px;
      grid-template-columns: 180px minmax(0, 1fr);
    }
    table {
      background: var(--panel);
      border: 2px solid var(--ink);
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--panel-raised);
      font-size: 12px;
      text-transform: uppercase;
    }
    td {
      overflow-wrap: anywhere;
    }
    code {
      color: var(--blue);
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 13px;
    }
    .pill {
      border: 1px solid var(--ink);
      display: inline-block;
      font-size: 12px;
      line-height: 1.35;
      padding: 2px 7px;
      white-space: nowrap;
    }
    .local { background: var(--ok-bg); }
    .public, .candidate { background: var(--warn-bg); }
    .blocked { background: var(--bad-bg); }
    .approved { background: var(--ok-bg); }
    .ONLINE { background: var(--ok-bg); }
    .OFFLINE { background: var(--bad-bg); }
    .ERROR { background: var(--warn-bg); }
    .CHECKING { background: var(--neutral-bg); }
    .online, .found, .ready { background: var(--ok-bg); }
    .offline, .missing, .blocked { background: var(--bad-bg); }
    .error, .review_required, .partial { background: var(--warn-bg); }
    .checking, .disabled, .not_applicable { background: var(--neutral-bg); }
    .control-stack {
      display: grid;
      gap: 5px;
      min-width: 170px;
    }
    .inline-meta {
      color: var(--muted);
      display: block;
      font-size: 12px;
      margin-top: 2px;
    }
    @media (max-width: 820px) {
      .mast, main { grid-template-columns: 1fr; }
      .header-actions { justify-items: start; min-width: 0; }
      nav { position: static; }
      .strip { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .status { justify-content: start; }
      .toolbar { align-items: stretch; flex-direction: column; }
      .guidance-row { grid-template-columns: 1fr; }
      table {
        display: block;
        font-size: 14px;
        overflow-x: auto;
        white-space: nowrap;
      }
      th, td { white-space: normal; }
    }
  </style>
</head>
<body>
<header>
  <div class="mast">
    <div>
      <h1>DevGov</h1>
      <div class="muted">Local governance console for ports, startup automation, public routes, and workspace readiness.</div>
    </div>
    <div class="header-actions">
      <button class="theme-toggle" type="button" id="theme-toggle" aria-pressed="false">Dark mode</button>
      <div class="status"><span class="dot"></span><span>${escapeHtml(state.app.url)}</span></div>
    </div>
  </div>
</header>
<main>
  <nav aria-label="Dashboard views">
    <button data-view="overview" aria-selected="true"><span class="glyph">01</span> Overview</button>
    <button data-view="ports"><span class="glyph">02</span> Ports</button>
    <button data-view="agents"><span class="glyph">03</span> Local Agents</button>
    <button data-view="startup"><span class="glyph">04</span> Startup</button>
    <button data-view="routes"><span class="glyph">05</span> Routes</button>
    <button data-view="terminal"><span class="glyph">06</span> Terminal</button>
    <button data-view="api-keys"><span class="glyph">07</span> API Keys</button>
    <button data-view="agent-instructions"><span class="glyph">08</span> Agent Instructions</button>
    <button data-view="service-status"><span class="glyph">09</span> Service Status</button>
  </nav>
  <div>
    <section id="overview" class="active">
      <div class="strip" id="metrics"></div>
      <table id="dashboard-port"></table>
    </section>
    <section id="ports">
      <div class="toolbar"><h2>Port Registry</h2><input data-filter="ports" placeholder="Filter ports"></div>
      <table data-table="ports"></table>
    </section>
    <section id="agents">
      <div class="toolbar"><h2>Local Service Agents</h2><input data-filter="agents" placeholder="Filter local agents"></div>
      <table data-table="agents"></table>
    </section>
    <section id="startup">
      <div class="toolbar"><h2>Startup Governance</h2><input data-filter="startup" placeholder="Filter startup"></div>
      <table data-table="startup"></table>
    </section>
    <section id="routes">
      <div class="toolbar"><h2>Public Routes</h2><input data-filter="routes" placeholder="Filter routes"></div>
      <table data-table="routes"></table>
    </section>
    <section id="terminal">
      <div class="toolbar"><h2>Terminal Profiles</h2><input data-filter="terminal" placeholder="Filter terminal"></div>
      <table data-table="terminal"></table>
    </section>
    <section id="api-keys">
      <div class="toolbar"><h2>API Key Governance</h2><input data-filter="api-keys" placeholder="Filter API keys"></div>
      <table data-table="api-keys"></table>
    </section>
    <section id="agent-instructions">
      <div class="toolbar"><h2>Agent Instructions</h2><input data-filter="agent-instructions" placeholder="Filter agent instructions"></div>
      <div class="guidance" id="agent-storage-guidance"></div>
      <table data-table="agent-instructions"></table>
    </section>
    <section id="service-status">
      <div class="toolbar">
        <h2>Network Service Status</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
          <input data-filter="service-status" placeholder="Filter services">
        </div>
      </div>
      <div class="guidance">
        <div><strong>Restart policy:</strong> the Quick Test column runs safe health checks and reports Doctor/restart readiness. One-click restart stays disabled until each service has a reviewed restart command, backup/rollback expectation, and permission boundary.</div>
      </div>
      <table data-table="service-status"></table>
    </section>
  </div>
</main>
<script>
const state = ${stateJson};
const themeButton = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('devgov-theme');
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.dataset.theme = savedTheme;
}
syncThemeButton();
themeButton.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('devgov-theme', next);
  syncThemeButton();
});
const views = [...document.querySelectorAll('section')];
const buttons = [...document.querySelectorAll('nav button')];
buttons.forEach(button => button.addEventListener('click', () => {
  buttons.forEach(item => item.setAttribute('aria-selected', String(item === button)));
  views.forEach(view => view.classList.toggle('active', view.id === button.dataset.view));
}));
document.getElementById('metrics').innerHTML = [
  ['Ports', state.summary.ports],
  ['Agents', state.summary.localAgents],
  ['Startup', state.summary.startupEntries],
  ['Routes', state.summary.publicRoutes],
  ['Profiles', state.summary.terminalProfiles],
  ['API Keys', state.summary.apiKeys],
  ['Instructions', state.summary.agentInstructions]
].map(([label, value]) => '<div class="metric"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>').join('');
renderDashboardPort();
renderPorts('');
renderAgents('');
renderStartup('');
renderRoutes('');
renderTerminal('');
renderApiKeys('');
renderAgentInstructions('');
renderAgentStorageGuidance();
renderServiceStatusTable('', state.serviceTargets.map(target => ({ ...target, live: { state: 'CHECKING' }, quickTest: { ...target.quickTest, state: 'CHECKING' } })));
refreshServiceStatus();
document.querySelectorAll('input[data-filter]').forEach(input => {
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    if (input.dataset.filter === 'ports') renderPorts(value);
    if (input.dataset.filter === 'agents') renderAgents(value);
    if (input.dataset.filter === 'startup') renderStartup(value);
    if (input.dataset.filter === 'routes') renderRoutes(value);
    if (input.dataset.filter === 'terminal') renderTerminal(value);
    if (input.dataset.filter === 'api-keys') renderApiKeys(value);
    if (input.dataset.filter === 'agent-instructions') renderAgentInstructions(value);
    if (input.dataset.filter === 'service-status') renderServiceStatusTable(value, serviceStatusRows);
  });
});
function renderDashboardPort() {
  const entry = state.dashboardPort;
  document.getElementById('dashboard-port').innerHTML = entry
    ? '<tr><th>Dashboard</th><th>Socket</th><th>Policy</th><th>Notes</th></tr><tr><td>' + esc(entry.project) + '</td><td><code>' + esc(entry.host + ':' + entry.port) + '</code></td><td>' + pill(entry.visibility) + '</td><td>' + esc(entry.notes) + '</td></tr>'
    : '<tr><td>Dashboard port entry missing</td></tr>';
}
function renderPorts(query) {
  const rows = state.ports.filter(row => match(row, query));
  renderTable('ports', ['Project', 'Service', 'Socket', 'Visibility', 'Notes'], rows.map(row => [textCell(row.project), textCell(row.service), '<code>' + esc(row.host + ':' + row.port) + '</code>', pill(row.visibility), linkify(row.notes)]));
}
function renderAgents(query) {
  const rows = state.localAgents.filter(row => match(row, query));
  renderTable('agents', ['Agent', 'Kind', 'Health', 'Startup', 'Status'], rows.map(row => [textCell(row.displayName), textCell(row.kind), linkify(row.healthUrl), fileRef(row.startupRef), pill(row.status)]));
}
function renderStartup(query) {
  const rows = state.startupEntries.filter(row => match(row, query));
  renderTable('startup', ['ID', 'Trigger', 'Status', 'Script', 'Purpose'], rows.map(row => [textCell(row.id), textCell(row.trigger), pill(row.status), fileRef(row.scriptRef), linkify(row.purpose)]));
}
function renderRoutes(query) {
  const rows = state.publicRoutes.filter(row => match(row, query));
  renderTable('routes', ['Hostname', 'Health URL', 'Local Target', 'Exposure', 'Access', 'Status'], rows.map(row => [linkify('https://' + row.hostname), linkify(row.healthUrl), '<code>' + esc(row.localHost + ':' + row.localPort) + '</code>', textCell(row.exposureClass), row.accessRequired ? 'required' : 'not required', pill(row.status)]));
}
function renderTerminal(query) {
  const rows = state.terminalProfiles.filter(row => match(row, query));
  renderTable('terminal', ['ID', 'Name', 'Asset Policy', 'Status', 'Notes'], rows.map(row => [textCell(row.id), textCell(row.name), textCell(row.assetPolicy), pill(row.status), linkify(row.notes)]));
}
function renderApiKeys(query) {
  const rows = state.apiKeys.filter(row => match(row, query));
  renderTable('api-keys', ['Variable', 'Service', 'Storage', 'Settings', 'Status'], rows.map(row => [textCell(row.variableName), textCell(row.service), textCell(row.storageLocation), linkify(row.settingsUrl), pill(row.status)]));
}
function renderAgentInstructions(query) {
  const rows = state.agentInstructions.entries.filter(row => match(row, query));
  renderTable('agent-instructions', ['ID', 'Type', 'Layer', 'Requirement', 'Evidence', 'Status'], rows.map(row => [textCell(row.id), textCell(row.type), textCell(row.layer), linkify(row.requirement), fileRef(row.evidence), pill(row.status)]));
}
let serviceStatusRows = [];
function renderAgentStorageGuidance() {
  document.getElementById('agent-storage-guidance').innerHTML = [
    ['Runtime source', fileRef(state.agentInstructions.sourceOfTruth)],
    ['Canonical registry', fileRef('registry/agent-instructions.registry.json')],
    ['Generated local JSON', fileRef('reports/agent-instructions-index.json')],
    ['Generated text index', fileRef('reports/agent-instructions-index.txt')],
    ['UniText query endpoint', internalLink('/api/unitext-agent-instructions')]
  ].map(([label, value]) => '<div class="guidance-row"><strong>' + esc(label) + '</strong><span>' + value + '</span></div>').join('');
}
function renderServiceStatusTable(query, rows) {
  const filtered = rows.filter(row => match(row, query));
  renderTable('service-status', ['State', 'Service', 'Kind', 'Quick Test', 'URL', 'Target', 'Registry', 'Last Check'], filtered.map(row => [
    pill(row.live?.state || 'CHECKING'),
    textCell(row.label),
    textCell(row.kind),
    renderQuickTestCell(row),
    linkify(row.url),
    textCell(row.target),
    pill(row.registryStatus),
    row.live?.checkedAt ? textCell(row.live.checkedAt + (row.live.statusCode ? ' status=' + row.live.statusCode : '') + (row.live.error ? ' ' + row.live.error : '')) : textCell('pending')
  ]));
}
async function refreshServiceStatus() {
  try {
    const response = await fetch('/api/service-status');
    const payload = await response.json();
    serviceStatusRows = payload.services || [];
  } catch (error) {
    serviceStatusRows = state.serviceTargets.map(target => ({ ...target, live: { state: 'ERROR', error: error.message } }));
  } finally {
    renderServiceStatusTable(document.querySelector('input[data-filter="service-status"]').value.toLowerCase(), serviceStatusRows);
  }
}
function renderQuickTestCell(row) {
  return '<div class="control-stack">'
    + '<span>Health ' + pill(row.quickTest?.state || row.live?.state || 'CHECKING') + '</span>'
    + '<span>Doctor ' + pill(row.doctor?.state || 'MISSING') + refMeta(row.doctor?.ref) + '</span>'
    + '<span>Restart ' + pill(row.restart?.state || 'MISSING') + refMeta(row.restart?.ref) + '</span>'
    + '<span>Readiness ' + pill(row.controlReadiness || 'BLOCKED') + '</span>'
    + '</div>';
}
function refMeta(value) {
  return value ? '<span class="inline-meta">' + fileRef(value) + '</span>' : '';
}
function renderTable(name, headers, rows) {
  document.querySelector('[data-table="' + name + '"]').innerHTML = '<tr>' + headers.map(header => '<th>' + esc(header) + '</th>').join('') + '</tr>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('');
}
function pill(value) {
  return '<span class="pill ' + esc(String(value).toLowerCase()) + '">' + esc(value) + '</span>';
}
function match(row, query) {
  return !query || JSON.stringify(row).toLowerCase().includes(query);
}
function textCell(value) {
  return esc(value);
}
function linkify(value) {
  const escaped = esc(value);
  return escaped.replace(/(https?:\\/\\/[^\\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
}
function internalLink(value) {
  return '<a href="' + esc(value) + '" target="_blank" rel="noreferrer"><code>' + esc(value) + '</code></a>';
}
function fileRef(value) {
  const text = String(value ?? '');
  let pathPart = text.split('#')[0];
  if (pathPart.startsWith('devgov/')) pathPart = pathPart.slice('devgov/'.length);
  if (/^(?:AGENTS|README)\\.zh-tw\\.md$|^(?:AGENTS|README)\\.md$|^package\\.json$|^(?:registry|scripts|templates|docs|reports)\\/[A-Za-z0-9._\\/-]+\\.(?:md|json|txt|yml|yaml|mjs|ps1|html)$/.test(pathPart)) {
    return '<a href="/file?path=' + encodeURIComponent(pathPart) + '" target="_blank" rel="noreferrer"><code>' + esc(text) + '</code></a>';
  }
  return '<code>' + esc(text) + '</code>';
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}
function syncThemeButton() {
  const effective = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  themeButton.setAttribute('aria-pressed', String(effective === 'dark'));
  themeButton.textContent = effective === 'dark' ? 'Light mode' : 'Dark mode';
}
</script>
</body>
</html>`;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
}

function checkUrl(url, timeoutMs) {
  return new Promise((resolveStatus) => {
    let resolved = false;
    const started = Date.now();
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      response.on("end", () => {
        if (resolved) return;
        resolved = true;
        resolveStatus({
          state: response.statusCode >= 200 && response.statusCode < 400 ? "ONLINE" : "ERROR",
          statusCode: response.statusCode,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString()
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => {
      if (resolved) return;
      resolved = true;
      resolveStatus({
        state: error.message === "timeout" || ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(error.code) ? "OFFLINE" : "ERROR",
        error: error.message,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      });
    });
  });
}
