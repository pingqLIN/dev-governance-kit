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

const RESOURCE_MEMORY_HINT_CLASSES = new Set([
  "browser-profile",
  "gpu-rendering",
  "foreground-control",
  "local-model",
  "devtools"
]);
const RESOURCE_MEMORY_HINT_CONFIDENCE = new Set(["observed", "declared", "inferred"]);
const RESOURCE_MEMORY_HINT_SOURCE = new Set(["codex-task", "devgov-scan", "dashboard-event"]);

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

export function buildResourceCoordinationMemoryHintProposal(options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const observedAt = options.observedAt ?? generatedAt;
  const validForSeconds = normalizePositiveInteger(options.validForSeconds, 1800);
  const resourceClass = requireAllowed(
    options.resourceClass ?? "browser-profile",
    RESOURCE_MEMORY_HINT_CLASSES,
    "resourceClass"
  );
  const confidence = requireAllowed(
    options.confidence ?? "declared",
    RESOURCE_MEMORY_HINT_CONFIDENCE,
    "confidence"
  );
  const source = requireAllowed(
    options.source ?? "devgov-scan",
    RESOURCE_MEMORY_HINT_SOURCE,
    "source"
  );
  const hint = {
    kind: "rcg-short-term-resource-hint",
    project: safeHintText(options.project, "stable-project-id", "project"),
    resourceClass,
    intent: safeHintText(options.intent, "Short sanitized description of intended resource use.", "intent"),
    observedAt,
    validUntil: options.validUntil ?? computeExpiry(observedAt, validForSeconds),
    confidence,
    source,
    authority: "soft-hint-only",
    afterExpiry: "historical-only"
  };

  return {
    schema: "devgov.resource-coordination.memory-hint-proposal.v1",
    generatedAt,
    mode: "proposal-only",
    status: "review-required",
    template: "templates/CODEX.memory.rcg-hint.md",
    reviewGateTemplate: "templates/CODEX.memory.rcg-update-gate.md",
    proposalNames: ["CODEX.memory.rcg-hint", "rcg-memory-hint"],
    writeTarget: "No automatic Codex memory write; use only after the operator explicitly asks to update memory.",
    reviewGate: buildMemoryHintReviewGate(),
    constraints: [
      "Soft awareness only; not an authoritative current-state ledger.",
      "Not a resource lock, transaction store, scheduling queue, or task-dispatch gate.",
      "Positive recent-use hint only; do not write negative availability states such as no current occupancy.",
      "Readers must compare observedAt and validUntil and treat expired hints as historical-only.",
      "Do not include secrets, cookies, session data, credential paths, full commands, screenshots, personal activity, or machine-local paths."
    ],
    proposedMemoryHint: hint,
    recommendation: "Review and copy this JSON only when an explicit memory-update request exists; otherwise keep it as a report artifact."
  };
}

export function renderResourceCoordinationMemoryHintProposal(proposal) {
  const lines = [
    "# RCG Codex Memory Hint Proposal",
    "",
    `schema: ${proposal.schema}`,
    `generatedAt: ${proposal.generatedAt}`,
    `mode: ${proposal.mode}`,
    `status: ${proposal.status}`,
    `template: ${proposal.template}`,
    `reviewGateTemplate: ${proposal.reviewGateTemplate}`,
    `proposalNames: ${proposal.proposalNames.join(", ")}`,
    "",
    "This report is proposal-only. It does not write to Codex memory, modify runtime state, apply a lock, or schedule work.",
    "",
    "## Write Target",
    "",
    proposal.writeTarget,
    "",
    "## Constraints",
    ""
  ];

  for (const constraint of proposal.constraints) {
    lines.push(`- ${constraint}`);
  }

  lines.push("", "## Review Gate", "");
  lines.push(`- Required operator intent: ${proposal.reviewGate.requiredOperatorIntent}`);
  lines.push(`- Memory write surface: ${proposal.reviewGate.memoryWriteSurface}`);
  lines.push(`- Source artifact: ${proposal.reviewGate.sourceArtifact}`);
  lines.push("", "### Required Checks", "");
  for (const check of proposal.reviewGate.requiredChecks) {
    lines.push(`- ${check}`);
  }
  lines.push("", "### Denied Shortcuts", "");
  for (const shortcut of proposal.reviewGate.deniedShortcuts) {
    lines.push(`- ${shortcut}`);
  }

  lines.push(
    "",
    "## Proposed Memory Hint",
    "",
    "```json",
    JSON.stringify(proposal.proposedMemoryHint, null, 2),
    "```",
    "",
    "## Recommendation",
    "",
    proposal.recommendation
  );

  return `${lines.join("\n")}\n`;
}

function buildMemoryHintReviewGate() {
  return {
    requiredOperatorIntent: "The operator must explicitly ask to update Codex memory with the reviewed RCG hint.",
    memoryWriteSurface: "Use only a runtime-approved Codex memory update mechanism; DevGov scanners never write memory directly.",
    sourceArtifact: "Start from a generated proposal artifact under reports and review the exact JSON before any memory update.",
    requiredChecks: [
      "Confirm the hint is a positive recent-use event, not a negative availability state.",
      "Confirm project is a stable project id, not a machine-local path.",
      "Confirm intent is sanitized and contains no secrets, credential paths, full commands, screenshots, or personal activity.",
      "Confirm resourceClass, confidence, source, observedAt, validUntil, authority, and afterExpiry match the RCG schema.",
      "Confirm validUntil is short-term and expired hints will be treated as historical-only."
    ],
    deniedShortcuts: [
      "Do not treat generating a proposal as approval to update memory.",
      "Do not treat an acknowledgement-only response, timeout, or vague OK as memory-update approval.",
      "Do not infer current resource availability from a missing or expired memory hint.",
      "Do not write memory from a scanner, dashboard refresh, test, doctor run, or report-generation command."
    ]
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

function normalizePositiveInteger(value, fallback) {
  if (Number.isInteger(value) && value > 0) return value;
  return fallback;
}

function nonEmptyString(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function requireAllowed(value, allowed, label) {
  const text = nonEmptyString(value, "");
  if (!allowed.has(text)) {
    throw new Error(`${label} must be one of ${[...allowed].join(", ")}`);
  }
  return text;
}

function safeHintText(value, fallback, label) {
  const text = nonEmptyString(value, fallback);
  if (looksMachineLocal(text)) {
    throw new Error(`${label} must not contain machine-local paths`);
  }
  if (looksSecretValue(text)) {
    throw new Error(`${label} must not contain credential-like values`);
  }
  return text;
}

function looksMachineLocal(value) {
  return /(?:^|[\s"'`(])(?:[A-Za-z]:[\\/]|\\\\|windows-projects:|linux-mirror:)/i.test(value);
}

function looksSecretValue(value) {
  const text = String(value ?? "");
  return /\b(?:sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})\b/.test(text);
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
