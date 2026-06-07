import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "reports",
  "target"
]);

const TEXT_FILE_PATTERN = /\.(?:cjs|js|mjs|ts|tsx|jsx|json|md|mdx|py|ps1|cmd|bat|ya?ml|toml|env|example|sample)$/i;
const ENV_FILE_PATTERN = /(^|[\\/])\.env(?:\..*)?$/i;
const CREDENTIAL_NAME_PATTERN = /(?:API[_ -]?KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|BEARER|ACCESS[_ -]?TOKEN|AUTH[_ -]?TOKEN|PRIVATE[_ -]?KEY|GLOBAL[_ -]?API[_ -]?KEY|NVAPI)/i;
const SERVICE_SPECIFIC_NAME_PATTERN = /^(?:Cloudflare_API|CLOUDFLARE_EMAIL)$/i;
const IGNORE_ENV_NAME_PATTERN = /^(?:GIT_CONFIG_KEY_\d+|npm_config_.*)$/i;
const KNOWN_ENV_NAME_PATTERN = /\b(?:OPENAI_API_KEY|openai_api_key_falcon|openai_api_key_translate|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_TOKEN_INITIAL|Cloudflare_API|CLOUDFLARE_EMAIL|Global_API_Key|Gemini_API_KEY|Jules_API_Key|HF_API_Token|BROWSERLESS_TOKEN|CONTEXT7_API_KEY|ANTIGRAVITY_API_KEY|dbos_api_key|SPB_Access_Token|ACTION_API_KEY|ACTION_BEARER_TOKEN|github_codex_api|codex_cloudflare|nvapi)\b/gi;
const UPPER_ENV_NAME_PATTERN = /\b(?:[A-Z][A-Z0-9]*_)+(?:API_KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|BEARER|ACCESS_TOKEN|AUTH_TOKEN|PRIVATE_KEY)(?:_[A-Z0-9]+)*\b/g;

