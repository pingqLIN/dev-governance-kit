import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGovernancePulse,
  clearRestartConfirmations,
  consumeRestartConfirmation,
  GOVERNANCE_PANEL_RESOURCE_URI,
  issueRestartConfirmation,
  RESTART_CONFIRMATION_TTL_MS,
  renderGovernancePanelHtml
} from "../scripts/lib/chatgpt-governance-app.mjs";

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
        { id: "bad", controlTargetId: "broken-service", label: "Broken", project: "two", quickTest: { state: "OFFLINE", detail: "connection refused" } }
      ]
    },
    resourceSnapshot: {
      generatedAt: "2026-07-17T00:00:01.000Z",
      expiresAt: "2026-07-17T00:05:01.000Z",
      coordinationState: "NOMINAL",
      registryErrors: [],
      host: { cpuPercent: 12.34, memoryUsedPercent: 67.89 },
      reasons: ["Nominal"]
    },
    approvedControls: [
      { controlTargetId: "broken-service", action: "doctor", approved: true, status: "approved", wrapperRef: "private-doctor.ps1" },
      {
        controlTargetId: "broken-service",
        action: "restart",
        approved: true,
        status: "approved",
        wrapperRef: "private-restart.ps1",
        restartPolicy: {
          permissionBoundary: "operator confirmation",
          backupExpectation: "no persistent state",
          rollbackExpectation: "use the reviewed doctor path"
        }
      }
    ]
  });

  assert.equal(pulse.schema, "devgov.governance-pulse.v1");
  assert.equal(pulse.overallState, "DEGRADED");
  assert.equal(pulse.services.online, 1);
  assert.equal(pulse.services.offline, 1);
  assert.equal(pulse.exceptions[0].id, "bad");
  assert.equal(pulse.governance.protectedRoutes, 1);
  assert.equal(pulse.coordination.memoryPercent, 67.9);
  assert.deepEqual(pulse.controls, [{ controlTargetId: "broken-service", label: "Broken", actions: ["doctor", "restart"] }]);
  assert.doesNotMatch(JSON.stringify(pulse.controls), /wrapperRef|\.ps1|permissionBoundary/);
});

test("restart confirmations are target-bound, short-lived, and single-use", () => {
  clearRestartConfirmations();
  const controls = [{ controlTargetId: "broken-service", label: "Broken", actions: ["doctor", "restart"] }];
  const approvedControls = [{
    controlTargetId: "broken-service",
    action: "restart",
    approved: true,
    status: "approved",
    restartPolicy: {
      permissionBoundary: "operator confirmation",
      backupExpectation: "none required",
      rollbackExpectation: "run doctor"
    }
  }];
  const confirmation = issueRestartConfirmation("broken-service", controls, {
    now: 1_000,
    token: "00000000-0000-4000-8000-000000000001"
  });

  assert.equal(confirmation.expiresAt, new Date(1_000 + RESTART_CONFIRMATION_TTL_MS).toISOString());
  assert.throws(
    () => consumeRestartConfirmation("other-service", confirmation.confirmationToken, approvedControls, { now: 1_001 }),
    /does not match/
  );
  assert.throws(
    () => consumeRestartConfirmation("broken-service", confirmation.confirmationToken, approvedControls, { now: 1_002 }),
    /missing, expired, or already used/
  );

  const expired = issueRestartConfirmation("broken-service", controls, {
    now: 2_000,
    token: "00000000-0000-4000-8000-000000000002"
  });
  assert.throws(
    () => consumeRestartConfirmation("broken-service", expired.confirmationToken, approvedControls, { now: 2_000 + RESTART_CONFIRMATION_TTL_MS }),
    /missing, expired, or already used/
  );
});

test("governance panel matches host styling, stays content-sized, and uses host controls", () => {
  const html = renderGovernancePanelHtml();
  assert.equal(GOVERNANCE_PANEL_RESOURCE_URI, "ui://devgov/governance-pulse.html");
  assert.match(html, /DevGov governance/);
  assert.match(html, /openai:set_globals/);
  assert.match(html, /setWidgetState/);
  assert.match(html, /requestDisplayMode/);
  assert.match(html, /notifyIntrinsicHeight/);
  assert.match(html, /ResizeObserver/);
  assert.match(html, /run_governance_doctor/);
  assert.match(html, /prepare_governance_restart/);
  assert.match(html, /restart_governed_service/);
  assert.match(html, /Confirm restart/);
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /DevGov 治理/);
  assert.match(html, /window\.openai\?\.locale/);
  assert.match(html, /@media\(max-width:460px\)/);
  assert.match(html, /@media\(max-width:300px\)/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /styles\?\.variables/);
  assert.match(html, /--color-background-primary/);
  assert.match(html, /--host-bg:#f7f7f5/);
  assert.match(html, /data-display-mode/);
  assert.match(html, /INLINE_EXCEPTION_LIMIT=2/);
  assert.match(html, /issues\.slice\(0,INLINE_EXCEPTION_LIMIT\)/);
  assert.match(html, /full-detail/);
  assert.match(html, /more in Manage/);
  assert.match(html, /minmax\(0,1fr\)/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.doesNotMatch(html, /100vh|overflow:hidden|overflow-y|background:var\(--panel\)/);
  assert.doesNotMatch(html, /<iframe/i);
});
