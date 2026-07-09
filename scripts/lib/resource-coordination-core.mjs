import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateResourceCoordinationRegistry } from "./governance-registry-core.mjs";

const DEVELOPMENT_PROCESS_HINTS = new Set([
  "node",
  "npm",
  "python",
  "python3",
  "powershell",
  "pwsh",
  "git",
  "cloudflared",
  "lms",
  "ollama",
  "chrome",
  "msedge",
  "code",
  "codex"
]);

export async function loadResourceCoordinationRegistry(root = ".") {
  const registry = await readJson(path.join(root, "registry", "resource-coordination.registry.json"));
  const errors = validateResourceCoordinationRegistry(registry);
  return { registry, errors };
}

export async function buildResourceCoordinationSnapshot(root = ".", options = {}) {
  const { registry, errors } = await loadResourceCoordinationRegistry(root);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const host = options.hostSnapshot ?? await collectHostResourceSnapshot({
    sampleMs: options.sampleMs ?? 100,
    includeProcessFamilies: options.includeProcessFamilies ?? false
  });
  const governance = options.governanceSnapshot ?? await collectGovernanceSnapshot(root);
  const pressure = classifyResourcePressure(host);
  const expiresAt = computeExpiry(generatedAt, registry.freshness?.snapshotMaxAgeSeconds ?? 300);

  return {
    schema: "devgov.resource-coordination.snapshot.v1",
    generatedAt,
    expiresAt,
    staleAfterSeconds: registry.freshness?.snapshotMaxAgeSeconds ?? 300,
    ok: errors.length === 0,
    registryErrors: errors,
    platform: registry.platform,
    freshness: registry.freshness,
    coordinationState: pressure.state,
    diagnosticDisposition: pressure.disposition,
    confidence: pressure.confidence,
    reasons: pressure.reasons,
    host,
    governance,
    exclusiveResources: registry.exclusiveResources,
    channels: registry.channels,
    policies: registry.policies,
    recommendations: buildRecommendations(pressure)
  };
}

export function classifyResourcePressure(host) {
  const cpu = Number(host.cpuPercent);
  const memory = Number(host.memoryUsedPercent);
  const processCount = Number(host.developmentProcessCount ?? 0);
  const reasons = [];

  if (Number.isFinite(cpu)) {
    if (cpu >= 90) reasons.push(`CPU pressure is high at ${formatPercent(cpu)}.`);
    else if (cpu >= 75) reasons.push(`CPU pressure is elevated at ${formatPercent(cpu)}.`);
  }
  if (Number.isFinite(memory)) {
    if (memory >= 92) reasons.push(`Memory pressure is high at ${formatPercent(memory)}.`);
    else if (memory >= 85) reasons.push(`Memory pressure is elevated at ${formatPercent(memory)}.`);
  }
  if (processCount >= 60) {
    reasons.push(`Many development-related process instances are active (${processCount}).`);
  }

  const congested = cpu >= 90 || memory >= 92;
  const busy = congested || cpu >= 75 || memory >= 85 || processCount >= 60;
  if (congested) {
    return {
      state: "CONGESTED",
      disposition: "environment-contention-possible",
      confidence: "medium",
      reasons
    };
  }
  if (busy) {
    return {
      state: "BUSY",
      disposition: "environment-contention-possible",
      confidence: "low",
      reasons
    };
  }
  return {
    state: "NOMINAL",
    disposition: "target-evidence-required",
    confidence: "low",
    reasons: reasons.length ? reasons : ["No high shared host pressure was detected in the lightweight snapshot."]
  };
}

export async function collectHostResourceSnapshot(options = {}) {
  const sampleMs = options.sampleMs ?? 100;
  const before = cpuSample();
  await sleep(sampleMs);
  const after = cpuSample();
  const cpuPercent = calculateCpuPercent(before, after);
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const memoryUsedPercent = totalMemoryBytes > 0
    ? ((totalMemoryBytes - freeMemoryBytes) / totalMemoryBytes) * 100
    : null;
  const processFamilies = options.includeProcessFamilies
    ? await collectDevelopmentProcessFamilies().catch(() => [])
    : [];
  const developmentProcessCount = processFamilies.reduce((sum, entry) => sum + entry.count, 0);

  return {
    sampledAt: new Date().toISOString(),
    sampleMs,
    cpuPercent,
    memoryUsedPercent,
    totalMemoryBytes,
    freeMemoryBytes,
    processFamilies,
    developmentProcessCount,
    notes: options.includeProcessFamilies
      ? "Process-family counts include names only; command lines, process IDs, usernames, paths, and environment values are intentionally omitted."
      : "Lightweight default snapshot omits process-family collection. Use --include-processes only when extra context is needed."
  };
}

