import fs from "node:fs/promises";
import path from "node:path";
import { validateAgentInstructionsRegistry } from "./agent-instructions-core.mjs";
import { validateRegistry as validatePortRegistry } from "./registry-core.mjs";

const VALID_STATUS = new Set(["candidate", "approved", "blocked", "deprecated"]);
const VALID_TERMINAL_ASSET_POLICY = new Set(["none", "resource-uri", "existing-file"]);
const VALID_STARTUP_TRIGGER = new Set(["startup-folder", "registry-run", "scheduled-task", "windows-service", "protocol-handler"]);
const VALID_PUBLIC_EXPOSURE = new Set(["local-only", "staging-private", "prod-protected", "public-health", "public-api"]);
const VALID_PROTOCOL = new Set(["http", "https", "tcp", "ws", "wss"]);
const VALID_LOCAL_AGENT_KIND = new Set(["windows-service-agent", "scheduled-task-agent", "startup-folder-agent", "on-demand-agent"]);
const VALID_CREDENTIAL_KIND = new Set(["api-key", "token", "secret", "password", "credential", "account-identity"]);
const VALID_ONBOARDING_READINESS = new Set(["READY", "PARTIAL", "BLOCKED"]);
const VALID_ONBOARDING_REVIEW = new Set(["reviewed", "needs-implementation", "needs-owner", "blocked"]);
const VALID_CLOUDFLARE_ARCH_KIND = new Set(["loopback-origin", "public-route", "access-policy", "startup-control", "evidence-boundary"]);
const DESIGN_THEMES = ["light", "dark"];
const DESIGN_THEME_TOKENS = ["ink", "muted", "line", "paper", "panel", "panelRaised", "input", "accent", "accentInk", "link", "okBg", "warnBg", "badBg", "neutralBg", "gridLine", "headerBg", "focus"];
const DESIGN_TYPOGRAPHY_ROLES = ["display", "headline", "title", "body", "label", "mono"];

export async function loadJson(jsonPath) {
  const text = await fs.readFile(jsonPath, "utf8");
  return JSON.parse(text);
}

export async function loadRegistryFiles(targetPath) {
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    return [targetPath];
  }
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".registry.json"))
    .map((entry) => path.join(targetPath, entry.name))
    .sort();
}

export function validateGovernanceRegistry(registry) {
  if (registry.schema === "devgov.ports.registry.v1") {
    return validatePortRegistry(registry);
  }
  if (registry.schema === "devgov.terminal-profiles.registry.v1") {
    return validateTerminalProfilesRegistry(registry);
  }
  if (registry.schema === "devgov.startup.registry.v1") {
    return validateStartupRegistry(registry);
  }
  if (registry.schema === "devgov.public-routes.registry.v1") {
    return validatePublicRoutesRegistry(registry);
  }
  if (registry.schema === "devgov.local-agents.registry.v1") {
    return validateLocalAgentsRegistry(registry);
  }
  if (registry.schema === "devgov.api-keys.registry.v1") {
    return validateApiKeysRegistry(registry);
  }
  if (registry.schema === "devgov.service-onboarding.registry.v1") {
    return validateServiceOnboardingRegistry(registry);
  }
  if (registry.schema === "devgov.local-cloudflare.registry.v1") {
    return validateLocalCloudflareRegistry(registry);
  }
  if (registry.schema === "devgov.service-control.registry.v1") {
    return validateServiceControlRegistry(registry);
  }
  if (registry.schema === "devgov.agent-instructions.registry.v1") {
    return validateAgentInstructionsRegistry(registry);
  }
  if (registry.schema === "devgov.design-system.registry.v1") {
    return validateDesignSystemRegistry(registry);
  }
  return [`registry.schema is not supported: ${registry.schema ?? "<missing>"}`];
}

export function validateTerminalProfilesRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.terminal-profiles.registry.v1", "profiles");
  if (errors.length) return errors;

  const seen = new Set();
  for (const [index, profile] of registry.profiles.entries()) {
    const label = `profiles[${index}]`;
    requireStrings(profile, ["id", "name", "status", "assetPolicy", "source", "notes"], label, errors);
    rejectMachineLocalStrings(profile, label, errors);
    if (seen.has(profile.id)) errors.push(`${label}.id duplicates another terminal profile`);
    seen.add(profile.id);
    if (!VALID_STATUS.has(profile.status)) errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    if (!VALID_TERMINAL_ASSET_POLICY.has(profile.assetPolicy)) {
      errors.push(`${label}.assetPolicy must be one of ${[...VALID_TERMINAL_ASSET_POLICY].join(", ")}`);
    }
  }
  return errors;
}