const SERVICE_PROFILES = [
  {
    id: "openai",
    match: /OPENAI/i,
    service: "OpenAI Platform",
    settingsUrl: "https://platform.openai.com/api-keys",
    accessMethod: "Environment variable consumed by OpenAI SDKs or compatible clients.",
    rules: "Use project-scoped keys where possible, never commit values, rotate in the OpenAI Platform, then update dependent shells or services."
  },
  {
    id: "anthropic",
    match: /ANTHROPIC/i,
    service: "Anthropic Console",
    settingsUrl: "https://console.anthropic.com/settings/keys",
    accessMethod: "Environment variable consumed by Anthropic SDKs or compatible clients.",
    rules: "Use least-privilege workspace keys, never commit values, rotate in Console, then restart dependent shells or services."
  },
  {
    id: "cloudflare",
    match: /^(?:CF_|CLOUDFLARE|Cloudflare|codex_cloudflare|Global_API_Key)/i,
    service: "Cloudflare Dashboard",
    settingsUrl: "https://dash.cloudflare.com/profile/api-tokens",
    accessMethod: "Environment variable consumed by Cloudflare CLI, SDKs, or tunnel automation.",
    rules: "Prefer scoped API tokens over global keys, keep credential files out of registry data, rotate in Cloudflare Dashboard, then restart dependent services."
  },
  {
    id: "github",
    match: /GITHUB/i,
    service: "GitHub",
    settingsUrl: "https://github.com/settings/personal-access-tokens",
    accessMethod: "Environment variable consumed by GitHub CLI, API clients, or automation.",
    rules: "Prefer fine-grained personal access tokens or GitHub Apps, never commit values, rotate in GitHub settings, then refresh dependent credentials."
  },
  {
    id: "google-gemini",
    match: /(?:GEMINI|GOOGLE)/i,
    service: "Google AI Studio",
    settingsUrl: "https://aistudio.google.com/app/apikey",
    accessMethod: "Environment variable consumed by Gemini or Google AI SDK clients.",
    rules: "Restrict keys in Google Cloud where supported, never commit values, rotate in AI Studio or Google Cloud Console, then restart dependent shells or services."
  },
  {
    id: "hugging-face",
    match: /^(?:HF_|HUGGING)/i,
    service: "Hugging Face",
    settingsUrl: "https://huggingface.co/settings/tokens",
    accessMethod: "Environment variable consumed by Hugging Face Hub, inference, or dataset tooling.",
    rules: "Prefer fine-grained or read-only tokens, never commit values, rotate in Hugging Face settings, then refresh dependent tools."
  },
  {
    id: "browserless",
    match: /BROWSERLESS/i,
    service: "Browserless",
    settingsUrl: "https://account.browserless.io/",
    accessMethod: "Environment variable or connection URL token consumed by Browserless clients.",
    rules: "Keep tokens out of URLs in committed files, rotate in the Browserless dashboard, then update dependent browser automation clients."
  },
  {
    id: "context7",
    match: /CONTEXT7/i,
    service: "Context7",
    settingsUrl: "https://context7.com/dashboard",
    accessMethod: "Environment variable consumed by Context7 API or MCP clients.",
    rules: "Use bearer-token authentication only from local secrets storage, never commit values, rotate in the Context7 dashboard."
  },
  {
    id: "nvidia",
    match: /^(?:NVIDIA|NGC|NVAPI|nvapi)$/i,
    service: "NVIDIA API Catalog",
    settingsUrl: "https://build.nvidia.com/settings/api-keys",
    accessMethod: "Environment variable consumed by NVIDIA API Catalog, NIM, or NGC clients.",
    rules: "Use personal keys for development only, never commit values, rotate in NVIDIA settings, then update dependent shells or services."
  },
  {
    id: "jules",
    match: /JULES/i,
    service: "Google Jules",
    settingsUrl: "https://jules.google.com/settings",
    accessMethod: "Environment variable consumed by Jules API clients.",
    rules: "Store locally as an environment variable, never commit values, rotate in Jules settings, then restart dependent clients."
  },
  {
    id: "antigravity",
    match: /ANTIGRAVITY/i,
    service: "Google Antigravity",
    settingsUrl: "https://www.antigravity.google/docs/settings",
    accessMethod: "Environment variable or local tool setting consumed by Antigravity-related clients.",
    rules: "Treat as local development credential, never commit values, review current Antigravity settings before promotion."
  },
  {
    id: "dbos",
    match: /DBOS/i,
    service: "DBOS",
    settingsUrl: "review required",
    accessMethod: "Environment variable consumed by DBOS clients or deployment tooling.",
    rules: "Confirm current DBOS dashboard location before approval, never commit values, rotate through the service owner."
  }
];

const UNKNOWN_PROFILE = {
  id: "unknown",
  service: "Unknown service",
  settingsUrl: "review required",
  accessMethod: "Environment variable consumed by a development tool or service.",
  rules: "Identify the owning service before approval, never commit values, rotate through the owning service dashboard."
};

export async function scanApiKeys(options = {}) {
  const projectRoot = path.resolve(options.projectPath ?? ".");
  const [project, environment] = await Promise.all([
    scanProjectApiKeyReferences(projectRoot),
    scanEnvironmentApiKeyNames(options)
  ]);
  return {
    generatedAt: new Date().toISOString(),
    project,
    environment
  };
}

export async function scanProjectApiKeyReferences(projectRoot) {
  await assertReadableDirectory(projectRoot, "projectPath");
  const files = await collectProjectFiles(projectRoot);
  const findings = [];
  for (const filePath of files) {
    findings.push(...await scanProjectFile(projectRoot, filePath));
  }
  return {
    root: projectRoot,
    filesScanned: files.length,
    findings
  };
}

