import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("scan-project refuses to write reports outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-project.mjs", "tests/fixtures/vite-project", "--out", "docs/bad-report.md"],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-project refuses absolute output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-project.mjs", "tests/fixtures/vite-project", "--out", join(tmpdir(), "devgov-outside.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-workspace refuses absolute output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-workspace.mjs", "tests/fixtures", "--out", join(tmpdir(), "devgov-workspace-outside.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-api-keys refuses absolute output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-api-keys.mjs", "--project", "tests/fixtures/vite-project", "--out", join(tmpdir(), "devgov-api-keys-outside.md"), "--fixture-only"],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-service-onboarding refuses absolute output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-service-onboarding.mjs", "--out", join(tmpdir(), "devgov-onboarding-outside.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan CLIs fail when the requested root is missing", () => {
  const projectResult = spawnSync(
    process.execPath,
    ["scripts/scan-project.mjs", "tests/fixtures/missing-project"],
    { encoding: "utf8" }
  );
  const workspaceResult = spawnSync(
    process.execPath,
    ["scripts/scan-workspace.mjs", "tests/fixtures/missing-workspace", "--out", "reports/missing-workspace.md"],
    { encoding: "utf8" }
  );

  assert.notEqual(projectResult.status, 0);
  assert.notEqual(workspaceResult.status, 0);
  assert.match(`${projectResult.stderr}\n${projectResult.stdout}`, /projectPath does not exist/);
  assert.match(`${workspaceResult.stderr}\n${workspaceResult.stdout}`, /workspaceRoot does not exist/);
});

test("scan-workspace validates missing --out value", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-workspace.mjs", "tests/fixtures", "--out"],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /--out requires a report path/);
});

test("check-ports template reports its real reusable path", () => {
  const result = spawnSync(process.execPath, ["templates/check-ports.mjs"], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /node templates\/check-ports\.mjs <tcp-port>/);
});

test("PORTS template uses placeholders instead of approved allocations", async () => {
  const text = await readFile("templates/PORTS.md", "utf8");

  assert.match(text, /`<service>`/);
  assert.doesNotMatch(text, /\|\s*frontend\s*\|\s*3101\s*\|/);
});

test("dashboard bookmark template targets the on-demand protocol handler", async () => {
  const text = await readFile("templates/devgov-dashboard-bookmark.html", "utf8");

  assert.match(text, /href="devgov:\/\/open"/);
  assert.match(text, /Open DevGov Dashboard/);
});
