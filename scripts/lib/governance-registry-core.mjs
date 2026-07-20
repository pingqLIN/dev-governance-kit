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
const VALID_RESOURCE_COORDINATION_MODE = new Set(["observe-first", "communicate", "schedule-reviewed"]);
const VALID_RESOURCE_CHANNEL_KIND = new Set(["dashboard-api", "report-artifact", "event-log", "os-signal", "service-control", "memory-hint"]);
const VALID_RESOURCE_CHANNEL_DIRECTION = new Set(["read", "write", "read-write"]);
const VALID_RESOURCE_RISK_LEVEL = new Set(["L0", "L1", "L2", "L3", "L4"]);
const VALID_RESOURCE_SIGNAL_KIND = new Set(["target-health", "host-resource", "runtime-load", "human-observation", "queue-state"]);
const VALID_RESOURCE_CONGESTION_USE = new Set(["primary", "context", "exclusion", "future"]);
const VALID_RESOURCE_EXCLUSIVITY = new Set(["exclusive-while-active", "capacity-limited", "shared"]);
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
  if (registry.schema === "devgov.resource-coordination.registry.v1") {
    return validateResourceCoordinationRegistry(registry);
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
  const seenVariableNames = new Map();
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
    const semanticVariableName = String(entry.variableName).toUpperCase();
    if (seenVariableNames.has(semanticVariableName)) {
      errors.push(`${label}.variableName duplicates ${seenVariableNames.get(semanticVariableName)} under case-insensitive environment semantics`);
    } else {
      seenVariableNames.set(semanticVariableName, `${label}.variableName`);
    }
    if (semanticVariableName === "GEMINI_API_KEY" && entry.variableName !== "GEMINI_API_KEY") {
      errors.push(`${label}.variableName must use the exact canonical name GEMINI_API_KEY`);
    }
    if (semanticVariableName === "OPENAI_API_KEY" && entry.variableName !== "OPENAI_API_KEY") {
      errors.push(`${label}.variableName must use the exact canonical name OPENAI_API_KEY`);
    }
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

export function validateResourceCoordinationRegistry(registry) {
  const errors = [];
  if (registry.schema !== "devgov.resource-coordination.registry.v1") errors.push("registry.schema must be devgov.resource-coordination.registry.v1");
  requireStrings(registry, ["description", "sourceOfTruth"], "registry", errors);
  if (looksMachineLocal(registry.description ?? "") || looksMachineLocal(registry.sourceOfTruth ?? "")) {
    errors.push("registry envelope must not contain machine-local paths or MCP aliases");
  }
  if (!registry.platform || typeof registry.platform !== "object" || Array.isArray(registry.platform)) {
    errors.push("registry.platform must be an object");
  } else {
    requireStrings(registry.platform, ["id", "mode", "operatorSurface", "communicationSurface", "observationSurface", "status", "notes"], "platform", errors);
    rejectMachineLocalStrings(deepStringValues(registry.platform, "platform"), "platform", errors);
    if (!VALID_RESOURCE_COORDINATION_MODE.has(registry.platform.mode)) {
      errors.push(`platform.mode must be one of ${[...VALID_RESOURCE_COORDINATION_MODE].join(", ")}`);
    }
    if (!VALID_STATUS.has(registry.platform.status)) {
      errors.push(`platform.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }

  validateFreshnessContract(registry.freshness, errors);
  validateResourceChannels(registry.channels, errors);
  validateResourceSignals(registry.signals, errors);
  validateExclusiveResources(registry.exclusiveResources, errors);
  validateResourcePolicies(registry.policies, errors);
  validateResourceStages(registry.stages, errors);
  return errors;
}

function validateFreshnessContract(freshness, errors) {
  if (!freshness || typeof freshness !== "object" || Array.isArray(freshness)) {
    errors.push("registry.freshness must be an object");
    return;
  }
  requireStrings(freshness, ["staleState", "status", "notes"], "freshness", errors);
  rejectMachineLocalStrings(deepStringValues(freshness, "freshness"), "freshness", errors);
  for (const field of ["snapshotMaxAgeSeconds", "exclusiveClaimMaxAgeSeconds", "activeClaimRefreshSeconds"]) {
    if (!Number.isInteger(freshness[field]) || freshness[field] < 1) {
      errors.push(`freshness.${field} must be a positive integer`);
    }
  }
  if (!VALID_STATUS.has(freshness.status)) {
    errors.push(`freshness.status must be one of ${[...VALID_STATUS].join(", ")}`);
  }
}

function validateResourceChannels(channels, errors) {
  if (!Array.isArray(channels)) {
    errors.push("registry.channels must be an array");
    return;
  }
  const seen = new Set();
  for (const [index, channel] of channels.entries()) {
    const label = `channels[${index}]`;
    requireStrings(channel, ["id", "kind", "surface", "direction", "riskLevel", "status", "notes"], label, errors);
    rejectMachineLocalStrings(deepStringValues(channel, label), label, errors);
    if (seen.has(channel.id)) errors.push(`${label}.id duplicates another channel`);
    seen.add(channel.id);
    if (!VALID_RESOURCE_CHANNEL_KIND.has(channel.kind)) {
      errors.push(`${label}.kind must be one of ${[...VALID_RESOURCE_CHANNEL_KIND].join(", ")}`);
    }
    if (!VALID_RESOURCE_CHANNEL_DIRECTION.has(channel.direction)) {
      errors.push(`${label}.direction must be one of ${[...VALID_RESOURCE_CHANNEL_DIRECTION].join(", ")}`);
    }
    if (!VALID_RESOURCE_RISK_LEVEL.has(channel.riskLevel)) {
      errors.push(`${label}.riskLevel must be one of ${[...VALID_RESOURCE_RISK_LEVEL].join(", ")}`);
    }
    if (!VALID_STATUS.has(channel.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }
}

function validateResourceSignals(signals, errors) {
  if (!Array.isArray(signals)) {
    errors.push("registry.signals must be an array");
    return;
  }
  const seen = new Set();
  for (const [index, signal] of signals.entries()) {
    const label = `signals[${index}]`;
    requireStrings(signal, ["id", "kind", "source", "interpretation", "congestionUse", "status", "notes"], label, errors);
    rejectMachineLocalStrings(deepStringValues(signal, label), label, errors);
    if (seen.has(signal.id)) errors.push(`${label}.id duplicates another signal`);
    seen.add(signal.id);
    if (!VALID_RESOURCE_SIGNAL_KIND.has(signal.kind)) {
      errors.push(`${label}.kind must be one of ${[...VALID_RESOURCE_SIGNAL_KIND].join(", ")}`);
    }
    if (!VALID_RESOURCE_CONGESTION_USE.has(signal.congestionUse)) {
      errors.push(`${label}.congestionUse must be one of ${[...VALID_RESOURCE_CONGESTION_USE].join(", ")}`);
    }
    if (!VALID_STATUS.has(signal.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }
}

function validateExclusiveResources(resources, errors) {
  if (!Array.isArray(resources)) {
    errors.push("registry.exclusiveResources must be an array");
    return;
  }
  const seen = new Set();
  for (const [index, resource] of resources.entries()) {
    const label = `exclusiveResources[${index}]`;
    requireStrings(resource, ["id", "resource", "exclusivity", "registrationSurface", "useGate", "status", "notes"], label, errors);
    rejectMachineLocalStrings(deepStringValues(resource, label), label, errors);
    if (seen.has(resource.id)) errors.push(`${label}.id duplicates another exclusive resource`);
    seen.add(resource.id);
    if (!VALID_RESOURCE_EXCLUSIVITY.has(resource.exclusivity)) {
      errors.push(`${label}.exclusivity must be one of ${[...VALID_RESOURCE_EXCLUSIVITY].join(", ")}`);
    }
    if (!VALID_STATUS.has(resource.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }
}

function validateResourcePolicies(policies, errors) {
  if (!Array.isArray(policies)) {
    errors.push("registry.policies must be an array");
    return;
  }
  const seen = new Set();
  for (const [index, policy] of policies.entries()) {
    const label = `policies[${index}]`;
    requireStrings(policy, ["id", "requirement", "enforcement", "status", "notes"], label, errors);
    rejectMachineLocalStrings(deepStringValues(policy, label), label, errors);
    if (seen.has(policy.id)) errors.push(`${label}.id duplicates another policy`);
    seen.add(policy.id);
    if (!VALID_STATUS.has(policy.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }
}

function validateResourceStages(stages, errors) {
  if (!Array.isArray(stages)) {
    errors.push("registry.stages must be an array");
    return;
  }
  const seen = new Set();
  for (const [index, stage] of stages.entries()) {
    const label = `stages[${index}]`;
    requireStrings(stage, ["id", "name", "trigger", "allowedActions", "requiredGate", "status", "notes"], label, errors);
    rejectMachineLocalStrings(deepStringValues(stage, label), label, errors);
    if (seen.has(stage.id)) errors.push(`${label}.id duplicates another stage`);
    seen.add(stage.id);
    if (!VALID_STATUS.has(stage.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }
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
