import fs from "node:fs/promises";
import path from "node:path";

export const DASHBOARD_HOST = "127.0.0.1";
export const DASHBOARD_PORT = 3101;
export const DASHBOARD_URL = `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`;

export async function loadDashboardState(root = ".") {
  const [pkg, ports, startup, publicRoutes, terminalProfiles, localAgents, apiKeys] = await Promise.all([
    readJson(path.join(root, "package.json")),
    readJson(path.join(root, "registry", "ports.registry.json")),
    readJson(path.join(root, "registry", "startup.registry.json")),
    readJson(path.join(root, "registry", "public-routes.registry.json")),
    readJson(path.join(root, "registry", "terminal-profiles.registry.json")),
    readJson(path.join(root, "registry", "local-agents.registry.json")),
    readJson(path.join(root, "registry", "api-keys.registry.json"))
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
      apiKeys: apiKeys.entries.length
    },
    ports: ports.entries,
    startupEntries: startup.entries,
    publicRoutes: publicRoutes.routes,
    terminalProfiles: terminalProfiles.profiles,
    localAgents: localAgents.agents,
    apiKeys: apiKeys.entries
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
      --ink: #15171a;
      --muted: #66717f;
      --line: #cbd5df;
      --paper: #f7f5ef;
      --panel: #fffdfa;
      --accent: #0f766e;
      --blue: #285bb8;
      --warn: #b7791f;
      --bad: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(90deg, rgba(21,23,26,.04) 1px, transparent 1px),
        linear-gradient(0deg, rgba(21,23,26,.04) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font-family: "Aptos", "Segoe UI", system-ui, sans-serif;
    }
    header {
      border-bottom: 2px solid var(--ink);
      background: rgba(255,253,250,.92);
      padding: 18px clamp(16px, 3vw, 34px);
      position: sticky;
      top: 0;
      z-index: 2;
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
    .status {
      align-items: center;
      display: flex;
      gap: 8px;
      font-size: 14px;
      justify-content: end;
      min-width: 180px;
    }
    .dot {
      background: var(--accent);
      border: 2px solid var(--ink);
      border-radius: 999px;
      height: 14px;
      width: 14px;
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
      color: white;
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
      grid-template-columns: repeat(6, minmax(120px, 1fr));
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
      background: white;
      color: var(--ink);
      font: inherit;
      max-width: 420px;
      min-height: 42px;
      padding: 8px 10px;
      width: 100%;
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
      background: #e7ece8;
      font-size: 12px;
      text-transform: uppercase;
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
      padding: 2px 7px;
    }
    .local { background: #d8f3ec; }
    .public, .candidate { background: #fff0c2; }
    .blocked { background: #ffd7d2; }
    .approved { background: #d8f3ec; }
    @media (max-width: 820px) {
      .mast, main { grid-template-columns: 1fr; }
      nav { position: static; }
      .strip { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .status { justify-content: start; }
      table { font-size: 14px; }
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
    <div class="status"><span class="dot"></span><span>${escapeHtml(state.app.url)}</span></div>
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
  </div>
</main>
<script>
const state = ${stateJson};
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
  ['API Keys', state.summary.apiKeys]
].map(([label, value]) => '<div class="metric"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>').join('');
renderDashboardPort();
renderPorts('');
renderAgents('');
renderStartup('');
renderRoutes('');
renderTerminal('');
renderApiKeys('');
document.querySelectorAll('input[data-filter]').forEach(input => {
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    if (input.dataset.filter === 'ports') renderPorts(value);
    if (input.dataset.filter === 'agents') renderAgents(value);
    if (input.dataset.filter === 'startup') renderStartup(value);
    if (input.dataset.filter === 'routes') renderRoutes(value);
    if (input.dataset.filter === 'terminal') renderTerminal(value);
    if (input.dataset.filter === 'api-keys') renderApiKeys(value);
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
  renderTable('ports', ['Project', 'Service', 'Socket', 'Visibility', 'Notes'], rows.map(row => [row.project, row.service, '<code>' + esc(row.host + ':' + row.port) + '</code>', pill(row.visibility), row.notes]));
}
function renderAgents(query) {
  const rows = state.localAgents.filter(row => match(row, query));
  renderTable('agents', ['Agent', 'Kind', 'Health', 'Startup', 'Status'], rows.map(row => [row.displayName, row.kind, '<code>' + esc(row.healthUrl) + '</code>', '<code>' + esc(row.startupRef) + '</code>', pill(row.status)]));
}
function renderStartup(query) {
  const rows = state.startupEntries.filter(row => match(row, query));
  renderTable('startup', ['ID', 'Trigger', 'Status', 'Script', 'Purpose'], rows.map(row => [row.id, row.trigger, pill(row.status), '<code>' + esc(row.scriptRef) + '</code>', row.purpose]));
}
function renderRoutes(query) {
  const rows = state.publicRoutes.filter(row => match(row, query));
  renderTable('routes', ['Hostname', 'Local Target', 'Exposure', 'Access', 'Status'], rows.map(row => [row.hostname, '<code>' + esc(row.localHost + ':' + row.localPort) + '</code>', row.exposureClass, row.accessRequired ? 'required' : 'not required', pill(row.status)]));
}
function renderTerminal(query) {
  const rows = state.terminalProfiles.filter(row => match(row, query));
  renderTable('terminal', ['ID', 'Name', 'Asset Policy', 'Status', 'Notes'], rows.map(row => [row.id, row.name, row.assetPolicy, pill(row.status), row.notes]));
}
function renderApiKeys(query) {
  const rows = state.apiKeys.filter(row => match(row, query));
  renderTable('api-keys', ['Variable', 'Service', 'Storage', 'Settings', 'Status'], rows.map(row => [row.variableName, row.service, row.storageLocation, '<code>' + esc(row.settingsUrl) + '</code>', pill(row.status)]));
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
function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
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
