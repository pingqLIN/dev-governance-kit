import fs from "node:fs/promises";
import path from "node:path";
import { scanEnvironmentApiKeyNames } from "./api-keys-core.mjs";

const DEFAULT_REGISTRY_PATH = path.join("registry", "api-keys.registry.json");

export async function buildNewProjectApiKeyPlan(options = {}) {
  const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH;
  const registry = await readJson(registryPath);
  const entries = selectRegistryEntries(registry.entries ?? [], options);
  const environment = options.liveEnvironment
    ?? (options.noLiveEnv ? [] : await scanEnvironmentApiKeyNames({ includeProcess: false }));
  const liveScopesByName = groupLiveScopes(environment);

  return {
    schema: "devgov.new-project-api-key-plan.v1",
    generatedAt: new Date().toISOString(),
    projectName: options.projectName ?? "new-project",
    registryPath,
    summary: {
      selectedCredentials: entries.length,
      livePersistentEnvironmentNames: environment.length,
      missingRegisteredNames: entries.filter((entry) => !liveScopesByName.has(entry.variableName)).length
    },
    resolverPolicy: {
      runtimeSource: "process.env",
      dotenvPolicy: "Load .env.local or .env with override:false so existing OS environment variables win.",
      registryPolicy: "Use DevGov registry metadata for names and provider rules only; never copy credential values into generated files.",
      fallbackPolicy: "Commit .env.example with blank placeholders; keep real values in OS User/Machine environment variables or untracked local env files."
    },
    credentials: entries.map((entry) => ({
      id: entry.id,
      service: entry.service,
      variableName: entry.variableName,
      credentialKind: entry.credentialKind,
      storageLocation: entry.storageLocation,
      accessMethod: entry.accessMethod,
      settingsUrl: entry.settingsUrl,
      status: entry.status,
      liveScopes: liveScopesByName.get(entry.variableName) ?? [],
      envExampleLine: `${entry.variableName}=`
    })),
    files: {
      envExampleTemplate: "templates/new-project.env.example",
      resolverTemplate: "templates/api-key-env-resolver.mjs",
      onboardingGuide: "docs/new-project-api-key-onboarding.md"
    }
  };
}

export function renderNewProjectApiKeyPlan(plan) {
  const lines = [
    "# New Project API Key Onboarding Plan",
    "",
    `Generated: ${plan.generatedAt}`,
    `Project: ${plan.projectName}`,
    `Registry: ${plan.registryPath}`,
    "",
    "## Policy",
    "",
    `- Runtime source: ${plan.resolverPolicy.runtimeSource}.`,
    `- dotenv: ${plan.resolverPolicy.dotenvPolicy}`,
    `- Registry: ${plan.resolverPolicy.registryPolicy}`,
    `- Template: ${plan.resolverPolicy.fallbackPolicy}`,
    "",
    "## Credential Names",
    "",
    "| Variable | Service | Registry Storage | Live Persistent Scopes | Status |",
    "|---|---|---|---|---|"
  ];

  if (!plan.credentials.length) {
    lines.push("| - | - | - | - | No registry entries matched the requested filters. |");
  }

  for (const credential of plan.credentials) {
    lines.push([
      credential.variableName,
      credential.service,
      credential.storageLocation,
      credential.liveScopes.length ? credential.liveScopes.join(", ") : "missing",
      credential.status
    ].map(escapeCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## .env.example Block",
    "",
    "Use this only as a blank committed sample. Real values belong in OS environment variables or untracked local env files.",
    "",
    "```dotenv",
    ...renderEnvExampleLines(plan),
    "```",
    "",
    "## Required Project Files",
    "",
    `- ${plan.files.envExampleTemplate}: reusable blank .env example.`,
    `- ${plan.files.resolverTemplate}: process.env resolver that reports names without values.`,
    `- ${plan.files.onboardingGuide}: standard operating flow for new projects.`,
    "",
    "## Safety",
    "",
    "- This report contains variable names and availability scopes only.",
    "- Do not paste secret values into registry records, docs, tests, templates, reports, or committed .env files.",
    "- Treat missing live scopes as setup evidence, not permission to create or reveal credentials.",
    ""
  );

  return lines.join("\n");
}

export function renderEnvExampleLines(plan) {
  const names = [...new Set(plan.credentials.map((credential) => credential.variableName))].sort();
  return [
    "# Copy to .env.local for local-only overrides.",
    "# Keep committed .env.example values blank.",
    "# Load dotenv with override:false so OS User/Machine environment variables win.",
    ...names.map((name) => `${name}=`)
  ];
}

function selectRegistryEntries(entries, options) {
  const serviceFilters = new Set((options.services ?? []).map((value) => normalizeFilter(value)));
  const variableFilters = new Set((options.variables ?? []).map((value) => normalizeFilter(value)));

  if (!serviceFilters.size && !variableFilters.size) {
    return [...entries].sort(compareEntries);
  }

  return entries
    .filter((entry) => {
      const service = normalizeFilter(entry.service);
      const variableName = normalizeFilter(entry.variableName);
      return serviceFilters.has(service) || variableFilters.has(variableName);
    })
    .sort(compareEntries);
}

function groupLiveScopes(environment) {
  const result = new Map();
  for (const variable of environment) {
    if (!result.has(variable.name)) result.set(variable.name, []);
    result.get(variable.name).push(variable.scope);
  }
  for (const scopes of result.values()) {
    scopes.sort();
  }
  return result;
}

function compareEntries(left, right) {
  return `${left.service}:${left.variableName}`.localeCompare(`${right.service}:${right.variableName}`);
}

function normalizeFilter(value) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
