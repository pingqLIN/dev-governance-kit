import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RESOURCE_URI_PATTERN = /^(ms-appx|ms-appdata|data|https?):/i;

export function defaultTerminalSettingsPaths(env = process.env) {
  const localAppData = env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return [
    path.join(localAppData, "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json"),
    path.join(localAppData, "Packages", "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe", "LocalState", "settings.json")
  ];
}

export async function scanTerminalSettingsFiles(settingsPaths = defaultTerminalSettingsPaths()) {
  const scans = [];
  for (const settingsPath of settingsPaths) {
    const text = await fs.readFile(settingsPath, "utf8").catch(() => null);
    if (text === null) {
      scans.push({ settingsPath, found: false, findings: [], profileCount: 0 });
      continue;
    }
    const settings = JSON.parse(text);
    scans.push(await scanTerminalSettingsObject(settings, settingsPath));
  }
  return scans;
}

export async function scanTerminalSettingsObject(settings, settingsPath = "settings.json") {
  const profiles = Array.isArray(settings?.profiles?.list) ? settings.profiles.list : [];
  const findings = [];
  for (const profile of profiles) {
    for (const field of ["icon", "backgroundImage"]) {
      const value = profile[field];
      if (!value) continue;
      const status = await classifyAssetReference(String(value));
      if (status.valid) continue;
      findings.push({
        profileGuid: profile.guid ?? "",
        profileName: profile.name ?? "",
        field,
        value: String(value),
        risk: status.risk,
        recommendation: field === "icon" ? "remove-invalid-icon" : "remove-invalid-background-image"
      });
    }
  }
  return { settingsPath, found: true, profileCount: profiles.length, findings };
}

export function buildTerminalFixPlan(scans) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "review-required",
    actions: scans.flatMap((scan) => scan.findings.map((finding) => ({
      settingsPath: scan.settingsPath,
      profileGuid: finding.profileGuid,
      profileName: finding.profileName,
      field: finding.field,
      currentValue: finding.value,
      action: `delete ${finding.field}`
    })))
  };
}

export async function applyTerminalFixPlan(plan) {
  const grouped = new Map();
  for (const action of plan.actions) {
    const actions = grouped.get(action.settingsPath) ?? [];
    actions.push(action);
    grouped.set(action.settingsPath, actions);
  }
  const backups = [];
  for (const [settingsPath, actions] of grouped) {
    const text = await fs.readFile(settingsPath, "utf8");
    const backupPath = `${settingsPath}.backup-dev-governance-kit-${timestamp()}`;
    await fs.writeFile(backupPath, text, "utf8");
    backups.push(backupPath);
    const settings = JSON.parse(text);
    const profiles = Array.isArray(settings?.profiles?.list) ? settings.profiles.list : [];
    for (const action of actions) {
      const profile = profiles.find((candidate) => candidate.guid === action.profileGuid || candidate.name === action.profileName);
      if (profile) {
        delete profile[action.field];
      }
    }
    await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
  return backups;
}

export function renderTerminalReport(scans) {
  const lines = [
    "# Windows Terminal Profile Audit",
    "",
    "| Settings | Found | Profiles | Findings |",
    "|---|---:|---:|---:|"
  ];
  for (const scan of scans) {
    lines.push(`| ${escapeCell(scan.settingsPath)} | ${scan.found ? "yes" : "no"} | ${scan.profileCount} | ${scan.findings.length} |`);
  }
  lines.push("", "## Findings", "", "| Settings | Profile | Field | Risk | Recommendation | Value |", "|---|---|---|---|---|---|");
  const findings = scans.flatMap((scan) => scan.findings.map((finding) => ({ scan, finding })));
  if (!findings.length) {
    lines.push("| - | - | - | none | no action | - |");
  }
  for (const { scan, finding } of findings) {
    lines.push([
      scan.settingsPath,
      finding.profileName || finding.profileGuid,
      finding.field,
      finding.risk,
      finding.recommendation,
      finding.value
    ].map(escapeCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Safety", "", "- This audit is read-only.");
  lines.push("- Use `plan:terminal-fix` to produce a reviewed fix plan before changing Windows Terminal settings.");
  return lines.join("\n");
}

async function classifyAssetReference(value) {
  if (RESOURCE_URI_PATTERN.test(value)) return { valid: true };
  const expanded = expandEnvironmentVariables(value);
  const exists = await fs.access(expanded).then(() => true, () => false);
  if (exists) return { valid: true };
  return { valid: false, risk: "missing-or-invalid-resource" };
}

function expandEnvironmentVariables(value) {
  return value.replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? `%${key}%`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
