import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import {
  buildGovernancePulse,
  clearRestartConfirmations,
  consumeRestartConfirmation,
  GOVERNANCE_PANEL_RESOURCE_URI,
  GOVERNANCE_PANEL_VERSION,
  issueRestartConfirmation,
  RESTART_CONFIRMATION_TTL_MS,
  renderGovernancePanelHtml
} from "../scripts/lib/chatgpt-governance-app.mjs";
import {
  buildGovernanceWorkspaceView,
  buildWorkspacePathPrediction,
  GOVERNANCE_WORKSPACE_VIEWS
} from "../scripts/lib/governance-workspace-core.mjs";

test("plugin manifest version matches the governance MCP App version", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../plugins/devgov-governance-panel/.codex-plugin/plugin.json", import.meta.url),
    "utf8"
  ));
  assert.equal(manifest.version, GOVERNANCE_PANEL_VERSION);
});

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

test("governance panel renders the finite Fusion Depth Drawer with host controls", () => {
  const html = renderGovernancePanelHtml();
  const embeddedScript = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(embeddedScript);
  assert.doesNotThrow(() => new Script(embeddedScript));
  assert.equal(GOVERNANCE_PANEL_RESOURCE_URI, "ui://devgov/governance-pulse.html");
  assert.match(html, />DevGov</);
  assert.match(html, /openai:set_globals/);
  assert.match(html, /setWidgetState/);
  assert.match(html, /requestDisplayMode/);
  assert.match(html, /notifyIntrinsicHeight/);
  assert.match(html, /ResizeObserver/);
  assert.match(html, /run_governance_doctor/);
  assert.match(html, /prepare_governance_restart/);
  assert.match(html, /restart_governed_service/);
  assert.match(html, /query_governance_workspace/);
  assert.match(html, /predict_governance_workspace_path/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /class="depth-dock"/);
  assert.match(html, /class="depth-scene" id="depth-scene"/);
  assert.match(html, /class="transition-stack" id="transition-stack"/);
  assert.match(html, /class="transition-sheet"/);
  assert.match(html, /const VIEW_STACK=/);
  assert.match(html, /data-depth-direction=/);
  assert.match(html, /data-depth-phase/);
  assert.match(html, /beginDepthTransition/);
  assert.match(html, /animateDepthPlane/);
  assert.match(html, /clearDepthTransition/);
  assert.match(html, /viewRequestSequence/);
  assert.match(html, /requestId!==viewRequestSequence/);
  assert.match(html, /pendingDepthFrom/);
  assert.match(html, /window\.openai\?\.locale/);
  assert.match(html, /@media\(max-width:540px\)/);
  assert.match(html, /@media\(max-width:340px\)/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /styles\?\.variables/);
  assert.match(html, /--color-background-primary/);
  assert.match(html, /--host-bg:#f7f7f5/);
  assert.match(html, /data-display-mode/);
  assert.match(html, /\.shell\{height:620px/);
  assert.match(html, /data-display-mode="fullscreen"\] \.shell\{height:720px/);
  assert.match(html, /html,body\{[^}]*overflow:hidden/);
  assert.match(html, /\.view-button\{[^}]*min-height:26px/);
  assert.match(html, /\.depth-dock\{[^}]*overflow-y:auto/);
  assert.match(html, /scrollbar-width:none/);
  assert.match(html, /\.depth-dock::-webkit-scrollbar\{display:none\}/);
  assert.match(html, /touch-action:pan-y/);
  assert.match(html, /\.depth-dock,\.depth-dock \.view-button\{cursor:grab/);
  assert.match(html, /alignActiveDepth/);
  assert.match(html, /scrollIntoView\(\{block:"nearest"/);
  assert.match(html, /window\.addEventListener\("pointermove"/);
  assert.match(html, /window\.addEventListener\("pointerup",endDepthDockDrag\)/);
  assert.match(html, /window\.addEventListener\("blur",\(\)=>endDepthDockDrag\(\)\)/);
  assert.doesNotMatch(html, /setPointerCapture|releasePointerCapture/);
  assert.match(html, /suppressDepthDockClickUntil/);
  assert.match(html, /DEPTH_DRAG_CLICK_GUARD_MS=140/);
  assert.match(html, /class="active-sheet" id="active-sheet"/);
  assert.match(html, /\.active-sheet\{[^}]*display:block/);
  assert.match(html, /\.workspace\[data-predictor="true"\]\{grid-template-rows:auto auto auto auto minmax\(0,1fr\) auto\}/);
  assert.match(html, /workspace"\)\.dataset\.predictor=String\(predictorActive\)/);
  assert.match(html, /class="actions-cell"/);
  assert.match(html, /th\.actions-cell,.data-table td\.actions-cell\{display:table-cell\}/);
  assert.match(html, /translate3d\(11px,-6px,-26px\) scale\(\.978\)/);
  assert.match(html, /translate3d\(20px,-11px,-52px\) scale\(\.956\)/);
  assert.match(html, /rotateY\("\+rotationY\+"deg\)/);
  assert.match(html, /compact\?10:12/);
  assert.match(html, /compact\?7\+depth\*8:20\+depth\*20/);
  assert.match(html, /compact\?depth\*8:depth\*10/);
  assert.match(html, /Math\.max\(compact\?\.18:\.28,\.78-depth\*\(compact\?\.1:\.032\)\)/);
  assert.match(html, /duration:260/);
  assert.match(html, /duration:480/);
  assert.match(html, /DEPTH_MIN_HOLD_MS=520/);
  assert.match(html, /transition\.enteredAt=performance\.now\(\)/);
  assert.match(html, /await delay\(holdRemaining\)/);
  assert.match(html, /iterations:Infinity/);
  assert.match(html, /\.slice\(0,compact\?5:VIEW_STACK\.length\)/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /Workspace Predictor/);
  assert.match(html, /Web Console Events/);
  assert.match(html, /minmax\(0,1fr\)/);
  assert.match(html, /\.depth-dock,\.preview-sheet\{display:none\}/);
  assert.match(html, /\.transition-stack\{display:none!important\}/);
  assert.doesNotMatch(html, /100d?vh|background:var\(--panel\)|min-height:520px|min-height:500px/);
  assert.doesNotMatch(html, /class="depth-rail"|class="folder-tabs"/);
  assert.doesNotMatch(html, /<script[^>]+src=|gsap\./i);
  assert.doesNotMatch(html, /<iframe/i);

  const depthAnimationStart = html.indexOf("async function animateDepthPlane");
  const depthAnimationEnd = html.indexOf("function renderWorkspace", depthAnimationStart);
  const depthAnimation = html.slice(depthAnimationStart, depthAnimationEnd);
  assert.ok(depthAnimation.indexOf("await transition.entered") < depthAnimation.indexOf('transition.phase="settling"'));
});

test("workspace view exposes all 15 views through sanitized paginated payloads", () => {
  const services = Array.from({ length: 8 }, (_, index) => ({
    id: `service-${index}`,
    controlTargetId: `service-${index}`,
    label: `Service ${index}`,
    project: "demo",
    quickTest: {
      state: index === 0 ? "ERROR" : "ONLINE",
      latencyMs: index,
      detail: index === 0 ? "C:\\Users\\operator\\secret\\error.log token-abcdefghijklmnop" : "healthy"
    }
  }));
  const result = buildGovernanceWorkspaceView({
    state: { summary: { registeredProjects: 1, ports: 2, publicRoutes: 3 } },
    serviceStatus: { generatedAt: "2026-07-18T00:00:00.000Z", services },
    resourceSnapshot: { host: { cpuPercent: 46.2, memoryUsedPercent: 68.6 } },
    approvedControls: [{ controlTargetId: "service-0", action: "doctor", approved: true, status: "approved" }]
  }, { viewId: "service-status", page: 2, pageSize: 6 });

  assert.equal(GOVERNANCE_WORKSPACE_VIEWS.length, 15);
  assert.equal(result.schema, "devgov.governance-workspace-view.v1");
  assert.equal(result.navigation.flatMap((folder) => folder.views).length, 15);
  assert.equal(result.view.rows.length, 2);
  assert.equal(result.view.page.number, 2);
  assert.equal(result.view.page.totalRows, 8);
  assert.doesNotMatch(JSON.stringify(result), /C:\\Users|abcdefghijklmnop/);

  const firstPage = buildGovernanceWorkspaceView({
    state: { summary: {} },
    serviceStatus: { services },
    resourceSnapshot: {},
    approvedControls: [{ controlTargetId: "service-0", action: "doctor", approved: true, status: "approved" }]
  }, { viewId: "service-status", page: 1, pageSize: 6 });
  assert.deepEqual(firstPage.view.rows[0].actions, ["doctor"]);

  const restartReady = buildGovernanceWorkspaceView({
    state: { summary: {} },
    serviceStatus: { services },
    resourceSnapshot: {},
    approvedControls: [{
      controlTargetId: "service-0",
      action: "restart",
      approved: true,
      status: "approved",
      restartPolicy: {
        permissionBoundary: "operator confirmation",
        backupExpectation: "no persistent state",
        rollbackExpectation: "run doctor"
      }
    }]
  }, { viewId: "service-status", page: 1, pageSize: 6 });
  assert.deepEqual(restartReady.view.rows[0].actions, ["restart"]);
});

test("workspace predictor classifies paths without returning the supplied local path", () => {
  const state = { workspacePrediction: { layers: [{ id: "workspace", scope: "workspace", status: "active" }], rules: [{ id: "one" }] } };
  const ready = buildWorkspacePathPrediction(state, "Q:\\Projects\\example-app");
  const blocked = buildWorkspacePathPrediction(state, "C:\\Users\\operator\\example-app");

  assert.equal(ready.state, "READY");
  assert.equal(ready.projectName, "example-app");
  assert.equal(blocked.state, "BLOCKED");
  assert.doesNotMatch(JSON.stringify(blocked), /C:\\Users/);
});
