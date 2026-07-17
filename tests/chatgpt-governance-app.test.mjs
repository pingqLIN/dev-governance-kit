import assert from "node:assert/strict";
import test from "node:test";
import { buildGovernancePulse, GOVERNANCE_PANEL_RESOURCE_URI, renderGovernancePanelHtml } from "../scripts/lib/chatgpt-governance-app.mjs";

test("governance pulse keeps only high-value runtime and governance signals", () => {
  const pulse = buildGovernancePulse({
    state: {
      app: { url: "http://127.0.0.1:3000" },
      summary: { registeredProjects: 25, ports: 21, localAgents: 3 },
      publicRoutes: [
        { status: "candidate", accessRequired: true },
        { status: "approved", accessRequired: false }
      ]
    },
    serviceStatus: {
      generatedAt: "2026-07-17T00:00:00.000Z",
      services: [
        { id: "ok", label: "Healthy", project: "one", quickTest: { state: "ONLINE", latencyMs: 12 } },
        { id: "bad", label: "Broken", project: "two", quickTest: { state: "OFFLINE", detail: "connection refused" } }
      ]
    },
    resourceSnapshot: {
      generatedAt: "2026-07-17T00:00:01.000Z",
      expiresAt: "2026-07-17T00:05:01.000Z",
      coordinationState: "NOMINAL",
      registryErrors: [],
      host: { cpuPercent: 12.34, memoryUsedPercent: 67.89 },
      reasons: ["Nominal"]
    }
  });

  assert.equal(pulse.schema, "devgov.governance-pulse.v1");
  assert.equal(pulse.overallState, "DEGRADED");
  assert.equal(pulse.services.online, 1);
  assert.equal(pulse.services.offline, 1);
  assert.equal(pulse.exceptions[0].id, "bad");
  assert.equal(pulse.governance.protectedRoutes, 1);
  assert.equal(pulse.coordination.memoryPercent, 67.9);
});

test("governance panel is responsive and uses ChatGPT host capabilities", () => {
  const html = renderGovernancePanelHtml();
  assert.equal(GOVERNANCE_PANEL_RESOURCE_URI, "ui://devgov/governance-pulse.html");
  assert.match(html, /Governance Pulse/);
  assert.match(html, /openai:set_globals/);
  assert.match(html, /setWidgetState/);
  assert.match(html, /requestDisplayMode/);
  assert.match(html, /治理脈動/);
  assert.match(html, /window\.openai\?\.locale/);
  assert.match(html, /@media\(max-width:620px\)/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.doesNotMatch(html, /<iframe/i);
});