export function validateStartupRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.startup.registry.v1", "entries");
  if (errors.length) return errors;

  const seen = new Set();
  for (const [index, entry] of registry.entries.entries()) {
    const label = `entries[${index}]`;
    requireStrings(entry, ["id", "project", "trigger", "purpose", "scriptRef", "status", "source", "notes"], label, errors);
    rejectMachineLocalStrings(entry, label, errors);
    if (seen.has(entry.id)) errors.push(`${label}.id duplicates another startup entry`);
    seen.add(entry.id);
    if (!VALID_STARTUP_TRIGGER.has(entry.trigger)) {
      errors.push(`${label}.trigger must be one of ${[...VALID_STARTUP_TRIGGER].join(", ")}`);
    }
    if (!VALID_STATUS.has(entry.status)) errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    if (typeof entry.managedByCodex !== "boolean") errors.push(`${label}.managedByCodex must be boolean`);
  }
  return errors;
}

export function validatePublicRoutesRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.public-routes.registry.v1", "routes");
  if (errors.length) return errors;

  const seenHostnames = new Set();
  for (const [index, route] of registry.routes.entries()) {
    const label = `routes[${index}]`;
    requireStrings(route, [
      "id",
      "serviceId",
      "hostname",
      "tunnelId",
      "localHost",
      "protocol",
      "exposureClass",
      "healthUrl",
      "status",
      "source",
      "notes"
    ], label, errors);
    rejectMachineLocalStrings(route, label, errors);
    if (seenHostnames.has(route.hostname)) errors.push(`${label}.hostname duplicates another route`);
    seenHostnames.add(route.hostname);
    if (!Number.isInteger(route.localPort) || route.localPort < 1 || route.localPort > 65535) {
      errors.push(`${label}.localPort must be an integer from 1 to 65535`);
    }
    if (typeof route.accessRequired !== "boolean") errors.push(`${label}.accessRequired must be boolean`);
    if (!VALID_PROTOCOL.has(route.protocol)) errors.push(`${label}.protocol must be one of ${[...VALID_PROTOCOL].join(", ")}`);
    if (!VALID_PUBLIC_EXPOSURE.has(route.exposureClass)) {
      errors.push(`${label}.exposureClass must be one of ${[...VALID_PUBLIC_EXPOSURE].join(", ")}`);
    }
    if (!VALID_STATUS.has(route.status)) errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    if (route.exposureClass === "local-only") errors.push(`${label}.exposureClass cannot be local-only for a public route`);
    if (route.accessRequired && route.exposureClass === "public-api") {
      errors.push(`${label}.accessRequired public-api routes need a protected exposure class`);
    }
  }
  return errors;
}

export function validateLocalAgentsRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.local-agents.registry.v1", "agents");
  if (errors.length) return errors;

  const seen = new Set();
  for (const [index, agent] of registry.agents.entries()) {
    const label = `agents[${index}]`;
    requireStrings(agent, [
      "id",
      "project",
      "kind",
      "serviceId",
      "displayName",
      "healthUrl",
      "portRef",
      "startupRef",
      "status",
      "source",
      "notes"
    ], label, errors);
    rejectMachineLocalStrings(agent, label, errors);
    if (seen.has(agent.id)) errors.push(`${label}.id duplicates another local agent`);
    seen.add(agent.id);
    if (!VALID_LOCAL_AGENT_KIND.has(agent.kind)) {
      errors.push(`${label}.kind must be one of ${[...VALID_LOCAL_AGENT_KIND].join(", ")}`);
    }
    if (!VALID_STATUS.has(agent.status)) errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    if (typeof agent.managedByCodex !== "boolean") errors.push(`${label}.managedByCodex must be boolean`);
    if (!String(agent.healthUrl).startsWith("http://127.0.0.1:")) {
      errors.push(`${label}.healthUrl must be a loopback HTTP URL`);
    }
  }
  return errors;
}

