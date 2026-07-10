import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import {
  buildAgentInstructionIndex,
  buildResourceCoordinationOverlayProposal,
  renderAgentInstructionTextIndex,
  renderResourceCoordinationOverlayProposal,
  validateAgentInstructionsRegistry
} from "../scripts/lib/agent-instructions-core.mjs";
import { validateGovernanceRegistry } from "../scripts/lib/governance-registry-core.mjs";

const REQUIRED_SCOPES = [
  "platform-runtime",
  "global-home",
  "workspace",
  "repo-local",
  "subtree",
  "task-request"
];

async function loadRegistry() {
  const text = await fs.readFile("registry/agent-instructions.registry.json", "utf8");
  return JSON.parse(text);
}

test("agent instruction registry validates through the governance registry dispatcher", async () => {
  const registry = await loadRegistry();
  assert.deepEqual(validateAgentInstructionsRegistry(registry), []);
  assert.deepEqual(validateGovernanceRegistry(registry), []);
});

test("agent instruction registry covers all governance scope layers", async () => {
  const registry = await loadRegistry();
  const scopes = new Set(registry.layers.map((layer) => layer.scope));
  for (const scope of REQUIRED_SCOPES) {
    assert.ok(scopes.has(scope), `missing ${scope}`);
  }

  const indexedLayers = new Set(buildAgentInstructionIndex(registry).layers.map((layer) => layer.scope));
  for (const scope of REQUIRED_SCOPES) {
    assert.ok(indexedLayers.has(scope), `index missing ${scope}`);
  }
});

test("agent instruction text index is queryable by scope, type, and evidence", async () => {
  const registry = await loadRegistry();
  const text = renderAgentInstructionTextIndex(buildAgentInstructionIndex(registry));
  assert.match(text, /scope=platform-runtime/);
  assert.match(text, /scope=global-home/);
  assert.match(text, /scope=workspace/);
  assert.match(text, /scope=repo-local/);
  assert.match(text, /scope=subtree/);
  assert.match(text, /scope=task-request/);
  assert.match(text, /type=external-review-input/);
  assert.match(text, /type=context-budget/);
  assert.match(text, /agent\.tool\.governed-port-preflight/);
  assert.match(text, /agent\.workflow\.resource-contention-diagnostic/);
  assert.match(text, /agent\.tool\.resource-coordination-agents-overlay/);
  assert.match(text, /agent\.tool\.resource-coordination-memory-hint-proposal/);
  assert.match(text, /agent\.safety\.resource-coordination-memory-update-gate/);
  assert.match(text, /agent\.safety\.exclusive-resource-registration/);
  assert.match(text, /evidence=AGENTS\.md#UniText Coordination/);
  assert.match(text, /evidence=AGENTS\.md#Context Budget Governance/);
  assert.match(text, /evidence=AGENTS\.md#Shared Resource Coordination/);
});

test("agent instruction evidence anchors exist in AGENTS.md", async () => {
  const registry = await loadRegistry();
  const agentsText = await fs.readFile("AGENTS.md", "utf8");
  const evidenceAnchors = registry.entries
    .map((entry) => entry.evidence)
    .filter((evidence) => evidence.startsWith("AGENTS.md#"))
    .map((evidence) => evidence.slice("AGENTS.md#".length));

  for (const anchor of evidenceAnchors) {
    assert.match(agentsText, new RegExp(`^## ${escapeRegExp(anchor)}$`, "m"), `missing AGENTS heading ${anchor}`);
  }
});

test("AGENTS.md remains the single authoritative runtime source", async () => {
  const registry = await loadRegistry();
  assert.equal(registry.sourceOfTruth, "AGENTS.md");
  assert.ok(registry.entries.some((entry) => entry.id === "agent.authority.single-runtime-source"));
  assert.ok(registry.entries.every((entry) => entry.source !== "AGENTS.zh-tw.md"));
  assert.ok(registry.entries.every((entry) => !entry.evidence.startsWith("AGENTS.zh-tw.md#")));
});

test("resource coordination overlay proposal detects missing thin overlay", () => {
  const proposal = buildResourceCoordinationOverlayProposal("# AGENTS.md\n\n## Project Rules\n\nUse local tests.\n", {
    generatedAt: "2026-07-09T00:00:00.000Z",
    target: "tests/fixtures/minimal/AGENTS.md"
  });

  assert.equal(proposal.status, "proposal-required");
  assert.ok(proposal.findings.some((finding) => finding.id === "shared-resource-heading" && finding.status === "missing"));
  assert.match(proposal.proposedInsertion, /## Shared Resource Coordination/);
  assert.match(renderResourceCoordinationOverlayProposal(proposal), /proposal-only/);
});

test("resource coordination overlay template satisfies scanner markers", async () => {
  const template = await fs.readFile("templates/AGENTS.resource-coordination.md", "utf8");
  const proposal = buildResourceCoordinationOverlayProposal(template, {
    generatedAt: "2026-07-09T00:00:00.000Z",
    target: "templates/AGENTS.resource-coordination.md"
  });

  assert.equal(proposal.status, "covered");
  assert.equal(proposal.proposedInsertion, "");
});

test("global-home planning responsibility is explicit and review-gated", async () => {
  const registry = await loadRegistry();
  const planning = registry.entries.find((entry) => entry.id === "agent.workflow.global-management-planning");
  const boundary = registry.entries.find((entry) => entry.id === "agent.data.global-home-boundary");

  assert.equal(planning?.layer, "global-home");
  assert.equal(planning?.type, "workflow-control");
  assert.match(planning?.requirement ?? "", /Global-layer planning surface/);
  assert.match(planning?.enforcement ?? "", /reviewed diff/);
  assert.equal(boundary?.layer, "global-home");
  assert.match(boundary?.requirement ?? "", /without copying host-specific/);
});

test("context budget governance is routed and lazy-loaded", async () => {
  const registry = await loadRegistry();
  const defaultRoute = registry.entries.find((entry) => entry.id === "agent.context.default-no-tool");
  const lazySkill = registry.entries.find((entry) => entry.id === "agent.context.skill-lazy-loading");
  const audit = registry.entries.find((entry) => entry.id === "agent.verify.context-budget-audit");

  assert.equal(defaultRoute?.type, "context-budget");
  assert.equal(defaultRoute?.layer, "global-home");
  assert.match(defaultRoute?.requirement ?? "", /Default to no-tool/);
  assert.match(defaultRoute?.enforcement ?? "", /L0 through L4/);
  assert.equal(lazySkill?.type, "context-budget");
  assert.match(lazySkill?.requirement ?? "", /compact skill trigger metadata/);
  assert.equal(audit?.type, "verification");
  assert.match(audit?.enforcement ?? "", /scan:context-budget/);
});

test("agent instruction registry rejects machine-local paths", async () => {
  const registry = await loadRegistry();
  const invalid = {
    ...registry,
    entries: [
      ...registry.entries,
      {
        ...registry.entries[0],
        id: "agent.invalid.local-path",
        notes: "See Q:\\Projects\\private"
      }
    ]
  };
  const errors = validateAgentInstructionsRegistry(invalid);
  assert.ok(errors.some((error) => error.includes("machine-local")));
});

test("agent instruction registry rejects entries with unknown layers", async () => {
  const registry = await loadRegistry();
  const invalid = {
    ...registry,
    entries: [
      {
        ...registry.entries[0],
        id: "agent.invalid.layer",
        layer: "missing-layer"
      }
    ]
  };
  const errors = validateAgentInstructionsRegistry(invalid);
  assert.ok(errors.some((error) => error.includes("unknown layer missing-layer")));
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
