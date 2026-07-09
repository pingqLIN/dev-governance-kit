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
  "context-budget",
  "verification",
  "interoperability",
  "external-review-input"
]);

export const RESOURCE_COORDINATION_THIN_OVERLAY_SNIPPET = `## Shared Resource Coordination

This project follows DevGov shared-resource coordination.

Before diagnosing lag, timeout, slow browser automation, sluggish UI feedback, or delayed tool responses as a project failure, check current DevGov resource-coordination status and classify the observation as \`target-unhealthy\`, \`environment-contention\`, or \`unknown-degraded\`.

Before using exclusive or capacity-limited resources such as browser profiles, DevTools sessions, GPU-heavy rendering, 3D/WebGL/WebGPU, foreground screen control, keyboard, pointer, simulator, or display control, register a sanitized time-bound claim through the DevGov resource-coordination surface.

Stale resource snapshots or claims are historical evidence only. Refresh them before using them for current diagnosis, ownership, or scheduling decisions.

### Project Exclusive Resources

Declare only resources this project can realistically occupy. Use \`None known\` when the project does not use that resource class.

- Browser automation: \`<describe browser profile, extension state, DevTools, or None known>\`
- GPU/rendering/model inference: \`<describe WebGL/WebGPU/video/local model work, or None known>\`
- Foreground control: \`<describe screen, pointer, keyboard, simulator, display use, or None known>\`

Generated resource-coordination reports are evidence, not policy. Apply this overlay through a reviewed AGENTS diff; do not bulk-apply it to projects automatically.
`;

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

export function buildResourceCoordinationOverlayProposal(agentsText, options = {}) {
  const findings = [
    buildFinding({
      id: "shared-resource-heading",
      label: "Shared Resource Coordination heading",
      required: true,
      ok: /^## Shared Resource Coordination\s*$/m.test(agentsText),
      missing: "Add a top-level Shared Resource Coordination section."
    }),
    buildFinding({
      id: "contention-diagnosis-model",
      label: "Contention diagnosis model",
      required: true,
      ok: containsAll(agentsText, ["target-unhealthy", "environment-contention", "unknown-degraded"]),
      missing: "State the three-way classification for degraded observations."
    }),
    buildFinding({
      id: "exclusive-resource-registration",
      label: "Exclusive resource registration",
      required: true,
      ok: /browser profile|browser profiles|DevTools|GPU|WebGL|WebGPU|foreground screen|pointer|keyboard|simulator|display/i.test(agentsText)
        && /register|claim|登記/i.test(agentsText),
      missing: "Require sanitized time-bound claims before browser, GPU, or foreground-control use."
    }),
    buildFinding({
      id: "freshness-contract",
      label: "Freshness contract",
      required: true,
      ok: /stale|refresh|expiry|expires|過期|時效/i.test(agentsText)
        && /snapshot|claim|status|狀態/i.test(agentsText),
      missing: "Treat stale snapshots or claims as historical evidence only."
    }),
    buildFinding({
      id: "project-exclusive-resources",
      label: "Project-specific exclusive resources",
      required: false,
      ok: /^### Project Exclusive Resources\s*$/m.test(agentsText),
      missing: "Declare project-specific browser, GPU/rendering/model, and foreground-control use."
    })
  ];

  const missingRequired = findings.some((finding) => finding.required && finding.status === "missing");
  const missingRecommended = findings.some((finding) => !finding.required && finding.status === "missing");
  const status = missingRequired ? "proposal-required" : missingRecommended ? "review-recommended" : "covered";

  return {
    schema: "devgov.agent-instructions.resource-coordination-overlay-proposal.v1",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    target: options.target ?? "AGENTS.md",
    template: options.template ?? "templates/AGENTS.resource-coordination.md",
    mode: "manual-proposal-only",
    status,
    findings,
    recommendation: recommendationForStatus(status),
    proposedInsertion: status === "covered" ? "" : RESOURCE_COORDINATION_THIN_OVERLAY_SNIPPET
  };
}

export function renderResourceCoordinationOverlayProposal(proposal) {
  const lines = [
    "# Resource Coordination AGENTS Overlay Proposal",
    "",
    `schema: ${proposal.schema}`,
    `generatedAt: ${proposal.generatedAt}`,
    `target: ${proposal.target}`,
    `template: ${proposal.template}`,
    `mode: ${proposal.mode}`,
    `status: ${proposal.status}`,
    "",
    "This report is proposal-only. It does not modify the target AGENTS file or apply changes to any project.",
    "",
    "## Findings",
    "",
    "| ID | Required | Status | Detail |",
    "| --- | --- | --- | --- |"
  ];

  for (const finding of proposal.findings) {
    lines.push(`| ${finding.id} | ${finding.required ? "yes" : "no"} | ${finding.status} | ${finding.message} |`);
  }

  lines.push("", "## Recommendation", "", proposal.recommendation);

  if (proposal.proposedInsertion) {
    lines.push(
      "",
      "## Suggested Manual Overlay",
      "",
      "Review and adapt this snippet before adding it to a project AGENTS file:",
      "",
      "```md",
      proposal.proposedInsertion.trimEnd(),
      "```"
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

function buildFinding({ id, label, required, ok, missing }) {
  return {
    id,
    label,
    required,
    status: ok ? "ok" : "missing",
    message: ok ? `${label} is present.` : missing
  };
}

function containsAll(text, values) {
  return values.every((value) => text.includes(value));
}

function recommendationForStatus(status) {
  if (status === "covered") {
    return "No shared-resource overlay insertion is proposed. Review project-specific resource declarations only when the project changes.";
  }
  if (status === "review-recommended") {
    return "Core shared-resource coordination rules are present. Review whether the project should declare its own exclusive resources.";
  }
  return "Add the thin resource-coordination overlay through a reviewed AGENTS diff before relying on this project for concurrent-resource coordination.";
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
