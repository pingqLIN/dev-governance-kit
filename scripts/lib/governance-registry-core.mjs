import fs from "node:fs/promises";
import path from "node:path";
import { validateRegistry as validatePortRegistry } from "./registry-core.mjs";

const VALID_STATUS = new Set(["candidate", "approved", "blocked", "deprecated"]);
const VALID_TERMINAL_ASSET_POLICY = new Set(["none", "resource-uri", "existing-file"]);
const VALID_STARTUP_TRIGGER = new Set(["startup-folder", "registry-run", "scheduled-task", "windows-service"]);
const VALID_PUBLIC_EXPOSURE = new Set(["local-only", "staging-private", "prod-protected", "public-health", "public-api"]);
const VALID_PROTOCOL = new Set(["http", "https", "tcp", "ws", "wss"]);

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
  if (registry.schema === "dev-governance-kit.ports.registry.v1") {
    return validatePortRegistry(registry);
  }
  if (registry.schema === "dev-governance-kit.terminal-profiles.registry.v1") {
    return validateTerminalProfilesRegistry(registry);
  }
  if (registry.schema === "dev-governance-kit.startup.registry.v1") {
    return validateStartupRegistry(registry);
  }
  if (registry.schema === "dev-governance-kit.public-routes.registry.v1") {
    return validatePublicRoutesRegistry(registry);
  }
  return [`registry.schema is not supported: ${registry.schema ?? "<missing>"}`];
}

export function validateTerminalProfilesRegistry(registry) {
  const errors = validateRegistryEnvelope(registry, "dev-governance-kit.terminal-profiles.registry.v1", "profiles");
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
  const errors = validateRegistryEnvelope(registry, "dev-governance-kit.startup.registry.v1", "entries");
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
  const errors = validateRegistryEnvelope(registry, "dev-governance-kit.public-routes.registry.v1", "routes");
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
