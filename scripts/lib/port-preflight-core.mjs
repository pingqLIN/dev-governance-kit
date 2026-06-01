import fs from "node:fs/promises";
import net from "node:net";
import { validateRegistry } from "./registry-core.mjs";

const TCP_PROTOCOLS = new Set(["tcp", "http", "https", "ws", "wss"]);

export async function loadPortRegistry(registryPath) {
  const text = await fs.readFile(registryPath, "utf8");
  return JSON.parse(text);
}

export async function runPortPreflight(options) {
  const registry = await loadPortRegistry(options.registryPath);
  const result = await evaluatePortPreflight(registry, options);
  if (result.shouldCheckAvailability) {
    const availability = await checkTcpPortAvailable(result.entry.host, result.entry.port);
    if (!availability.available && options.availability !== "allow-occupied") {
      throw new Error([
        `Governed port is occupied: ${result.entry.host}:${result.entry.port}`,
        `Entry: ${result.entry.project}/${result.entry.service}`,
        "Stop the owning process, choose a reviewed registry change, or pass --allow-occupied only for commands that attach to an existing service."
      ].join("\n"));
    }
    result.availability = availability;
  }
  return result;
}

export async function evaluatePortPreflight(registry, options) {
  const errors = validateRegistry(registry);
  if (errors.length) {
    throw new Error(`Port registry is invalid:\n${errors.join("\n")}`);
  }

  if (!options.project || !options.service) {
    throw new Error("Both --project and --service are required.");
  }

  const entry = findPortEntry(registry, options.project, options.service);
  if (!entry) {
    throw new Error(buildMissingEntryMessage(registry, options.project, options.service));
  }

  validateExpectedValue(entry, "host", options.host);
  validateExpectedValue(entry, "protocol", options.protocol);
  if (options.port !== undefined && entry.port !== options.port) {
    throw new Error(`Expected port ${options.port}, but registry has ${entry.port} for ${entry.project}/${entry.service}.`);
  }

  const protocolFamily = toProtocolFamily(entry.protocol);
  const shouldCheckAvailability = options.availability !== "skip" && protocolFamily === "tcp";
  const warnings = [];
  if (options.availability !== "skip" && protocolFamily !== "tcp") {
    warnings.push(`Skipping availability check for ${entry.protocol}; use a protocol-specific verifier.`);
  }

  return {
    entry,
    registrySource: registry.sourceOfTruth ?? "registry/ports.registry.json",
    socket: `${protocolFamily}:${normalizeHost(entry.host)}:${entry.port}`,
    shouldCheckAvailability,
    warnings
  };
}

export function findPortEntry(registry, project, service) {
  return registry.entries.find((entry) => entry.project === project && entry.service === service);
}

export function checkTcpPortAvailable(host, port) {
  return new Promise((resolveCheck) => {
    const server = net.createServer();
    server.once("error", (error) => resolveCheck({ available: false, host, port, error: error.code ?? error.message }));
    server.once("listening", () => server.close(() => resolveCheck({ available: true, host, port })));
    server.listen(port, host);
  });
}

export function buildChildEnvironment(entry, baseEnv = process.env) {
  return {
    ...baseEnv,
    HOST: entry.host,
    PORT: String(entry.port),
    DEVGOV_PROJECT: entry.project,
    DEVGOV_SERVICE: entry.service,
    DEVGOV_HOST: entry.host,
    DEVGOV_PORT: String(entry.port),
    DEVGOV_PROTOCOL: entry.protocol,
    DEVGOV_VISIBILITY: entry.visibility
  };
}

function validateExpectedValue(entry, field, expected) {
  if (expected !== undefined && entry[field] !== expected) {
    throw new Error(`Expected ${field} ${expected}, but registry has ${entry[field]} for ${entry.project}/${entry.service}.`);
  }
}

function buildMissingEntryMessage(registry, project, service) {
  const projectEntries = registry.entries
    .filter((entry) => entry.project === project)
    .map((entry) => entry.service)
    .sort();
  const hint = projectEntries.length
    ? `Known services for ${project}: ${projectEntries.join(", ")}`
    : `No entries found for project ${project}.`;
  return `No governed port entry for ${project}/${service}.\n${hint}`;
}

function toProtocolFamily(protocol) {
  return TCP_PROTOCOLS.has(protocol) ? "tcp" : protocol;
}

function normalizeHost(host) {
  if (host === "localhost") return "127.0.0.1";
  if (host === "0.0.0.0" || host === "*") return "*";
  if (host === "[::1]") return "::1";
  return host;
}
