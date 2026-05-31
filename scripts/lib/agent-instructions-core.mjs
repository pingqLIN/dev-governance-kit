const VALID_STATUS = new Set(["candidate", "approved", "blocked", "deprecated"]);
const VALID_SCOPES = new Set([
  "platform-runtime",
  "global-home",
  "workspace",
  "repo-local",
  "subtree",
  "task-request"
]);
const REQUIRED_SCOPE_IDS = [...VALID_SCOPES];
const REQUIRED_ITEM_TYPES = new Set([
  "scope-layer",
  "authority-order",
  "safety-gate",
  "data-contract",
  "workflow-control",
  "tool-entry",
  "verification",
  "interoperability",
  "external-review-input"
]);

export function validateAgentInstructionsRegistry(registry) {
  const errors = [];
  if (registry.schema !== "devgov.agent-instructions.registry.v1") {
    errors.push("registry.schema must be devgov.agent-instructions.registry.v1");
  }
  rejectMachineLocalStrings(registry, "registry", errors);
  if (!Array.isArray(registry.layers)) errors.push("registry.layers must be an array");
  if (!Array.isArray(registry.itemTypes)) errors.push("registry.itemTypes must be an array");
  if (!Array.isArray(registry.entries)) errors.push("registry.entries must be an array");
  if (errors.length) return errors;

  const layerIds = validateLayers(registry.layers, errors);
  const itemTypeIds = validateItemTypes(registry.itemTypes, errors);
  validateEntries(registry.entries, layerIds, itemTypeIds, errors);
  return errors;
}

export function buildAgentInstructionIndex(registry) {
  return {
    schema: "devgov.agent-instructions.index.v1",
    generatedAt: new Date().toISOString(),
    sourceSchema: registry.schema,
    sourceOfTruth: registry.sourceOfTruth,
    layers: registry.layers.map((layer) => ({
      id: layer.id,
      scope: layer.scope,
      precedence: layer.precedence,
      appliesTo: layer.appliesTo,
      status: layer.status
    })),
    records: registry.entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      layer: entry.layer,
      appliesTo: entry.appliesTo,
      requirement: entry.requirement,
      enforcement: entry.enforcement,
      evidence: entry.evidence,
      status: entry.status,
      source: entry.source,
      notes: entry.notes,
      searchText: [
        entry.id,
        entry.type,
        entry.layer,
        entry.appliesTo,
        entry.requirement,
        entry.enforcement,
        entry.evidence,
        entry.status,
        entry.source,
        entry.notes
      ].join(" ").toLowerCase()
    }))
  };
}

export function renderAgentInstructionTextIndex(index) {
  const lines = [
    "# DevGov Agent Instruction Index",
    "",
    `schema: ${index.schema}`,
    `generatedAt: ${index.generatedAt}`,
    `sourceSchema: ${index.sourceSchema}`,
    `sourceOfTruth: ${index.sourceOfTruth}`,
    "",
    "## Layers",
    ""
  ];

  for (const layer of [...index.layers].sort((left, right) => left.precedence - right.precedence)) {
    lines.push(
      `- id=${layer.id} scope=${layer.scope} precedence=${layer.precedence} status=${layer.status}`,
      `  appliesTo=${layer.appliesTo}`
    );
  }

  lines.push("", "## Records", "");
  for (const record of index.records) {
    lines.push(
      `- id=${record.id} type=${record.type} layer=${record.layer} status=${record.status}`,
      `  appliesTo=${record.appliesTo}`,
      `  requirement=${record.requirement}`,
      `  enforcement=${record.enforcement}`,
      `  evidence=${record.evidence}`,
      `  source=${record.source}`,
      `  notes=${record.notes}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function validateLayers(layers, errors) {
  const ids = new Set();
  const scopes = new Set();
  const precedences = new Set();
  for (const [index, layer] of layers.entries()) {
    const label = `layers[${index}]`;
    requireStrings(layer, ["id", "scope", "appliesTo", "source", "status", "notes"], label, errors);
    rejectMachineLocalStrings(layer, label, errors);
    if (ids.has(layer.id)) errors.push(`${label}.id duplicates another layer`);
    ids.add(layer.id);
    if (scopes.has(layer.scope)) errors.push(`${label}.scope duplicates another layer`);
    scopes.add(layer.scope);
    if (!VALID_SCOPES.has(layer.scope)) {
      errors.push(`${label}.scope must be one of ${[...VALID_SCOPES].join(", ")}`);
    }
    if (!Number.isInteger(layer.precedence) || layer.precedence < 0) {
      errors.push(`${label}.precedence must be a non-negative integer`);
    } else if (precedences.has(layer.precedence)) {
      errors.push(`${label}.precedence duplicates another layer`);
    } else {
      precedences.add(layer.precedence);
    }
    if (!VALID_STATUS.has(layer.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }

  for (const scope of REQUIRED_SCOPE_IDS) {
    if (!scopes.has(scope)) errors.push(`layers must include scope ${scope}`);
  }
  return ids;
}

function validateItemTypes(itemTypes, errors) {
  const ids = new Set();
  for (const [index, itemType] of itemTypes.entries()) {
    const label = `itemTypes[${index}]`;
    requireStrings(itemType, ["id", "label", "description", "governanceUse", "status", "notes"], label, errors);
    rejectMachineLocalStrings(itemType, label, errors);
    if (ids.has(itemType.id)) errors.push(`${label}.id duplicates another item type`);
    ids.add(itemType.id);
    if (!VALID_STATUS.has(itemType.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }

  for (const type of REQUIRED_ITEM_TYPES) {
    if (!ids.has(type)) errors.push(`itemTypes must include ${type}`);
  }
  return ids;
}

function validateEntries(entries, layerIds, itemTypeIds, errors) {
  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `entries[${index}]`;
    requireStrings(entry, [
      "id",
      "type",
      "layer",
      "appliesTo",
      "requirement",
      "enforcement",
      "evidence",
      "status",
      "source",
      "notes"
    ], label, errors);
    rejectMachineLocalStrings(entry, label, errors);
    if (ids.has(entry.id)) errors.push(`${label}.id duplicates another entry`);
    ids.add(entry.id);
    if (!itemTypeIds.has(entry.type)) errors.push(`${label}.type references unknown item type ${entry.type}`);
    if (!layerIds.has(entry.layer)) errors.push(`${label}.layer references unknown layer ${entry.layer}`);
    if (!VALID_STATUS.has(entry.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUS].join(", ")}`);
    }
  }
}

function requireStrings(entry, fields, label, errors) {
  for (const field of fields) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      errors.push(`${label}.${field} must be a non-empty string`);
    }
  }
}

function rejectMachineLocalStrings(value, label, errors) {
  if (typeof value === "string") {
    if (looksMachineLocal(value)) errors.push(`${label} must not contain machine-local paths or MCP aliases`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedLabel = Array.isArray(value) ? `${label}[${key}]` : `${label}.${key}`;
    rejectMachineLocalStrings(nested, nestedLabel, errors);
  }
}

function looksMachineLocal(value) {
  return /(?:^|[\s"'`(])(?:[A-Za-z]:[\\/]|\\\\|windows-projects:|linux-mirror:)/i.test(value);
}
