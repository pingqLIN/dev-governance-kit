import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import {
  buildResourceCoordinationMemoryHintProposal,
  buildResourceCoordinationSnapshot,
  classifyResourcePressure,
  renderResourceCoordinationMemoryHintProposal,
  renderResourceCoordinationSnapshot
} from "../scripts/lib/resource-coordination-core.mjs";
import {
  validateGovernanceRegistry,
  validateResourceCoordinationRegistry
} from "../scripts/lib/governance-registry-core.mjs";

async function loadRegistry() {
  const text = await fs.readFile("registry/resource-coordination.registry.json", "utf8");
  return JSON.parse(text);
}

test("resource coordination registry validates through the governance dispatcher", async () => {
  const registry = await loadRegistry();
  assert.deepEqual(validateResourceCoordinationRegistry(registry), []);
  assert.deepEqual(validateGovernanceRegistry(registry), []);
});

test("resource coordination registry models exclusive resources and freshness", async () => {
  const registry = await loadRegistry();
  assert.equal(registry.platform.mode, "observe-first");
  assert.ok(registry.freshness.snapshotMaxAgeSeconds > 0);
  assert.ok(registry.exclusiveResources.some((resource) => resource.id === "browser-automation-profile"));
  assert.ok(registry.exclusiveResources.some((resource) => resource.id === "gpu-3d-rendering"));
  assert.ok(registry.exclusiveResources.some((resource) => resource.id === "foreground-screen-control"));
  assert.ok(registry.channels.some((channel) => channel.id === "codex-memory-resource-hints" && channel.kind === "memory-hint"));
  assert.ok(registry.policies.some((policy) => policy.id === "memory-hints-are-soft-awareness"));
  assert.ok(registry.policies.some((policy) => policy.id === "memory-update-is-explicit-operator-gated"));
  assert.ok(registry.stages.some((stage) => stage.id === "memory-hint-review"));
  assert.ok(registry.policies.some((policy) => policy.id === "freshness-required"));
});

test("resource pressure classifier marks high host pressure as contention possible", () => {
  const pressure = classifyResourcePressure({
    cpuPercent: 94,
    memoryUsedPercent: 72,
    developmentProcessCount: 2
  });

  assert.equal(pressure.state, "CONGESTED");
  assert.equal(pressure.disposition, "environment-contention-possible");
  assert.match(pressure.reasons.join(" "), /CPU pressure is high/);
});

test("resource coordination snapshot is time-bounded and renderable", async () => {
  const snapshot = await buildResourceCoordinationSnapshot(".", {
    generatedAt: "2026-07-09T00:00:00.000Z",
    hostSnapshot: {
      sampledAt: "2026-07-09T00:00:00.000Z",
      sampleMs: 100,
      cpuPercent: 12,
      memoryUsedPercent: 44,
      totalMemoryBytes: 100,
      freeMemoryBytes: 56,
      processFamilies: [],
      developmentProcessCount: 0,
      notes: "test fixture"
    },
    governanceSnapshot: {
      registeredPorts: 1,
      onboardingEntries: 1,
      localAgents: 1,
      approvedControlActions: 1,
      notes: "test fixture"
    }
  });

  assert.equal(snapshot.schema, "devgov.resource-coordination.snapshot.v1");
  assert.equal(snapshot.coordinationState, "NOMINAL");
  assert.equal(snapshot.expiresAt, "2026-07-09T00:05:00.000Z");
  assert.equal(snapshot.exclusiveResources.length >= 3, true);
  assert.match(renderResourceCoordinationSnapshot(snapshot), /Exclusive Resources/);
});

test("resource coordination memory hint proposal is soft and time-bounded", () => {
  const proposal = buildResourceCoordinationMemoryHintProposal({
    generatedAt: "2026-07-10T00:00:00.000Z",
    project: "devgov",
    resourceClass: "gpu-rendering",
    intent: "Canvas verification smoke check",
    confidence: "declared",
    source: "codex-task",
    validForSeconds: 600
  });

  assert.equal(proposal.schema, "devgov.resource-coordination.memory-hint-proposal.v1");
  assert.equal(proposal.mode, "proposal-only");
  assert.equal(proposal.proposedMemoryHint.kind, "rcg-short-term-resource-hint");
  assert.equal(proposal.proposedMemoryHint.authority, "soft-hint-only");
  assert.equal(proposal.proposedMemoryHint.afterExpiry, "historical-only");
  assert.equal(proposal.proposedMemoryHint.validUntil, "2026-07-10T00:10:00.000Z");
  assert.equal(proposal.reviewGateTemplate, "templates/CODEX.memory.rcg-update-gate.md");
  assert.equal(proposal.externalReviewGate, "memory-field:research/handoff/rcg-memory-update-gate.md");
  assert.equal(proposal.handoffReference.noDevGovWrite, true);
  assert.equal(proposal.handoffReference.consumerAction, "external-runtime-owned");
  assert.match(proposal.reviewGate.requiredOperatorIntent, /explicitly ask to hand the reviewed RCG proposal/);
  assert.match(proposal.reviewGate.deniedShortcuts.join(" "), /generating a proposal/);
  assert.match(renderResourceCoordinationMemoryHintProposal(proposal), /does not write to Codex memory/);
  assert.match(renderResourceCoordinationMemoryHintProposal(proposal), /DevGov Handoff Reference/);
  assert.match(renderResourceCoordinationMemoryHintProposal(proposal), /Required Checks/);
  assert.match(renderResourceCoordinationMemoryHintProposal(proposal), /soft-hint-only/);
});

test("resource coordination memory hint proposal rejects unsafe text", () => {
  assert.throws(
    () => buildResourceCoordinationMemoryHintProposal({
      project: "Q:\\Projects\\private",
      intent: "Browser automation"
    }),
    /machine-local paths/
  );

  assert.throws(
    () => buildResourceCoordinationMemoryHintProposal({
      project: "devgov",
      intent: "Use sk-1234567890abcdefghijklmnop"
    }),
    /credential-like values/
  );
});

test("resource coordination registry rejects machine-local paths", async () => {
  const registry = await loadRegistry();
  const invalid = {
    ...registry,
    policies: [
      ...registry.policies,
      {
        ...registry.policies[0],
        id: "invalid-local-path",
        notes: "See Q:\\Projects\\private"
      }
    ]
  };
  const errors = validateResourceCoordinationRegistry(invalid);
  assert.ok(errors.some((error) => error.includes("machine-local")));
});
