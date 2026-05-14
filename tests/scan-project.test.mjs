import assert from "node:assert/strict";
import { test } from "node:test";
import { findProjects, scanProject, renderProjectAudit, renderWorkspaceAudit } from "../scripts/lib/scan-core.mjs";

test("scanProject finds ports, hosts, and redacts non-port env values", async () => {
  const scan = await scanProject("tests/fixtures/vite-project");
  const ports = new Set(scan.findings.map((finding) => finding.port));

  assert.equal(scan.filesScanned, 6);
  assert.ok(ports.has(3101));
  assert.ok(ports.has(3201));
  assert.ok(ports.has(3301));
  assert.ok(ports.has(3304));
  assert.ok(ports.has(3305));
  assert.ok(ports.has(3302));
  assert.ok(ports.has(5434));
  assert.ok(ports.has(6379));
  assert.ok(ports.has(5433));
  assert.ok(scan.findings.some((finding) => finding.risks.includes("public-bind")));
  assert.ok(scan.findings.some((finding) => finding.risks.includes("auto-fallback")));
  assert.ok(scan.findings.some((finding) => finding.port === 5434 && finding.risks.includes("host-publish-review")));
  assert.ok(scan.findings.some((finding) => finding.port === 6379 && finding.risks.includes("docker-internal")));
  assert.ok(!scan.findings.some((finding) => finding.file === "docker-compose.yml" && finding.port === 5432));

  const report = renderProjectAudit(scan);
  assert.match(report, /0\.0\.0\.0/);
  assert.match(report, /src\\server\.js/);
  assert.match(report, /\| \.env \| 3 \|  \| 127\.0\.0\.1 /);
  assert.match(report, /\| \.env \| 4 \| 5433 \| localhost /);
  assert.match(report, /\| \.env \| 5 \|  \| \* .*public-bind.*PUBLIC_HOST=\*/);
  assert.match(report, /DATABASE_URL=postgres:\/\/localhost:5433/);
  assert.doesNotMatch(report, /should-not-leak/);
  assert.doesNotMatch(report, /session-token/);
  assert.match(report, /Authorization: Bearer <redacted>/);
  assert.match(report, /Cookie: <redacted>/);
  assert.doesNotMatch(report, /db-password/);
  assert.doesNotMatch(report, /\| .env \| 3 \| 127 /);
});

test("findProjects and renderWorkspaceAudit summarize project scans", async () => {
  const projects = await findProjects("tests/fixtures");
  assert.ok(projects.some((project) => project.endsWith("vite-project")));

  const scans = await Promise.all(projects.map((project) => scanProject(project)));
  const report = renderWorkspaceAudit("tests/fixtures", scans);

  assert.match(report, /Workspace Port Audit/);
  assert.match(report, /Projects scanned: 1/);
  assert.match(report, /Public Bindings/);
});
