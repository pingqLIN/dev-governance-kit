import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function scanStartup(options = {}) {
  const entries = [];
  entries.push(...await scanStartupFolder(options.startupDir ?? defaultStartupDir()));
  if (!options.fixtureOnly) {
    entries.push(...await readPowerShellInventory());
  }
  return { generatedAt: new Date().toISOString(), entries };
}

export async function scanStartupFolder(startupDir) {
  const dirEntries = await fs.readdir(startupDir, { withFileTypes: true }).catch(() => []);
  const entries = [];
  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    if (entry.name.toLowerCase() === "desktop.ini") continue;
    const filePath = path.join(startupDir, entry.name);
    const content = await fs.readFile(filePath, "utf8").catch(() => "");
    entries.push(classifyStartupEntry({
      surface: "startup-folder",
      name: entry.name,
      command: content.trim(),
      source: filePath
    }));
  }
  return entries;
}

export function classifyStartupEntry(entry) {
  const haystack = `${entry.name}\n${entry.command}`.toLowerCase();
  const codexManaged = /\bcodex\b|chatgpt local files mcp/.test(haystack);
  const candidate = codexManaged || /cloudflare|cloudflared|terminal|dev|ps3 eye|ps3eye|vcam|virtual camera|system camera/.test(haystack);
  return {
    ...entry,
    classification: codexManaged ? "codex-created" : candidate ? "candidate" : "unrelated",
    risk: entry.command.includes("ExecutionPolicy Bypass") ? "bypass-policy-review" : "review",
    evidence: redactCommand(entry.command)
  };
}

export function renderStartupReport(scan) {
  const lines = [
    "# Startup Governance Audit",
    "",
    `Generated: ${scan.generatedAt}`,
    "",
    "| Surface | Name | Classification | Risk | Evidence |",
    "|---|---|---|---|---|"
  ];
  if (!scan.entries.length) {
    lines.push("| - | - | none | none | No startup entries found. |");
  }
  for (const entry of scan.entries) {
    lines.push([
      entry.surface,
      entry.name,
      entry.classification,
      entry.risk,
      entry.evidence
    ].map(escapeCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Registry Promotion Rules", "");
  lines.push("- Promote only reviewed Codex-created or development automation entries into `registry/startup.registry.json`.");
  lines.push("- Keep machine-local paths and full command lines in reports only.");
  return lines.join("\n");
}

function defaultStartupDir() {
  return path.join(os.homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

async function readPowerShellInventory() {
  if (process.platform !== "win32") return [];
  const script = [
    "$items=@();",
    "Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $items += [pscustomobject]@{surface='registry-run';name=$_.Name;command=[string]$_.Value;source='HKCU Run'} } };",
    "Get-ScheduledTask | Where-Object { $_.TaskName -match 'Codex|ChatGPT|Cloudflare|Terminal|Tips' -or $_.TaskPath -match 'Codex|ChatGPT|Cloudflare|Terminal|Tips' } | ForEach-Object { $task=$_; $task.Actions | ForEach-Object { $items += [pscustomobject]@{surface='scheduled-task';name=$task.TaskName;command=([string]$_.Execute + ' ' + [string]$_.Arguments);source=$task.TaskPath} } };",
    "Get-Service -Name '*cloudflared*' -ErrorAction SilentlyContinue | ForEach-Object { $items += [pscustomobject]@{surface='windows-service';name=$_.Name;command=$_.DisplayName;source='service-control-manager'} };",
    "$items | ConvertTo-Json -Depth 4"
  ].join(" ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => classifyStartupEntry(entry));
}

function redactCommand(value) {
  return String(value)
    .replace(/\b(token|secret|password|api_key|key)=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=<redacted>")
    .replace(/(Bearer|Basic)\s+[^\s]+/gi, "$1 <redacted>");
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
