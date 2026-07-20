import assert from "node:assert/strict";
import { test } from "node:test";
import { checkServiceStatuses } from "../scripts/lib/dashboard-core.mjs";
import { runDoctorChecks } from "../scripts/lib/doctor-core.mjs";

const OPT_IN_ENV = "DEVGOV_ALLOW_LIVE_GOVERNANCE_TESTS";
const optInEnabled = process.env[OPT_IN_ENV] === "1";

function liveTest(name, fn) {
  return test(name, {
    skip: optInEnabled ? false : `Set ${OPT_IN_ENV}=1 after approving live local and public health probes.`
  }, fn);
}

liveTest("live service-status view excludes retired targets from the active control surface and recomputes readiness from probe results", async () => {
  const status = await checkServiceStatuses(".");
  const dashboardTarget = status.services.find((target) => target.id === "devgov-dashboard");
  const serviceControlTarget = status.services.find((target) => target.id === "devgov-service-control");
  const devgovGovTarget = status.services.find((target) => target.id === "public-route:devgov-gov");
  const devgovDevTarget = status.services.find((target) => target.id === "public-route:devgov-dev");
  const localArchiveTarget = status.services.find((target) => target.id === "local-agent:local-archive-maintainer");
  const lmStudioLocalTarget = status.services.find((target) => target.id === "local-agent:lmstudio-local-agent");
  const ps3eyeTarget = status.services.find((target) => target.id === "onboarding:ps3eye-windows-virtual-camera");
  const mcpRouteTarget = status.services.find((target) => target.id === "public-route:mcp-colorgeek");
  const lmStudioRouteTarget = status.services.find((target) => target.id === "public-route:lmstudio");
  const retiredRouteTarget = status.retiredServices.find((target) => target.id === "public-route:mcp-colorgeek");
  const tunnelClientTarget = status.services.find((target) => target.id === "onboarding:tunnel-client-local-filesystem-mcp");
  const chromeAiModelStoreTarget = status.services.find((target) => target.id === "onboarding:chrome-ai-model-store-filesystem");
  const continuousMemoryFieldTarget = status.services.find((target) => target.id === "onboarding:continuous-memory-field-on-demand-health");

  assert.equal(status.schema, "devgov.service-status.v1");
  assertLiveReadiness(dashboardTarget);
  assertLiveReadiness(serviceControlTarget);
  assertLiveReadiness(devgovGovTarget);
  assertLiveReadiness(devgovDevTarget);
  assertLiveReadiness(localArchiveTarget);
  assertLiveReadiness(lmStudioLocalTarget);
  assertLiveReadiness(ps3eyeTarget);
  assertLiveReadiness(mcpRouteTarget);
  assertLiveReadiness(lmStudioRouteTarget);
  assertLiveReadiness(tunnelClientTarget);
  assertLiveReadiness(chromeAiModelStoreTarget);
  assertLiveReadiness(continuousMemoryFieldTarget);
  if (localArchiveTarget.quickTest.statusCode === 401) {
    assert.equal(localArchiveTarget.quickTest.state, "ONLINE");
  }
  if (lmStudioLocalTarget.quickTest.statusCode === 401) {
    assert.equal(lmStudioLocalTarget.quickTest.state, "ONLINE");
  }
  if (lmStudioRouteTarget.quickTest.statusCode === 401) {
    assert.equal(lmStudioRouteTarget.quickTest.state, "ONLINE");
  }
  assert.equal(mcpRouteTarget.doctor.state, "FOUND");
  assert.equal(mcpRouteTarget.restart.state, "REVIEW_REQUIRED");
  assert.equal(mcpRouteTarget.controlReadiness, "PARTIAL");
  assert.equal(chromeAiModelStoreTarget.quickTest.state, "ONLINE");
  assert.match(chromeAiModelStoreTarget.quickTest.details.primaryPath, /OptGuideOnDeviceModel$/);
  assert.ok(chromeAiModelStoreTarget.quickTest.details.channels.some((channel) => channel.name === "Dev" && channel.targetMatchesPrimary));
  assert.equal(continuousMemoryFieldTarget.quickTest.state, "ONLINE");
  assert.equal(continuousMemoryFieldTarget.restart.state, "NOT_APPLICABLE");
  assert.equal(retiredRouteTarget, undefined);
});

liveTest("doctor verifies DevGov dashboard governance without modifying canonical registries", async () => {
  const result = await runDoctorChecks(".");

  assert.equal(result.ok, true, JSON.stringify(result.checks.filter((check) => !check.ok), null, 2));
  assert.equal(result.repairs.length, 0);
  assert.ok(result.checks.some((check) => check.id === "dashboard-port-registry" && check.ok));
  const startupCheck = result.checks.find((check) => check.id === "dashboard-startup-registry");
  assert.ok(startupCheck?.ok);
  assert.match(startupCheck.detail, /devgov-gov-public-route-login/);
  assert.ok(result.checks.some((check) => check.id === "script-scripts/register-dashboard-protocol.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/start-gov-public-route.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/register-gov-public-route-startup.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/require-governed-port.mjs" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/service-control/doctor-devgov-service-control.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/service-control/quickcheck-continuous-memory-field.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "script-scripts/service-control/doctor-continuous-memory-field.ps1" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "registry-service-onboarding.registry.json" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "registry-local-cloudflare.registry.json" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "local-agent-registry" && check.ok));
  assert.ok(result.checks.some((check) => check.id === "api-key-registry" && check.ok));
});

function assertLiveReadiness(target) {
  assert.ok(target);
  assert.ok(["ONLINE", "OFFLINE", "ERROR", "MISSING"].includes(target.quickTest.state));
  assert.equal(target.controlReadiness, expectedLiveReadiness(target));
}

function expectedLiveReadiness(target) {
  const quickState = target.quickTest?.state;
  const hasQuickSignal = ["ONLINE", "OFFLINE", "ERROR"].includes(quickState);
  const hasControl = [target.doctor?.state, target.restart?.state].some((state) => ["FOUND", "REVIEW_REQUIRED"].includes(state));
  if (quickState === "ONLINE" && target.doctor?.state === "FOUND" && target.restart?.state === "FOUND") return "READY";
  if (hasQuickSignal && hasControl) return "PARTIAL";
  return "BLOCKED";
}
