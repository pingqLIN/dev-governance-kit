import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { resolveControlTarget, SERVICE_CONTROL_HOST, SERVICE_CONTROL_PORT, SERVICE_CONTROL_URL } from "./service-control-resolver.mjs";

const EVENTS_RELATIVE_PATH = path.join("reports", "service-control-events.json");
const MAX_EVENTS = 200;

export { SERVICE_CONTROL_HOST, SERVICE_CONTROL_PORT, SERVICE_CONTROL_URL };

export async function loadServiceControlRegistry(root = ".") {
  const registry = JSON.parse(await fs.readFile(path.join(root, "registry", "service-control.registry.json"), "utf8"));
  return registry;
}

export async function loadApprovedServiceControls(root = ".") {
  const registry = await loadServiceControlRegistry(root);
  return registry.entries.filter((entry) => entry.status === "approved" && entry.approved);
}

export async function buildServiceControlMap(root = ".") {
  const controls = await loadApprovedServiceControls(root);
  const map = new Map();
  for (const control of controls) {
    map.set(`${control.controlTargetId}:${control.action}`, control);
  }
  return map;
}

export async function executeServiceControl(root, payload, requestMeta = {}) {
  const controlTargetId = String(payload?.controlTargetId ?? "").trim();
  const action = String(payload?.action ?? "").trim();
  if (!controlTargetId || !action) {
    throw new Error("controlTargetId and action are required");
  }

  const registry = await buildServiceControlMap(root);
  const entry = registry.get(`${controlTargetId}:${action}`);
  if (!entry) {
    throw new Error(`No approved service control action for ${controlTargetId}/${action}`);
  }
  if (action === "restart" && !isRestartPolicyReady(entry)) {
    throw new Error(`Restart action is not review-ready for ${controlTargetId}: permissionBoundary, backupExpectation, and rollbackExpectation must all be present.`);
  }

  const resolved = resolveControlTarget(root, entry);
  if (!resolved?.wrapperPath) {
    throw new Error(`No runtime authority resolver for ${controlTargetId}/${action}`);
  }

  const eventId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  try {
    const result = await runPowerShellWrapper(root, resolved.wrapperPath, [
      "-ControlTargetId", controlTargetId,
      "-Action", action
    ], entry.timeoutSeconds ?? 15);

    await appendServiceControlEvent(root, {
      id: eventId,
      receivedAt: new Date().toISOString(),
      controlTargetId,
      action,
      ok: result.ok,
      summary: result.summary,
      wrapperRef: entry.wrapperRef,
      runtimeKind: resolved.runtimeKind,
      requestOrigin: requestMeta.origin ?? "",
      clientIp: requestMeta.clientIp ?? "",
      status: result.ok ? "ok" : "error"
    });

    return {
      ok: result.ok,
      controlTargetId,
      action,
      summary: result.summary,
      wrapperRef: entry.wrapperRef,
      eventId
    };
  } catch (error) {
    const summary = String(error?.message ?? error);
    await appendServiceControlEvent(root, {
      id: eventId,
      receivedAt: new Date().toISOString(),
      controlTargetId,
      action,
      ok: false,
      summary,
      wrapperRef: entry.wrapperRef,
      runtimeKind: resolved.runtimeKind,
      requestOrigin: requestMeta.origin ?? "",
      clientIp: requestMeta.clientIp ?? "",
      status: "error"
    });
    throw error;
  }
}

function isRestartPolicyReady(controlEntry = {}) {
  const policy = controlEntry.restartPolicy ?? {};
  return [
    policy.permissionBoundary,
    policy.backupExpectation,
    policy.rollbackExpectation
  ].every((value) => typeof value === "string" && value.trim().length > 0);
}

export async function readServiceControlEvents(root = ".") {
  const raw = await fs.readFile(path.join(root, EVENTS_RELATIVE_PATH), "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

async function appendServiceControlEvent(root, event) {
  const current = await readServiceControlEvents(root);
  const next = [event, ...current].slice(0, MAX_EVENTS);
  await fs.mkdir(path.join(root, "reports"), { recursive: true });
  await fs.writeFile(
    path.join(root, EVENTS_RELATIVE_PATH),
    `${JSON.stringify({ schema: "devgov.service-control-events.v1", generatedAt: new Date().toISOString(), events: next }, null, 2)}\n`,
    "utf8"
  );
}

function runPowerShellWrapper(root, wrapperPath, args, timeoutSeconds) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", wrapperPath,
      ...args
    ], {
      cwd: root,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Service control wrapper timed out after ${timeoutSeconds}s`));
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(stdout.trim());
        if (code !== 0) {
          reject(new Error(String(parsed.summary ?? parsed.message ?? stderr.trim() ?? stdout.trim() ?? `Wrapper exited with code ${code}`)));
          return;
        }
        resolve({
          ok: Boolean(parsed.ok),
          summary: String(parsed.summary ?? parsed.message ?? "Completed")
        });
      } catch {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `Wrapper exited with code ${code}`));
          return;
        }
        resolve({
          ok: true,
          summary: stdout.trim() || "Completed"
        });
      }
    });
  });
}
