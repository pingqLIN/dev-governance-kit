import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function scanPublicRouteConfigs(inputPath = path.join(os.homedir(), ".cloudflared")) {
  const files = await resolveConfigFiles(inputPath);
  const routes = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    routes.push(...parseCloudflaredConfig(text, file));
  }
  markDuplicateHostnames(routes);
  return { generatedAt: new Date().toISOString(), filesScanned: files.length, routes };
}

export function parseCloudflaredConfig(text, source = "cloudflared.yml") {
  const lines = text.split(/\r?\n/);
  let tunnelId = "";
  let currentHostname = "";
  const routes = [];
  for (const line of lines) {
    const tunnelMatch = line.match(/^\s*tunnel:\s*(\S+)\s*$/);
    if (tunnelMatch) {
      tunnelId = tunnelMatch[1];
      continue;
    }
    const hostnameMatch = line.match(/^\s*-\s*hostname:\s*(\S+)\s*$/);
    if (hostnameMatch) {
      currentHostname = hostnameMatch[1];
      continue;
    }
    const serviceMatch = line.match(/^\s*service:\s*(\S+)\s*$/);
    if (!serviceMatch || !currentHostname) continue;
    const service = serviceMatch[1];
    if (service.startsWith("http_status:")) {
      currentHostname = "";
      continue;
    }
    const endpoint = parseLocalEndpoint(service);
    routes.push({
      source,
      tunnelId,
      hostname: currentHostname,
      service,
      localHost: endpoint.host,
      localPort: endpoint.port,
      protocol: endpoint.protocol,
      exposureClass: "candidate",
      accessRequired: true,
      risk: endpoint.host === "0.0.0.0" ? "public-bind-review" : "review"
    });
    currentHostname = "";
  }
  return routes;
}

export function renderPublicRoutesReport(scan) {
  const lines = [
    "# Public Route Audit",
    "",
    `Generated: ${scan.generatedAt}`,
    `Files scanned: ${scan.filesScanned}`,
    "",
    "| Hostname | Tunnel | Local Target | Protocol | Risk | Source |",
    "|---|---|---|---|---|---|"
  ];
  if (!scan.routes.length) {
    lines.push("| - | - | - | - | none | No Cloudflare routes found. |");
  }
  for (const route of scan.routes) {
    lines.push([
      route.hostname,
      route.tunnelId,
      `${route.localHost}:${route.localPort}`,
      route.protocol,
      route.risk,
      route.source
    ].map(escapeCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Registry Promotion Rules", "");
  lines.push("- Promote reviewed public routes into `registry/public-routes.registry.json`.");
  lines.push("- Keep credential files, certs, and machine-local config paths in reports only.");
  return lines.join("\n");
}

async function resolveConfigFiles(inputPath) {
  const stat = await fs.stat(inputPath).catch(() => null);
  if (!stat) return [];
  if (stat.isFile()) return [inputPath];
  const entries = await fs.readdir(inputPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name) && !/backup/i.test(entry.name))
    .map((entry) => path.join(inputPath, entry.name))
    .sort();
}

function parseLocalEndpoint(service) {
  try {
    const url = new URL(service);
    return { protocol: url.protocol.replace(":", ""), host: url.hostname, port: Number(url.port) };
  } catch {
    return { protocol: "tcp", host: "", port: null };
  }
}

function markDuplicateHostnames(routes) {
  const counts = new Map();
  for (const route of routes) {
    counts.set(route.hostname, (counts.get(route.hostname) ?? 0) + 1);
  }
  for (const route of routes) {
    if (counts.get(route.hostname) > 1) {
      route.risk = "duplicate-hostname-review";
    }
  }
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