export function validateApiKeysRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.api-keys.registry.v1", "entries");
  if (errors.length) return errors;

  const seen = new Set();
  for (const [index, entry] of registry.entries.entries()) {
    const label = `entries[${index}]`;
    requireStrings(entry, [
      "id",
      "project",
      "service",
      "variableName",
      "credentialKind",
      "storageLocation",
      "accessMethod",
      "settingsUrl",
      "rules",
      "status",
      "source",
      "notes"
    ], label, errors);
    rejectMachineLocalStrings(entry, label, errors);
    if (seen.has(entry.id)) errors.push(`${label}.id duplicates another API key entry`);
    seen.add(entry.id);
    if (!VALID_CREDENTIAL_KIND.has(entry.credentialKind)) {
      errors.push(`${label}.credentialKind must be one of ${[...VALID_CREDENTIAL_KIND].join(", ")}`);
    }
    if (!VALID_STATUS.has(entry.status)) errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    if (looksSecretValue(entry.variableName)) {
      errors.push(`${label}.variableName appears to contain a credential value instead of a variable name`);
    }
    if (looksSecretValue(entry.notes) || looksSecretValue(entry.rules) || looksSecretValue(entry.accessMethod)) {
      errors.push(`${label} must not contain apparent credential values`);
    }
  }
  return errors;
}

export function validateServiceOnboardingRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.service-onboarding.registry.v1", "entries");
  if (errors.length) return errors;

  const seen = new Set();
  for (const [index, entry] of registry.entries.entries()) {
    const label = `entries[${index}]`;
    requireStrings(entry, [
      "id",
      "project",
      "service",
      "readiness",
      "ownerKind",
      "sourceRef",
      "healthProcedure",
      "doctorProcedure",
      "resetProcedure",
      "startupProcedure",
      "dashboardProcedure",
      "cloudflareProcedure",
      "reviewStatus",
      "reviewEvidence",
      "nextAction",
      "notes"
    ], label, errors);
    rejectMachineLocalStrings(entry, label, errors);
    if (seen.has(entry.id)) errors.push(`${label}.id duplicates another service onboarding entry`);
    seen.add(entry.id);
    if (!VALID_ONBOARDING_READINESS.has(entry.readiness)) {
      errors.push(`${label}.readiness must be one of ${[...VALID_ONBOARDING_READINESS].join(", ")}`);
    }
    if (!VALID_ONBOARDING_REVIEW.has(entry.reviewStatus)) {
      errors.push(`${label}.reviewStatus must be one of ${[...VALID_ONBOARDING_REVIEW].join(", ")}`);
    }
  }
  return errors;
}

export function validateLocalCloudflareRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.local-cloudflare.registry.v1", "items");
  if (errors.length) return errors;

  const seen = new Set();
  for (const [index, item] of registry.items.entries()) {
    const label = `items[${index}]`;
    requireStrings(item, ["id", "kind", "requirement", "ownerRegistry", "verification", "status", "notes"], label, errors);
    rejectMachineLocalStrings(item, label, errors);
    if (seen.has(item.id)) errors.push(`${label}.id duplicates another local Cloudflare item`);
    seen.add(item.id);
    if (!VALID_CLOUDFLARE_ARCH_KIND.has(item.kind)) {
      errors.push(`${label}.kind must be one of ${[...VALID_CLOUDFLARE_ARCH_KIND].join(", ")}`);
    }
    if (!VALID_STATUS.has(item.status)) errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
  }
  return errors;
}

export function validateServiceControlRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "devgov.service-control.registry.v1", "entries");
  if (errors.length) return errors;

  const seen = new Set();
  for (const [index, entry] of registry.entries.entries()) {
    const label = `entries[${index}]`;
    requireStrings(entry, [
      "id",
      "controlTargetId",
      "action",
      "wrapperRef",
      "resolverRef",
      "inputContract",
      "auditLevel",
      "rollbackNotes",
      "uiLabel",
      "status",
      "notes"
    ], label, errors);
    rejectMachineLocalStrings(entry, label, errors);
    if (seen.has(entry.id)) errors.push(`${label}.id duplicates another service control entry`);
    seen.add(entry.id);
    if (!Array.isArray(entry.surfaceTargets) || entry.surfaceTargets.length === 0 || entry.surfaceTargets.some((value) => typeof value !== "string" || !value.trim())) {
      errors.push(`${label}.surfaceTargets must be a non-empty string array`);
    }
    if (typeof entry.approved !== "boolean") errors.push(`${label}.approved must be boolean`);
    if (!Number.isInteger(entry.timeoutSeconds) || entry.timeoutSeconds < 1 || entry.timeoutSeconds > 120) {
      errors.push(`${label}.timeoutSeconds must be an integer from 1 to 120`);
    }
    if (typeof entry.requiresConfirmation !== "boolean") errors.push(`${label}.requiresConfirmation must be boolean`);
    if (!VALID_STATUS.has(entry.status)) errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
  }
  return errors;
}