export function renderResourceCoordinationSnapshot(snapshot) {
  const lines = [
    "# Resource Coordination Snapshot",
    "",
    `Generated: ${snapshot.generatedAt}`,
    `Expires: ${snapshot.expiresAt}`,
    "",
    "## Summary",
    "",
    `- State: ${snapshot.coordinationState}`,
    `- Diagnostic disposition: ${snapshot.diagnosticDisposition}`,
    `- Confidence: ${snapshot.confidence}`,
    `- Registry valid: ${snapshot.ok ? "yes" : "no"}`,
    "",
    "## Host Pressure",
    "",
    `- CPU: ${formatPercent(snapshot.host.cpuPercent)}`,
    `- Memory used: ${formatPercent(snapshot.host.memoryUsedPercent)}`,
    `- Sample window: ${snapshot.host.sampleMs}ms`,
    `- Development process instances: ${snapshot.host.developmentProcessCount}`,
    `- Notes: ${snapshot.host.notes}`,
    "",
    "## Reasons",
    ""
  ];

  for (const reason of snapshot.reasons) {
    lines.push(`- ${reason}`);
  }

  lines.push("", "## Coordination Rules", "");
  for (const recommendation of snapshot.recommendations) {
    lines.push(`- ${recommendation}`);
  }

  lines.push("", "## Exclusive Resources", "");
  for (const resource of snapshot.exclusiveResources) {
    lines.push(`- ${resource.id}: ${resource.exclusivity}; register through ${resource.registrationSurface}.`);
  }

  return `${lines.join("\n")}\n`;
}

async function collectGovernanceSnapshot(root) {
  const [ports, onboarding, localAgents, serviceControl] = await Promise.all([
    readJson(path.join(root, "registry", "ports.registry.json")),
    readJson(path.join(root, "registry", "service-onboarding.registry.json")),
    readJson(path.join(root, "registry", "local-agents.registry.json")),
    readJson(path.join(root, "registry", "service-control.registry.json"))
  ]);
  return {
    registeredPorts: ports.entries.length,
    onboardingEntries: onboarding.entries.length,
    localAgents: localAgents.agents.length,
    approvedControlActions: serviceControl.entries.filter((entry) => entry.approved === true).length,
    notes: "Governance counts are read from existing DevGov registries and do not imply that every runtime is currently online."
  };
}

async function collectDevelopmentProcessFamilies() {
  if (process.platform !== "win32") return [];
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Get-Process | Group-Object -Property ProcessName | ForEach-Object {",
    "  [pscustomobject]@{ name = $_.Name; count = $_.Count }",
    "} | ConvertTo-Json -Compress"
  ].join("; ");
  const output = await runProcess("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], 2500);
  const parsed = JSON.parse(output || "[]");
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      name: String(row.name ?? "").toLowerCase(),
      count: Number(row.count ?? 0)
    }))
    .filter((row) => DEVELOPMENT_PROCESS_HINTS.has(row.name) && row.count > 0)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      rejectRun(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun(stdout.trim());
      else rejectRun(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function cpuSample() {
  return os.cpus().reduce((sum, cpu) => {
    const values = Object.values(cpu.times);
    const total = values.reduce((left, right) => left + right, 0);
    return {
      idle: sum.idle + cpu.times.idle,
      total: sum.total + total
    };
  }, { idle: 0, total: 0 });
}

function calculateCpuPercent(before, after) {
  const total = after.total - before.total;
  const idle = after.idle - before.idle;
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, (1 - idle / total) * 100));
}

function buildRecommendations(pressure) {
  const base = [
    "Do not classify lag as target instability without target-local failure evidence.",
    "Check whether exclusive resources such as browser profiles, GPU rendering, or foreground screen control have active fresh claims before starting conflicting work.",
    "Treat stale coordination status as historical evidence and refresh before making current scheduling or remediation decisions."
  ];
  if (pressure.disposition === "environment-contention-possible") {
    return [
      "Prefer environment-contention or unknown-degraded classification until target health evidence proves a project-local failure.",
      ...base
    ];
  }
  return base;
}

function computeExpiry(generatedAt, maxAgeSeconds) {
  const time = new Date(generatedAt).getTime();
  if (Number.isNaN(time)) return "";
  return new Date(time + maxAgeSeconds * 1000).toISOString();
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return "unknown";
  return `${Number(value).toFixed(1)}%`;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
