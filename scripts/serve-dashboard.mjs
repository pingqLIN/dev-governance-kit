#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUniTextAgentInstructionIndex, checkServiceStatuses, DASHBOARD_HOST, DASHBOARD_PORT, loadDashboardState, renderDashboardHtml } from "./lib/dashboard-core.mjs";
import { runDoctorChecks } from "./lib/doctor-core.mjs";
import { loadServiceOnboardingAudit } from "./lib/service-onboarding-core.mjs";
import { executeServiceControl, SERVICE_CONTROL_HOST, SERVICE_CONTROL_PORT } from "./lib/service-control-core.mjs";
import { isAllowedControlOrigin } from "./lib/service-control-resolver.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const host = args.host ?? DASHBOARD_HOST;
const port = Number(args.port ?? DASHBOARD_PORT);
const WEB_CONSOLE_EVENTS_PATH = resolve(root, "reports", "web-console-events.json");
const MAX_WEB_EVENTS = 240;

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
    if (url.pathname === "/api/web-console-events") {
      if (request.method === "GET") {
        const payload = await loadWebConsoleEvents(root);
        sendJson(response, payload);
        return;
      }
      if (request.method === "POST") {
        try {
          const event = await parseEventPayload(request);
          await appendWebConsoleEvent(root, event, request.socket.remoteAddress ?? "unknown");
          sendJson(response, { ok: true, receivedAt: event.receivedAt, id: event.id });
          return;
        } catch (error) {
          response.writeHead(400, {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "no-store"
          });
          response.end(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
          return;
        }
      }
      response.writeHead(405, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
        allow: "GET, POST"
      });
      response.end(`${JSON.stringify({ ok: false, error: "Method not allowed" }, null, 2)}\n`);
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
    if (url.pathname === "/api/service-onboarding") {
      sendJson(response, await loadServiceOnboardingAudit(root));
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

const controlServer = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${SERVICE_CONTROL_HOST}:${SERVICE_CONTROL_PORT}`);
    const origin = String(request.headers.origin ?? "");
    if (request.method === "OPTIONS") {
      if (!isAllowedControlOrigin(origin)) {
        response.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(`${JSON.stringify({ ok: false, error: "Origin not allowed" }, null, 2)}\n`);
        return;
      }
      sendJson(response, { ok: true }, { origin, methods: "POST, OPTIONS" });
      return;
    }
    if (url.pathname === "/health") {
      sendJson(response, { ok: true, project: "devgov", service: "service-control-http", port: SERVICE_CONTROL_PORT }, { origin });
      return;
    }
    const controlActionMatch = /^\/api\/service-control\/([a-z-]+)$/.exec(url.pathname);
    if (request.method === "POST" && controlActionMatch) {
      if (!isAllowedControlOrigin(origin)) {
        response.writeHead(403, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "null"
        });
        response.end(`${JSON.stringify({ ok: false, error: "Origin not allowed" }, null, 2)}\n`);
        return;
      }
      const payload = {
        ...(await readJsonFromRequest(request)),
        action: controlActionMatch[1]
      };
      const result = await executeServiceControl(root, payload, {
        origin,
        clientIp: request.socket.remoteAddress ?? "unknown"
      });
      sendJson(response, result, { origin, methods: "POST, OPTIONS" });
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(`${JSON.stringify({ ok: false, error: "Not found" }, null, 2)}\n`);
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
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
controlServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`DevGov service-control port ${SERVICE_CONTROL_HOST}:${SERVICE_CONTROL_PORT} is already in use. Stop the owning process or choose a reviewed registry change.`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`DevGov dashboard listening at http://${host}:${port}`);
});
controlServer.listen(SERVICE_CONTROL_PORT, SERVICE_CONTROL_HOST, () => {
  console.log(`DevGov service control listening at http://${SERVICE_CONTROL_HOST}:${SERVICE_CONTROL_PORT}`);
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

function sendJson(response, value, options = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };
  if (options.origin) {
    headers["access-control-allow-origin"] = options.origin;
    headers["vary"] = "Origin";
  } else {
    headers["access-control-allow-origin"] = "*";
  }
  if (options.methods) {
    headers["access-control-allow-methods"] = options.methods;
    headers["access-control-allow-headers"] = "content-type";
  }
  response.writeHead(200, headers);
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function sendHtml(response, value) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(value);
}

async function loadWebConsoleEvents(rootPath) {
  const raw = await readWebConsoleEvents(rootPath);
  const events = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : [];
  return {
    schema: "devgov.dashboard-web-console-events.v1",
    generatedAt: new Date().toISOString(),
    events: events.slice(0, MAX_WEB_EVENTS),
    limit: MAX_WEB_EVENTS
  };
}

async function appendWebConsoleEvent(rootPath, payload, clientIp) {
  const sanitized = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    receivedAt: payload.receivedAt,
    eventType: normalizeText(payload.eventType),
    project: normalizeText(payload.project),
    source: normalizeText(payload.source),
    path: normalizeText(payload.path, 240),
    action: normalizeText(payload.action),
    details: normalizeText(payload.details),
    metadata: payload.metadata,
    clientIp,
    userAgent: normalizeText(payload.userAgent)
  };
  const current = await loadWebConsoleEvents(rootPath);
  const next = [sanitized, ...current.events].slice(0, MAX_WEB_EVENTS);
  await fs.mkdir(resolve(rootPath, "reports"), { recursive: true });
  await fs.writeFile(
    WEB_CONSOLE_EVENTS_PATH,
    `${JSON.stringify({ schema: "devgov.dashboard-web-console-events.v1", generatedAt: new Date().toISOString(), events: next }, null, 2)}\n`,
    "utf8"
  );
}

function normalizeText(value, maxLength = 260) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function sanitizePayload(payload = {}, ua = "") {
  return {
    eventType: payload.eventType ?? payload.type ?? "web_console_event",
    project: payload.project ?? payload.app ?? "unknown",
    source: payload.source ?? payload.origin ?? "web_console",
    path: payload.path ?? payload.url ?? payload.pathname ?? payload.endpoint ?? "",
    action: payload.action ?? payload.name ?? payload.event ?? "",
    details: payload.details ?? payload.message ?? payload.data ?? "",
    metadata: payload.metadata ?? null,
    userAgent: ua,
    receivedAt: normalizeIsoTimestamp(payload.timestamp) ?? new Date().toISOString()
  };
}

async function parseEventPayload(request) {
  const body = await readJsonFromRequest(request);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invalid event payload");
  }
  const ua = request.headers["user-agent"] || "";
  return sanitizePayload(body, ua);
}

async function readWebConsoleEvents(rootPath) {
  const raw = await fs.readFile(WEB_CONSOLE_EVENTS_PATH, "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return value?.events ?? value;
  } catch {
    return [];
  }
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== "string") return null;
  const maybeDate = new Date(value);
  if (Number.isNaN(maybeDate.getTime())) return null;
  return maybeDate.toISOString();
}

function readJsonFromRequest(request) {
  return new Promise((resolve, reject) => {
    let content = "";
    request.on("data", (chunk) => {
      content += chunk;
    });
    request.on("end", () => {
      if (!content.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(content));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
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