export function validateDesignSystemRegistry(registry) {
  const errors = [];
  if (registry.schema !== "devgov.design-system.registry.v1") errors.push("registry.schema must be devgov.design-system.registry.v1");
  requireStrings(registry, ["description", "sourceOfTruth", "status", "colorFormat"], "registry", errors);
  if (!VALID_STATUS.has(registry.status)) errors.push(`registry.status must be one of ${[...VALID_STATUS].join(", ")}`);
  if (registry.colorFormat !== "oklch") errors.push("registry.colorFormat must be oklch");
  if (looksMachineLocal(registry.description ?? "") || looksMachineLocal(registry.sourceOfTruth ?? "")) {
    errors.push("registry envelope must not contain machine-local paths or MCP aliases");
  }

  if (!registry.themes || typeof registry.themes !== "object" || Array.isArray(registry.themes)) {
    errors.push("registry.themes must be an object");
  } else {
    for (const themeName of DESIGN_THEMES) {
      const theme = registry.themes[themeName];
      if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
        errors.push(`registry.themes.${themeName} must be an object`);
        continue;
      }
      for (const tokenName of DESIGN_THEME_TOKENS) {
        if (typeof theme[tokenName] !== "string" || !theme[tokenName].startsWith("oklch(")) {
          errors.push(`registry.themes.${themeName}.${tokenName} must be an OKLCH string`);
        }
      }
    }
  }

  if (!registry.typography || typeof registry.typography !== "object" || Array.isArray(registry.typography)) {
    errors.push("registry.typography must be an object");
  } else {
    for (const role of DESIGN_TYPOGRAPHY_ROLES) {
      const typography = registry.typography[role];
      if (!typography || typeof typography !== "object" || Array.isArray(typography)) {
        errors.push(`registry.typography.${role} must be an object`);
        continue;
      }
      requireStrings(typography, ["fontFamily", "fontSize", "letterSpacing"], `typography.${role}`, errors);
      if (typeof typography.fontWeight !== "number") errors.push(`typography.${role}.fontWeight must be a number`);
      if (typeof typography.lineHeight !== "number") errors.push(`typography.${role}.lineHeight must be a number`);
    }
  }

  for (const objectName of ["rounded", "spacing", "layout", "components", "statusSemantics"]) {
    if (!registry[objectName] || typeof registry[objectName] !== "object" || Array.isArray(registry[objectName])) {
      errors.push(`registry.${objectName} must be an object`);
    }
  }
  if (!Array.isArray(registry.rules) || registry.rules.length === 0) errors.push("registry.rules must be a non-empty array");
  rejectMachineLocalStrings(deepStringValues(registry), "registry", errors);
  return errors;
}

function validateRegistryEnvelope(registry, expectedSchema, collectionName) {
  const errors = [];
  if (registry.schema !== expectedSchema) errors.push(`registry.schema must be ${expectedSchema}`);
  if (looksMachineLocal(registry.description ?? "") || looksMachineLocal(registry.sourceOfTruth ?? "")) {
    errors.push("registry envelope must not contain machine-local paths or MCP aliases");
  }
  if (!Array.isArray(registry[collectionName])) errors.push(`registry.${collectionName} must be an array`);
  return errors;
}

function requireStrings(entry, fields, label, errors) {
  for (const field of fields) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      errors.push(`${label}.${field} must be a non-empty string`);
    }
  }
}

function rejectMachineLocalStrings(entry, label, errors) {
  for (const [field, value] of Object.entries(entry)) {
    if (typeof value === "string" && looksMachineLocal(value)) {
      errors.push(`${label}.${field} must not contain machine-local paths or MCP aliases`);
    }
  }
}

function looksMachineLocal(value) {
  return /(?:^|[\s"'`(])(?:[A-Za-z]:[\\/]|\\\\|windows-projects:|linux-mirror:)/i.test(value);
}

function looksSecretValue(value) {
  const text = String(value ?? "");
  return /\b(?:sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})\b/.test(text);
}

function deepStringValues(value, prefix = "value", output = {}) {
  if (typeof value === "string") {
    output[prefix] = value;
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => deepStringValues(entry, `${prefix}[${index}]`, output));
    return output;
  }
  for (const [key, entry] of Object.entries(value)) {
    deepStringValues(entry, `${prefix}.${key}`, output);
  }
  return output;
}
