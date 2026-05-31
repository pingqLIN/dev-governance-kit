#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUniTextAgentInstructionIndex, checkServiceStatuses, DASHBOARD_HOST, DASHBOARD_PORT, loadDashboardState, renderDashboardHtml } from "./lib/dashboard-core.mjs";
import { runDoctorChecks } from "./lib/doctor-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const host = args.host ?? DASHBOARD_HOST;
const port = Number(args.port ?? DASHBOARD_PORT);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (url.pathname === "/health") {
      sendJson(response, { ok: true, project: "devgov", service: "dashboard-http", port });
      return;
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204, { "cache-control": "max-age=86400" });
      response.end();
      return;
    }
    if (url.pathname === "/api/state") {
      sendJson(response, await loadDashboardState(root));
      return;
    }
    if (url.pathname === "/api/local-agents") {
      const state = await loadDashboardState(root);
      sendJson(response, { agents: state.localAgents });
      return;
    }
    if (url.pathname === "/api/agent-instructions") {
      const state = await loadDashboardState(root);
      sendJson(response, state.agentInstructions);
      return;
    }
    if (url.pathname === "/api/unitext-agent-instructions") {
      const state = await loadDashboardState(root);
      sendJson(response, buildUniTextAgentInstructionIndex(state.agentInstructions));
      return;
    }
    if (url.pathname === "/api/service-status") {
      sendJson(response, await checkServiceStatuses(root));
      return;
    }
    if (url.pathname === "/api/doctor") {
      const doctor = await runDoctorChecks(root, { repair: false });
      sendJson(response, doctor);
      return;
    }
    if (url.pathname === "/file") {
      await sendRepoFile(response, url);
      return;
    }
    if (url.pathname === "/") {
      const state = await loadDashboardState(root);
      sendHtml(response, renderDashboardHtml(state));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`DevGov dashboard port ${host}:${port} is already in use. Stop the owning process or choose a reviewed registry change.`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`DevGov dashboard listening at http://${host}:${port}`);
});

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--host") parsed.host = argv[++index];
    if (value === "--port") parsed.port = argv[++index];
  }
  return parsed;
}

function sendJson(response, value) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function sendHtml(response, value) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(value);
}

async function sendRepoFile(response, url) {
  const requestedPath = url.searchParams.get("path") ?? "";
  const normalized = requestedPath.replace(/\\/g, "/");
  if (!isAllowedRepoFile(normalized)) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Unsupported file path\n");
    return;
  }

  const resolved = path.resolve(root, normalized);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Refusing to serve files outside repository\n");
    return;
  }

  const text = await fs.readFile(resolved, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (text === null) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("File not found\n");
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypeFor(normalized),
    "cache-control": "no-store"
  });
  response.end(text);
}

function isAllowedRepoFile(normalized) {
  if (!normalized || normalized.includes("..") || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) {
    return false;
  }
  return /^(?:AGENTS|README)\.zh-tw\.md$/.test(normalized)
    || /^(?:AGENTS|README)\.md$/.test(normalized)
    || /^package\.json$/.test(normalized)
    || /^(?:registry|scripts|templates|docs|reports)\/[A-Za-z0-9._/-]+\.(?:md|json|txt|yml|yaml|mjs|ps1|html)$/.test(normalized);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}
