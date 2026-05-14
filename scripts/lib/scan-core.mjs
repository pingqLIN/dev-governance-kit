import fs from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target"
]);

const TARGET_FILE_PATTERNS = [
  /^package\.json$/,
  /^vite\.config\.[cm]?[jt]s$/,
  /^next\.config\.[cm]?[jt]s$/,
  /^docker-compose.*\.ya?ml$/,
  /^compose.*\.ya?ml$/,
  /^\.env(?:\..*)?$/,
  /^README(?:\..*)?$/i,
  /^AGENTS\.md$/
];

const SOURCE_FILE_PATTERN = /\.(?:cjs|js|mjs|ts|tsx|jsx|py)$/;
const SOURCE_PATH_PATTERN = /(^|[\\/])(app|index|main|server|src[\\/](?:app|index|main|server|api)|api[\\/](?:app|index|main|server))\./i;

const PROJECT_MARKERS = new Set([
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "docker-compose.yml",
  "compose.yml"
]);

const HOST_PATTERN = /(?<![A-Za-z0-9_.-])(?:(?:\d{1,3}\.){3}\d{1,3}|localhost|\[::1\]|::1)(?![A-Za-z0-9_.-])/g;
const HOST_CONTEXT_PATTERN = /\b(?:[A-Z0-9_]*HOST[A-Z0-9_]*|host)\s*[:=]\s*["']?(\*|0\.0\.0\.0|127\.0\.0\.1|localhost|\[?::1\]?)/gi;
const HOST_ARG_PATTERN = /--host\s+(\*|0\.0\.0\.0|127\.0\.0\.1|localhost|\[?::1\]?)/gi;
const KEYWORD_PATTERN = /\b(port|strictPort|host|proxy|websocket|ws:|wss:|listen|serve|server|mcp|api|vite|next|uvicorn|flask|fastapi|express)\b/i;
const SAFE_ENV_KEY_PATTERN = /(?:^|_)(PORT|HOST|PUBLIC_HOST|URL|ORIGIN)(?:_|$)/i;

export async function scanProject(projectPath) {
  const root = path.resolve(projectPath);
  await assertReadableDirectory(root, "projectPath");
  const files = await collectTargetFiles(root);
  const findings = [];

  for (const filePath of files) {
    findings.push(...await scanFile(root, filePath));
  }

  return {
    root,
    filesScanned: files.length,
    findings
  };
}

export async function findProjects(workspaceRoot, options = {}) {
  const root = path.resolve(workspaceRoot);
  await assertReadableDirectory(root, "workspaceRoot");
  const maxDepth = options.maxDepth ?? 4;
  const projects = [];

  async function walk(current, depth) {
    if (depth > maxDepth) {
      return;
    }

    const entries = await safeReadDir(current);
    if (!entries) {
      return;
    }

    const names = new Set(entries.map((entry) => entry.name));
    if ([...PROJECT_MARKERS].some((marker) => names.has(marker))) {
      projects.push(current);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await walk(path.join(current, entry.name), depth + 1);
    }
  }

  await walk(root, 0);
  return projects.sort();
}

export function renderProjectAudit(scan) {
  const lines = [
    `# Port Audit: ${scan.root}`,
    "",
    `Files scanned: ${scan.filesScanned}`,
    `Findings: ${scan.findings.length}`,
    "",
    "| File | Line | Port | Host | Signals | Risk | Evidence |",
    "|---|---:|---:|---|---|---|---|"
  ];

  for (const finding of scan.findings) {
    lines.push([
      escapeCell(finding.file),
      finding.line,
      finding.port ?? "",
      escapeCell(finding.hosts.join(", ") || ""),
      escapeCell(finding.signals.join(", ")),
      escapeCell(finding.risks.join(", ") || "review"),
      escapeCell(finding.evidence)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  if (!scan.findings.length) {
    lines.push("| - | - | - | - | - | none | No port-related settings found. |");
  }

  lines.push("", "## Recommended Governance Actions", "");
  lines.push(...recommendActions(scan.findings).map((action) => `- ${action}`));
  lines.push("");

  return lines.join("\n");
}

export function renderWorkspaceAudit(root, projectScans) {
  const lines = [
    `# Workspace Port Audit: ${path.resolve(root)}`,
    "",
    `Projects scanned: ${projectScans.length}`,
    "",
    "| Project | Files | Findings | Public Bindings | Auto-Fallback Signals |",
    "|---|---:|---:|---:|---:|"
  ];

  for (const scan of projectScans) {
    const publicBindings = scan.findings.filter((finding) => finding.risks.includes("public-bind")).length;
    const fallbacks = scan.findings.filter((finding) => finding.risks.includes("auto-fallback") || finding.risks.includes("strictport-missing")).length;
    lines.push(`| ${escapeCell(scan.root)} | ${scan.filesScanned} | ${scan.findings.length} | ${publicBindings} | ${fallbacks} |`);
  }

  for (const scan of projectScans) {
    lines.push("", renderProjectAudit(scan));
  }

  return lines.join("\n");
}

async function collectTargetFiles(root) {
  const files = [];

  async function walk(current, depth) {
    if (depth > 5) {
      return;
    }

    const entries = await safeReadDir(current);
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      const currentPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(currentPath, depth + 1);
        }
        continue;
      }

      const relativePath = path.relative(root, currentPath);
      if (TARGET_FILE_PATTERNS.some((pattern) => pattern.test(entry.name)) || isLikelyEntrypoint(relativePath)) {
        files.push(currentPath);
      }
    }
  }

  await walk(root, 0);
  return files.sort();
}

async function scanFile(root, filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  const relativePath = path.relative(root, filePath) || path.basename(filePath);
  const isEnv = path.basename(filePath).startsWith(".env");
  const isCompose = /(?:^|[\\/])(?:docker-compose|compose).*\.ya?ml$/i.test(relativePath);
  const lines = text.split(/\r?\n/);
  const findings = [];
  let yamlSection = null;

  for (const [index, line] of lines.entries()) {
    yamlSection = isCompose ? updateYamlSection(line, yamlSection) : null;
    const context = { yamlSection: yamlSection?.name };
    const ports = extractPorts(line, context);
    const hosts = extractHosts(line);
    const riskOnly = isRiskOnlyLine(line);
    if (!KEYWORD_PATTERN.test(line) && !ports.length && !hosts.length && !riskOnly) {
      continue;
    }

    if (!ports.length && !hosts.length && !riskOnly) {
      continue;
    }

    const signals = classifySignals(relativePath, line, context);
    const risks = classifyRisks(line, hosts, context);
    const evidence = redactEvidenceLine(line, isEnv);

    const portsForFindings = ports.length ? new Set(ports) : new Set([null]);
    for (const port of portsForFindings) {
      findings.push({
        file: relativePath,
        line: index + 1,
        port,
        hosts: [...new Set(hosts)],
        signals,
        risks,
        evidence
      });
    }
  }

  return findings;
}

function updateYamlSection(line, currentSection) {
  const sectionMatch = line.match(/^(\s*)(ports|expose):\s*$/);
  if (sectionMatch) {
    return { name: sectionMatch[2], indent: sectionMatch[1].length };
  }
  if (currentSection && line.trim() && leadingSpaces(line) <= currentSection.indent) {
    return null;
  }
  return currentSection;
}

function leadingSpaces(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function extractPorts(line, context = {}) {
  if (context.yamlSection === "ports") {
    return extractDockerPublishedPorts(line);
  }
  if (context.yamlSection === "expose") {
    return extractDockerExposedPorts(line);
  }

  const ports = [];
  const patterns = [
    /\b[A-Z0-9_]*PORT[A-Z0-9_]*\s*=\s*["']?(\d{2,5})\b/gi,
    /\bport\s*:\s*["']?(\d{2,5})\b/gi,
    /\bport\s*:\s*[\w[\]|. ]+\s*=\s*["']?(\d{2,5})\b/gi,
    /\bport\s*=\s*["']?(\d{2,5})\b/gi,
    /--port\s+(\d{2,5})\b/gi,
    /\s-p\s+(\d{2,5})\b/gi,
    /\blisten\s*\(\s*["']?(\d{2,5})\b/gi,
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s"']+:(\d{2,5})\b/gi,
    /^\s*-\s*["']?(\d{2,5}):(\d{2,5})["']?\s*$/gi,
    /^\s*-\s*["']?(\d{2,5})["']?\s*$/gi
  ];

  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      for (const value of match.slice(1)) {
        const port = Number(value);
        if (Number.isInteger(port) && port >= 1 && port <= 65535) {
          ports.push(port);
        }
      }
    }
  }

  return [...new Set(ports)];
}

function extractDockerPublishedPorts(line) {
  const match = line.match(/^\s*-\s*["']?(?:(?:\*|0\.0\.0\.0|127\.0\.0\.1|localhost|\[?::1\]?):)?(\d{2,5}):(\d{1,5})(?:\/(?:tcp|udp))?["']?\s*$/i);
  if (!match) {
    return [];
  }
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? [port] : [];
}

function extractDockerExposedPorts(line) {
  const match = line.match(/^\s*-\s*["']?(\d{2,5})(?:\/(?:tcp|udp))?["']?\s*$/i);
  if (!match) {
    return [];
  }
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? [port] : [];
}

function extractHosts(line) {
  const hosts = [...line.matchAll(HOST_PATTERN)].map((match) => normalizeHost(match[0]));
  for (const pattern of [HOST_CONTEXT_PATTERN, HOST_ARG_PATTERN]) {
    for (const match of line.matchAll(pattern)) {
      hosts.push(normalizeHost(match[1]));
    }
  }
  return [...new Set(hosts)];
}

function isLikelyEntrypoint(relativePath) {
  if (!SOURCE_FILE_PATTERN.test(relativePath)) {
    return false;
  }
  return SOURCE_PATH_PATTERN.test(relativePath);
}

function classifySignals(file, line, context = {}) {
  const signals = [];
  const lower = `${file}\n${line}`.toLowerCase();
  if (context.yamlSection) signals.push("docker");
  if (lower.includes("vite")) signals.push("vite");
  if (lower.includes("next")) signals.push("next");
  if (lower.includes("docker") || lower.includes("ports:") || lower.includes("expose:")) signals.push("docker");
  if (lower.includes("websocket") || lower.includes("ws:") || lower.includes("wss:")) signals.push("websocket");
  if (lower.includes("mcp")) signals.push("mcp");
  if (lower.includes("api")) signals.push("api");
  if (lower.includes("proxy")) signals.push("proxy");
  if (lower.includes("listen") || lower.includes("server")) signals.push("server");
  if (!signals.length) signals.push("port-reference");
  return [...new Set(signals)];
}

function classifyRisks(line, hosts, context = {}) {
  const risks = [];
  const lower = line.toLowerCase();
  if (hosts.includes("0.0.0.0") || hosts.includes("*")) risks.push("public-bind");
  if (context.yamlSection === "ports") risks.push("host-publish-review");
  if (context.yamlSection === "expose") risks.push("docker-internal");
  if (lower.includes("strictport") && lower.includes("false")) risks.push("auto-fallback");
  if (lower.includes("--strictport") === false && lower.includes("vite") && lower.includes("--port")) risks.push("strictport-missing");
  if (/listen\s*\(\s*\d+/.test(line) || /port\s*[:=]\s*\d+/.test(lower)) risks.push("hard-coded");
  if (lower.includes("ports:") || /-\s*["']?\d+:\d+/.test(line)) risks.push("host-publish-review");
  return [...new Set(risks)];
}

function isRiskOnlyLine(line) {
  return /\bstrictPort\s*:\s*false\b/i.test(line);
}

function normalizeHost(host) {
  if (host === "[::1]") return "::1";
  return host;
}

function redactEnvLine(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) {
    return trimmed;
  }
  const [, key, value] = match;
  if (SAFE_ENV_KEY_PATTERN.test(key)) {
    return `${key}=${redactSafeEnvValue(value)}`;
  }
  return `${key}=<redacted>`;
}

function redactEvidenceLine(line, isEnv) {
  const evidence = isEnv ? redactEnvLine(line) : line.trim();
  return redactGenericSecrets(evidence);
}

function redactGenericSecrets(value) {
  return value
    .replace(/\b(Authorization)\s*:\s*(Bearer|Basic)\s+[^,\s;|"'`]+/gi, "$1: $2 <redacted>")
    .replace(/\b((?:X-)?API-Key|Token|Secret|Password)\s*:\s*[^,\s;|"'`]+/gi, "$1: <redacted>")
    .replace(/\b(Set-Cookie|Cookie)\s*:\s*.+$/gi, "$1: <redacted>")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|KEY)[A-Z0-9_]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1=<redacted>")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^@\s"'`]+)@/gi, "$1<redacted>@")
    .replace(/([?&](?:token|key|secret|password|pass|api_key)=)[^&\s"'`]+/gi, "$1<redacted>");
}

function redactSafeEnvValue(value) {
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["']|["']$/g, "");
  if (/^\d{1,5}$/.test(unquoted)) {
    return unquoted;
  }
  if (unquoted === "*") {
    return "*";
  }

  try {
    const parsed = new URL(unquoted);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    // Fall through to host-only handling.
  }

  const hosts = extractHosts(unquoted);
  const ports = extractPorts(unquoted);
  if (hosts.length || ports.length) {
    return [...new Set([...hosts, ...ports.map((port) => String(port))])].join(",") || "<redacted>";
  }
  return "<redacted>";
}

function recommendActions(findings) {
  const actions = [];
  if (findings.some((finding) => finding.risks.includes("public-bind"))) {
    actions.push("Review every `0.0.0.0` or wildcard host and document whether LAN/public visibility is intentional.");
  }
  if (findings.some((finding) => finding.risks.includes("strictport-missing") || finding.risks.includes("auto-fallback"))) {
    actions.push("Enable strict port behavior for dev servers so agents cannot silently move to another port.");
  }
  if (findings.some((finding) => finding.risks.includes("host-publish-review"))) {
    actions.push("Review Docker host publishing and prefer `expose` for internal-only services.");
  }
  if (findings.some((finding) => finding.risks.includes("hard-coded"))) {
    actions.push("Move approved service ports into `PORTS.md`, `.env.example`, startup scripts, and the global registry.");
  }
  if (!actions.length) {
    actions.push("No immediate port-governance risk found; register intentional service ports if this project exposes dev services.");
  }
  return actions;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

async function safeReadDir(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}

async function assertReadableDirectory(dir, label) {
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${label} does not exist or is not a readable directory: ${dir}`);
  }
}
