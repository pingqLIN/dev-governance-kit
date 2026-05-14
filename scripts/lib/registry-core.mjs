import fs from "node:fs/promises";

const VALID_VISIBILITY = new Set(["local", "lan", "public", "docker-internal"]);
const VALID_PROTOCOL = new Set(["tcp", "udp", "http", "https", "ws", "wss"]);
const REQUIRED_ENTRY_FIELDS = ["project", "service", "port", "host", "visibility", "protocol", "source", "notes"];

export async function loadRegistry(registryPath) {
  const text = await fs.readFile(registryPath, "utf8");
  return JSON.parse(text);
}

export function validateRegistry(registry) {
  const errors = [];
  if (registry.schema !== "dev-governance-kit.ports.registry.v1") {
    errors.push("registry.schema must be dev-governance-kit.ports.registry.v1");
  }
  if (!registry.ranges || typeof registry.ranges !== "object") {
    errors.push("registry.ranges is required");
  }
  if (!Array.isArray(registry.entries)) {
    errors.push("registry.entries must be an array");
    return errors;
  }

  validateRanges(registry.ranges, errors);
  validateEntries(registry.entries, registry.ranges ?? {}, errors);
  return errors;
}

function validateRanges(ranges, errors) {
  const normalizedRanges = [];
  for (const [name, range] of Object.entries(ranges ?? {})) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
      errors.push(`range ${name} must include integer start and end`);
      continue;
    }
    if (range.start < 1 || range.end > 65535 || range.start > range.end) {
      errors.push(`range ${name} must stay within valid port bounds`);
      continue;
    }
    normalizedRanges.push({ name, start: range.start, end: range.end });
  }

  for (let index = 0; index < normalizedRanges.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < normalizedRanges.length; nextIndex += 1) {
      const left = normalizedRanges[index];
      const right = normalizedRanges[nextIndex];
      if (left.start <= right.end && right.start <= left.end) {
        errors.push(`range ${left.name} overlaps range ${right.name}`);
      }
    }
  }
}

function validateEntries(entries, ranges, errors) {
  const seen = [];

  for (const [index, entry] of entries.entries()) {
    const label = `entries[${index}]`;
    for (const field of REQUIRED_ENTRY_FIELDS) {
      if (entry[field] === undefined || entry[field] === "") {
        errors.push(`${label}.${field} is required`);
      }
    }

    if (!Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535) {
      errors.push(`${label}.port must be an integer from 1 to 65535`);
    }
    if (typeof entry.host !== "string" || !entry.host.trim()) {
      errors.push(`${label}.host must be a non-empty string`);
    }
    if (typeof entry.project !== "string" || !entry.project.trim()) {
      errors.push(`${label}.project must be a non-empty string`);
    }
    if (typeof entry.service !== "string" || !entry.service.trim()) {
      errors.push(`${label}.service must be a non-empty string`);
    }
    if (typeof entry.source !== "string" || !entry.source.trim()) {
      errors.push(`${label}.source must be a non-empty string`);
    }
    if (typeof entry.notes !== "string" || !entry.notes.trim()) {
      errors.push(`${label}.notes must be a non-empty string`);
    }
    for (const field of Object.keys(entry)) {
      if (typeof entry[field] === "string" && looksMachineLocal(entry[field])) {
        errors.push(`${label}.${field} must not contain machine-local paths or MCP aliases`);
      }
    }
    if (!VALID_VISIBILITY.has(entry.visibility)) {
      errors.push(`${label}.visibility must be one of ${[...VALID_VISIBILITY].join(", ")}`);
    }
    if (!VALID_PROTOCOL.has(entry.protocol)) {
      errors.push(`${label}.protocol must be one of ${[...VALID_PROTOCOL].join(", ")}`);
    }
    if ((entry.host === "0.0.0.0" || entry.host === "*") && entry.visibility === "local") {
      errors.push(`${label} wildcard host cannot use local visibility`);
    }
    if ((entry.host === "0.0.0.0" || entry.host === "*") && !String(entry.notes ?? "").trim()) {
      errors.push(`${label} wildcard host requires notes`);
    }

    for (const prior of seen) {
      if (entriesOverlap(prior.entry, entry)) {
        errors.push(`${label} overlaps ${prior.label} on ${socketLabel(entry)}`);
      }
    }
    seen.push({ label, entry });

    if (entry.range && !ranges[entry.range]) {
      errors.push(`${label}.range references unknown range ${entry.range}`);
    }
    if (entry.range && ranges[entry.range]) {
      const range = ranges[entry.range];
      if (entry.port < range.start || entry.port > range.end) {
        errors.push(`${label}.port is outside declared range ${entry.range}`);
      }
    }
  }
}

function entriesOverlap(left, right) {
  return left.port === right.port
    && protocolFamily(left.protocol) === protocolFamily(right.protocol)
    && hostsOverlap(left.host, right.host);
}

function protocolFamily(protocol) {
  if (["http", "https", "ws", "wss"].includes(protocol)) {
    return "tcp";
  }
  return protocol;
}

function hostsOverlap(left, right) {
  const normalizedLeft = normalizeHost(left);
  const normalizedRight = normalizeHost(right);
  return normalizedLeft === normalizedRight || normalizedLeft === "*" || normalizedRight === "*";
}

function normalizeHost(host) {
  if (host === "localhost") return "127.0.0.1";
  if (host === "0.0.0.0" || host === "*") return "*";
  if (host === "[::1]") return "::1";
  return host;
}

function socketLabel(entry) {
  return `${protocolFamily(entry.protocol)}:${normalizeHost(entry.host)}:${entry.port}`;
}

function looksMachineLocal(value) {
  return /(?:^|[\s"'`(])(?:[A-Za-z]:[\\/]|\\\\|windows-projects:|linux-mirror:)/i.test(value);
}
