import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { executeServiceControl, loadApprovedServiceControls, readServiceControlEvents, SERVICE_CONTROL_PORT } from "../scripts/lib/service-control-core.mjs";

const OPT_IN_ENV = "DEVGOV_ALLOW_SERVICE_CONTROL_TESTS";
const optInEnabled = process.env[OPT_IN_ENV] === "1";

function controlTest(name, fn) {
  return test(name, {
    skip: optInEnabled ? false : `Set ${OPT_IN_ENV}=1 only after approving executable Doctor and Restart controls.`
  }, fn);
}

controlTest("service control registry and approved DevGov action are executable through the reviewed wrapper", async () => {
  const eventsPath = "reports/service-control-events.json";
  const originalEvents = await readFile(eventsPath, "utf8").catch(() => null);
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "devgov-dashboard" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "devgov-dashboard" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);
  assert.equal(doctorControl.status, "approved");
  assert.equal(restartControl.status, "approved");
  assert.equal(SERVICE_CONTROL_PORT, 3201);

  try {
    const doctorResult = await executeServiceControl(".", { controlTargetId: "devgov-dashboard", action: "doctor" }, { origin: "http://127.0.0.1:3000", clientIp: "127.0.0.1" });
    const result = await executeServiceControl(".", { controlTargetId: "devgov-dashboard", action: "restart" }, { origin: "http://127.0.0.1:3000", clientIp: "127.0.0.1" });
    const events = await readServiceControlEvents(".");

    assert.equal(doctorResult.ok, true);
    assert.match(doctorResult.summary, /DevGov doctor passed/i);
    assert.equal(result.ok, true);
    assert.match(result.summary, /DevGov dashboard/i);
    assert.ok(events.some((event) => event.controlTargetId === "devgov-dashboard" && event.action === "doctor" && event.ok));
    assert.ok(events.some((event) => event.controlTargetId === "devgov-dashboard" && event.action === "restart" && event.ok));
  } finally {
    if (originalEvents === null) {
      await rm(eventsPath, { force: true });
    } else {
      await writeFile(eventsPath, originalEvents, "utf8");
    }
  }
});

controlTest("service control registry exposes tunnel client doctor and restart actions", async () => {
  const controls = await loadApprovedServiceControls(".");
  const doctorControl = controls.find((entry) => entry.controlTargetId === "tunnel-client-local-filesystem-mcp" && entry.action === "doctor");
  const restartControl = controls.find((entry) => entry.controlTargetId === "tunnel-client-local-filesystem-mcp" && entry.action === "restart");

  assert.ok(doctorControl);
  assert.ok(restartControl);

  const result = await executeServiceControl(".", { controlTargetId: "tunnel-client-local-filesystem-mcp", action: "doctor" }, { origin: "http://127.0.0.1:3000", clientIp: "127.0.0.1" });

  assert.equal(result.ok, true);
  assert.match(result.summary, /Tunnel client doctor passed/i);
});
