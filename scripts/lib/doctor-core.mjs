import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { buildDocsIndex, renderSearchHtml } from "./docs-index-core.mjs";
import { validateGovernanceRegistry } from "./governance-registry-core.mjs";
import { writeReport } from "./report-output.mjs";
import { DASHBOARD_HOST, DASHBOARD_PORT } from "./dashboard-core.mjs";
import { SERVICE_CONTROL_HOST, SERVICE_CONTROL_PORT } from "./service-control-resolver.mjs";

export async function runDoctorChecks(root = ".", options = {}) {
  const checks = [];
  const add = (id, ok, detail, repair = undefined) => checks.push({ id, ok, detail, repair });

  const pkg = await readJson(path.join(root, "package.json"));
  add("package-name", pkg.name === "devgov", `package name is ${pkg.name}`);

  const registryFiles = [
    "ports.registry.json",
    "local-agents.registry.json",
    "api-keys.registry.json",
    "agent-instructions.registry.json",
    "service-onboarding.registry.json",
    "service-control.registry.json",
    "local-cloudflare.registry.json",
    "startup.registry.json",
    "public-routes.registry.json",
    "terminal-profiles.registry.json"
  ];

  for (const file of registryFiles) {
    const registry = await readJson(path.join(root, "registry", file));
    const errors = validateGovernanceRegistry(registry);
    add(`registry-${file}`, errors.length === 0, errors.length ? errors.join("; ") : "valid");
  }

  const ports = await readJson(path.join(root, "registry", "ports.registry.json"));
  const dashboardPort = ports.entries.find((entry) => entry.project === "devgov" && entry.service === "dashboard-http");
  add(
    "dashboard-port-registry",
    Boolean(dashboardPort && dashboardPort.host === DASHBOARD_HOST && dashboardPort.port === DASHBOARD_PORT),
    dashboardPort ? `${dashboardPort.host}:${dashboardPort.port}` : "missing"
  );

  const startup = await readJson(path.join(root, "registry", "startup.registry.json"));
  const startupIds = new Set(startup.entries.map((entry) => entry.id));
  add(
    "dashboard-startup-registry",
    startupIds.has("devgov-dashboard-login")
      && startupIds.has("devgov-dashboard-on-demand")
      && startupIds.has("devgov-gov-public-route-login"),
    [...startupIds].filter((id) => id.startsWith("devgov-")).join(", ") || "missing"
  );

  const localAgents = await readJson(path.join(root, "registry", "local-agents.registry.json"));
  const localArchiveAgent = localAgents.agents.find((agent) => agent.id === "local-archive-maintainer");
  add(
    "local-agent-registry",
    Boolean(localArchiveAgent),
    localArchiveAgent ? `${localArchiveAgent.displayName} (${localArchiveAgent.kind})` : "missing local-archive-maintainer"
  );

  const apiKeys = await readJson(path.join(root, "registry", "api-keys.registry.json"));
  add(
    "api-key-registry",
    Array.isArray(apiKeys.entries),
    `${apiKeys.entries.length} credential-location records`
  );

  const serviceControlPort = ports.entries.find((entry) => entry.project === "devgov" && entry.service === "service-control-http");
  add(
    "service-control-port-registry",
    Boolean(serviceControlPort && serviceControlPort.host === SERVICE_CONTROL_HOST && serviceControlPort.port === SERVICE_CONTROL_PORT),
    serviceControlPort ? `${serviceControlPort.host}:${serviceControlPort.port}` : "missing"
  );

  for (const scriptPath of ["scripts/serve-dashboard.mjs", "scripts/open-dashboard.mjs", "scripts/start-dashboard.ps1", "scripts/register-dashboard-startup.ps1", "scripts/register-dashboard-protocol.ps1", "scripts/start-gov-public-route.ps1", "scripts/register-gov-public-route-startup.ps1", "scripts/require-governed-port.mjs", "scripts/scan-api-keys.mjs", "scripts/scan-agent-instructions.mjs", "scripts/scan-context-budget.mjs", "scripts/Invoke-AntivirusTriage.ps1", "scripts/Invoke-CodexAntivirusHook.ps1", "scripts/service-control/restart-devgov-dashboard.ps1", "scripts/service-control/doctor-tunnel-client-local-filesystem-mcp.ps1", "scripts/service-control/restart-tunnel-client-local-filesystem-mcp.ps1", "scripts/service-control/doctor-local-archive-maintainer.ps1", "scripts/service-control/restart-local-archive-maintainer.ps1", "scripts/service-control/doctor-ps3eye-windows-virtual-camera.ps1", "scripts/service-control/restart-ps3eye-windows-virtual-camera.ps1", "scripts/service-control/doctor-taste.ps1", "scripts/service-control/restart-taste.ps1", "scripts/service-control/doctor-codex-calendar-todo-staging.ps1", "scripts/service-control/restart-codex-calendar-todo-staging.ps1", "scripts/service-control/doctor-sbs.ps1", "scripts/service-control/restart-sbs.ps1", "scripts/service-control/doctor-color-management-shader.ps1", "scripts/service-control/restart-color-management-shader.ps1", "scripts/lib/service-control-core.mjs", "scripts/lib/service-control-resolver.mjs"]) {
    add(`script-${scriptPath}`, await fileExists(path.join(root, scriptPath)), scriptPath);
  }

  const health = await checkDashboardHealth();
  const portFree = health.ok ? true : await canBindDashboardPort();
  add(
    "dashboard-port-runtime",
    portFree,
    health.ok ? "dashboard is already healthy" : "port is available for dashboard startup"
  );

  const docsIndex = await buildDocsIndex(root);
  add("docs-index-build", docsIndex.documents.length > 0, `${docsIndex.documents.length} documents indexable`);

  const repairs = [];
  if (options.repair) {
    await writeReport("reports/search-index.json", `${JSON.stringify(docsIndex, null, 2)}\n`);
    await writeReport("reports/search.html", renderSearchHtml(docsIndex));
    repairs.push("Regenerated reports/search-index.json and reports/search.html");
  }

  return {
    ok: checks.every((check) => check.ok),
    generatedAt: new Date().toISOString(),
    checks,
    repairs
  };
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function fileExists(filePath) {
  return fs.access(filePath).then(() => true, () => false);
}

function checkDashboardHealth() {
  return new Promise((resolveHealth) => {
    const request = http.get({
      host: DASHBOARD_HOST,
      port: DASHBOARD_PORT,
      path: "/health",
      timeout: 500
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        resolveHealth({ ok: response.statusCode === 200 && body.includes("\"project\": \"devgov\"") });
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolveHealth({ ok: false }));
  });
}

function canBindDashboardPort() {
  return new Promise((resolveBind) => {
    const server = net.createServer();
    server.once("error", () => resolveBind(false));
    server.once("listening", () => server.close(() => resolveBind(true)));
    server.listen(DASHBOARD_PORT, DASHBOARD_HOST);
  });
}
