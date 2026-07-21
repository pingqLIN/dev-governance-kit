import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("default tests exclude live probes and executable service controls", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const defaultGovernanceTests = await readFile("tests/environment-governance.test.mjs", "utf8");
  const liveLane = await readFile("tests/live-governance.opt-in.mjs", "utf8");
  const controlLane = await readFile("tests/service-controls.opt-in.mjs", "utf8");

  assert.equal(pkg.scripts.test, 'node --test "tests/*.test.mjs"');
  assert.equal(pkg.scripts["test:live-governance"], "node --test tests/live-governance.opt-in.mjs");
  assert.equal(pkg.scripts["test:service-controls"], "node --test tests/service-controls.opt-in.mjs");
  assert.doesNotMatch(defaultGovernanceTests, /checkServiceStatuses\(|runDoctorChecks\(|executeServiceControl\(/);
  assert.match(liveLane, /DEVGOV_ALLOW_LIVE_GOVERNANCE_TESTS/);
  assert.match(liveLane, /checkServiceStatuses\(/);
  assert.match(liveLane, /runDoctorChecks\(/);
  assert.match(controlLane, /DEVGOV_ALLOW_SERVICE_CONTROL_TESTS/);
  assert.match(controlLane, /executeServiceControl\(/);
});