export async function scanEnvironmentApiKeyNames(options = {}) {
  const scopes = [];
  if (options.includeProcess !== false) {
    scopes.push({
      scope: "process",
      storageLocation: "Current process environment",
      names: Object.keys(process.env)
    });
  }

  if (process.platform === "win32" && options.fixtureOnly !== true) {
    const [userNames, machineNames] = await Promise.all([
      readWindowsEnvironmentNames("User"),
      readWindowsEnvironmentNames("Machine")
    ]);
    scopes.push({
      scope: "user",
      storageLocation: "Windows User environment variables",
      names: userNames
    });
    scopes.push({
      scope: "machine",
      storageLocation: "Windows Machine environment variables",
      names: machineNames
    });
  }

  const variables = [];
  const seen = new Set();
  for (const scope of scopes) {
    for (const name of scope.names) {
      const normalizedName = normalizeEnvName(name);
      if (!isCredentialName(normalizedName)) continue;
      const key = `${scope.scope}:${normalizedName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const profile = classifyService(normalizedName);
      variables.push({
        scope: scope.scope,
        name: normalizedName,
        service: profile.service,
        storageLocation: scope.storageLocation,
        accessMethod: profile.accessMethod,
        settingsUrl: profile.settingsUrl,
        rules: profile.rules,
        risk: scope.scope === "process" ? "transient-review" : "persistent-review"
      });
    }
  }

  return variables.sort((left, right) => `${left.scope}:${left.name}`.localeCompare(`${right.scope}:${right.name}`));
}

export function buildApiKeyRegistryEntries(environmentVariables, options = {}) {
  const scopes = new Set(options.scopes ?? ["machine"]);
  return environmentVariables
    .filter((variable) => scopes.has(variable.scope))
    .map((variable) => ({
      id: makeRegistryId(variable),
      project: "system-environment",
      service: variable.service,
      variableName: variable.name,
      credentialKind: credentialKindForName(variable.name),
      storageLocation: variable.storageLocation,
      accessMethod: variable.accessMethod,
      settingsUrl: variable.settingsUrl,
      rules: variable.rules,
      status: "candidate",
      source: "API key environment audit",
      notes: "Candidate credential-location record only. Do not store or print the credential value in DevGov registry data."
    }));
}

export function renderApiKeyAudit(scan) {
  const lines = [
    "# API Key Governance Audit",
    "",
    `Generated: ${scan.generatedAt}`,
    "",
    "## Project Scan",
    "",
    `Project: ${scan.project.root}`,
    `Files scanned: ${scan.project.filesScanned}`,
    `Findings: ${scan.project.findings.length}`,
    "",
    "| File | Line | Variable | Service | Evidence |",
    "|---|---:|---|---|---|"
  ];

  if (!scan.project.findings.length) {
    lines.push("| - | - | - | - | No API-key references found in scanned project files. |");
  }

  for (const finding of scan.project.findings) {
    lines.push([
      finding.file,
      finding.line,
      finding.variableName,
      finding.service,
      finding.evidence
    ].map(escapeCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Environment Variable Names",
    "",
    "| Scope | Name | Service | Storage Location | Settings | Risk |",
    "|---|---|---|---|---|---|"
  );

  if (!scan.environment.length) {
    lines.push("| - | - | - | - | - | No credential-like environment variable names found. |");
  }

  for (const variable of scan.environment) {
    lines.push([
      variable.scope,
      variable.name,
      variable.service,
      variable.storageLocation,
      variable.settingsUrl,
      variable.risk
    ].map(escapeCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  const registryEntries = buildApiKeyRegistryEntries(scan.environment);
  lines.push(
    "",
    "## Candidate Registry Entries",
    "",
    "Only persistent machine-scope variable names are suggested for `registry/api-keys.registry.json` by default.",
    "",
    "| ID | Variable | Service | Settings |",
    "|---|---|---|---|"
  );
  if (!registryEntries.length) {
    lines.push("| - | - | - | No machine-scope candidates found. |");
  }
  for (const entry of registryEntries) {
    lines.push([
      entry.id,
      entry.variableName,
      entry.service,
      entry.settingsUrl
    ].map(escapeCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("", "## Registry Promotion Rules", "");
  lines.push("- Registry records store names, storage location type, access method, rules, and service settings URL only.");
  lines.push("- Do not store values, credential file contents, full local credential paths, or command lines in `registry/api-keys.registry.json`.");
  lines.push("- Process-only variables are evidence only unless an operator confirms they are stable enough for registry promotion.");
  lines.push("- Rotate keys in the owning service dashboard, then update the storage location and restart dependent shells or services.");
  lines.push("");

  return lines.join("\n");
}

export function classifyService(name) {
  return SERVICE_PROFILES.find((profile) => profile.match.test(normalizeEnvName(name))) ?? UNKNOWN_PROFILE;
}

export function isCredentialName(name) {
  const normalizedName = normalizeEnvName(name);
  return (CREDENTIAL_NAME_PATTERN.test(normalizedName) || SERVICE_SPECIFIC_NAME_PATTERN.test(normalizedName))
    && !IGNORE_ENV_NAME_PATTERN.test(normalizedName);
}

function credentialKindForName(name) {
  const normalizedName = normalizeEnvName(name);
  if (/EMAIL/i.test(normalizedName)) return "account-identity";
  if (/TOKEN|BEARER|ACCESS/i.test(normalizedName)) return "token";
  if (/PASSWORD|PASS/i.test(normalizedName)) return "password";
  if (/SECRET/i.test(normalizedName)) return "secret";
  if (/KEY|NVAPI|_API$/i.test(normalizedName)) return "api-key";
  return "credential";
}

async function collectProjectFiles(root) {
  const files = [];

  async function walk(current, depth) {
    if (depth > 6) return;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const currentPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(currentPath, depth + 1);
        }
        continue;
      }
      if (isScannableFile(currentPath)) {
        files.push(currentPath);
      }
    }
  }

  await walk(root, 0);
  return files.sort();
}

function isScannableFile(filePath) {
  const base = path.basename(filePath);
  return ENV_FILE_PATTERN.test(filePath)
    || TEXT_FILE_PATTERN.test(base)
    || /^README(?:\..*)?$/i.test(base)
    || /^AGENTS(?:\..*)?$/i.test(base);
}

async function scanProjectFile(root, filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  const relativePath = path.relative(root, filePath) || path.basename(filePath);
  const isEnv = ENV_FILE_PATTERN.test(relativePath);
  const findings = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const names = extractCredentialNames(line, isEnv);
    for (const name of names) {
      const profile = classifyService(name);
      findings.push({
        file: relativePath,
        line: index + 1,
        variableName: name,
        service: profile.service,
        evidence: redactEvidenceLine(line, isEnv)
      });
    }
  }
  return findings;
}

function extractCredentialNames(line, isEnv) {
  if (isEnv) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_ -]*)\s*=/);
    const normalizedName = match ? normalizeEnvName(match[1]) : "";
    return normalizedName && isCredentialName(normalizedName) ? [normalizedName] : [];
  }

  const names = new Set();
  for (const pattern of [KNOWN_ENV_NAME_PATTERN, UPPER_ENV_NAME_PATTERN]) {
    for (const match of line.matchAll(pattern)) {
      const normalizedName = normalizeEnvName(match[0]);
      if (isCredentialName(normalizedName)) {
        names.add(normalizedName);
      }
    }
  }
  return [...names];
}

function normalizeEnvName(name) {
  return String(name ?? "").trim();
}

async function readWindowsEnvironmentNames(scope) {
  const script = [
    `$names = [Environment]::GetEnvironmentVariables('${scope}').Keys`,
    "$names | Sort-Object | ConvertTo-Json"
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function makeRegistryId(variable) {
  return `${variable.scope}-${variable.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function redactEvidenceLine(line, isEnv) {
  if (isEnv) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_ -]*)\s*=/);
    return match ? `${match[1]}=<redacted>` : "<redacted>";
  }
  return String(line)
    .trim()
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|KEY|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1=<redacted>")
    .replace(/\b(Authorization)\s*:\s*(Bearer|Basic)\s+[^,\s;|"'`]+/gi, "$1: $2 <redacted>")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^@\s\"'`]+)@/gi, "$1<redacted>@")
    .replace(/([?&](?:token|key|secret|password|pass|api_key)=)[^&\s\"'`]+/gi, "$1<redacted>");
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

async function assertReadableDirectory(dir, label) {
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${label} does not exist or is not a readable directory: ${dir}`);
  }
}
