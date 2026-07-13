import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
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

test("scan-context-budget refuses absolute output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-context-budget.mjs", "--out", join(tmpdir(), "devgov-context-budget.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-context-budget refuses absolute JSON output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-context-budget.mjs", "--json-out", join(tmpdir(), "devgov-context-budget.json")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("new project API key plan refuses output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/plan-new-project-api-keys.mjs", "--no-live-env", "--out", join(tmpdir(), "devgov-new-project-api-keys.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("new project API key plan writes sanitized reports", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/plan-new-project-api-keys.mjs",
      "--project-name",
      "demo-api-client",
      "--service",
      "OpenAI Platform",
      "--no-live-env",
      "--out",
      "reports/new-project-api-key-plan.test.md",
      "--json-out",
      "reports/new-project-api-key-plan.test.json"
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const report = readFileSyncUtf8("reports/new-project-api-key-plan.test.md");
  const json = JSON.parse(readFileSyncUtf8("reports/new-project-api-key-plan.test.json"));
  assert.equal(json.schema, "devgov.new-project-api-key-plan.v1");
  assert.equal(json.projectName, "demo-api-client");
  assert.ok(json.credentials.some((credential) => credential.variableName === "OPENAI_API_KEY"));
  assert.match(report, /dotenv: Load \.env\.local or \.env with override:false/);
  assert.match(report, /OPENAI_API_KEY=/);
  assert.doesNotMatch(report, /sk-/);
});

test("scan-agent-instructions refuses resource proposal paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/scan-agent-instructions.mjs",
      "--agents-file",
      "AGENTS.md",
      "--resource-proposal-out",
      join(tmpdir(), "devgov-agents-resource-proposal.md")
    ],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-agent-instructions writes resource overlay proposal without modifying target AGENTS", () => {
  const targetPath = "reports/agent-overlay-target.test.md";
  const targetText = "# AGENTS.md\n\n## Project Rules\n\nUse focused tests.\n";
  writeFileSync(targetPath, targetText, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      "scripts/scan-agent-instructions.mjs",
      "--agents-file",
      targetPath,
      "--resource-proposal-out",
      "reports/agent-overlay-proposal.test.md",
      "--resource-proposal-json-out",
      "reports/agent-overlay-proposal.test.json"
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(readFileSyncUtf8(targetPath), targetText);
  const proposal = JSON.parse(readFileSyncUtf8("reports/agent-overlay-proposal.test.json"));
  assert.equal(proposal.status, "proposal-required");
  assert.match(readFileSyncUtf8("reports/agent-overlay-proposal.test.md"), /Suggested Manual Overlay/);
});

test("scan-resource-coordination refuses absolute output paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-resource-coordination.mjs", "--out", join(tmpdir(), "devgov-resource-coordination.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-resource-coordination refuses memory hint proposal paths outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/scan-resource-coordination.mjs",
      "--memory-hint-proposal-out",
      join(tmpdir(), "devgov-rcg-memory-hint.md")
    ],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});

test("scan-resource-coordination writes proposal-only memory hint reports", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/scan-resource-coordination.mjs",
      "--sample-ms",
      "25",
      "--memory-hint-proposal",
      "--memory-hint-project",
      "devgov",
      "--memory-hint-resource-class",
      "devtools",
      "--memory-hint-intent",
      "DevTools timing inspection",
      "--memory-hint-proposal-out",
      "reports/rcg-memory-hint.test.md",
      "--memory-hint-proposal-json-out",
      "reports/rcg-memory-hint.test.json"
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const proposal = JSON.parse(readFileSyncUtf8("reports/rcg-memory-hint.test.json"));
  assert.equal(proposal.mode, "proposal-only");
  assert.equal(proposal.proposedMemoryHint.project, "devgov");
  assert.equal(proposal.proposedMemoryHint.resourceClass, "devtools");
  assert.equal(proposal.proposedMemoryHint.authority, "soft-hint-only");
  assert.match(proposal.reviewGate.requiredOperatorIntent, /explicitly ask to update Codex memory/);
  assert.match(readFileSyncUtf8("reports/rcg-memory-hint.test.md"), /does not write to Codex memory/);
  assert.match(readFileSyncUtf8("reports/rcg-memory-hint.test.md"), /Review Gate/);
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

test("scan-context-budget fails when explicit input roots are missing", () => {
  const rootResult = spawnSync(
    process.execPath,
    ["scripts/scan-context-budget.mjs", "--root", "tests/fixtures/missing-context-root"],
    { encoding: "utf8" }
  );
  const codexHomeResult = spawnSync(
    process.execPath,
    ["scripts/scan-context-budget.mjs", "--codex-home", "tests/fixtures/missing-codex-home"],
    { encoding: "utf8" }
  );
  const skillRootResult = spawnSync(
    process.execPath,
    ["scripts/scan-context-budget.mjs", "--skill-root", "tests/fixtures/missing-skill-root"],
    { encoding: "utf8" }
  );

  assert.notEqual(rootResult.status, 0);
  assert.notEqual(codexHomeResult.status, 0);
  assert.notEqual(skillRootResult.status, 0);
  assert.match(`${rootResult.stderr}\n${rootResult.stdout}`, /root does not exist or is not a directory/);
  assert.match(`${codexHomeResult.stderr}\n${codexHomeResult.stdout}`, /codexHome does not exist or is not a directory/);
  assert.match(`${skillRootResult.stderr}\n${skillRootResult.stdout}`, /skillRoot does not exist or is not a directory/);
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

test("new project API key templates stay blank and prefer OS environment", async () => {
  const envExample = await readFile("templates/new-project.env.example", "utf8");
  const resolver = await readFile("templates/api-key-env-resolver.mjs", "utf8");
  const docs = await readFile("docs/new-project-api-key-onboarding.md", "utf8");
  const docsChinese = await readFile("docs/new-project-api-key-onboarding.zh-tw.md", "utf8");

  assert.match(envExample, /override:false/);
  assert.match(envExample, /OPENAI_API_KEY=/);
  assert.match(envExample, /CF_API_TOKEN=/);
  assert.doesNotMatch(envExample, /sk-/);
  assert.doesNotMatch(envExample, /password/i);
  assert.match(resolver, /process\.env/);
  assert.match(resolver, /Missing required environment variable/);
  assert.match(docs, /OS User\/Machine environment variables/);
  assert.match(docs, /registry\/api-keys\.registry\.json/);
  assert.match(docsChinese, /OS User\/Machine environment variables/);
  assert.match(docsChinese, /不得存 credential values/);
});

test("resource coordination AGENTS templates stay thin and proposal-only", async () => {
  const english = await readFile("templates/AGENTS.resource-coordination.md", "utf8");
  const chinese = await readFile("templates/AGENTS.resource-coordination.zh-tw.md", "utf8");
  const memoryEnglish = await readFile("templates/CODEX.memory.rcg-hint.md", "utf8");
  const memoryChinese = await readFile("templates/CODEX.memory.rcg-hint.zh-tw.md", "utf8");
  const gateEnglish = await readFile("templates/CODEX.memory.rcg-update-gate.md", "utf8");
  const gateChinese = await readFile("templates/CODEX.memory.rcg-update-gate.zh-tw.md", "utf8");

  assert.match(english, /## Shared Resource Coordination/);
  assert.match(english, /Project Exclusive Resources/);
  assert.match(english, /do not bulk-apply it to projects automatically/);
  assert.match(chinese, /Shared Resource Coordination/);
  assert.match(chinese, /不要對多個專案自動 bulk apply/);
  assert.match(memoryEnglish, /proposal-only/);
  assert.match(memoryEnglish, /soft-hint-only/);
  assert.match(memoryEnglish, /not write this template or a derived hint to real Codex memory/);
  assert.match(memoryChinese, /proposal-only/);
  assert.match(memoryChinese, /不要把這個 template 或衍生 hint 寫入真實 Codex memory/);
  assert.match(gateEnglish, /Required Operator Intent/);
  assert.match(gateEnglish, /Do not treat the following as approval/);
  assert.match(gateEnglish, /runtime-approved Codex memory update mechanism/);
  assert.match(gateChinese, /Required Operator Intent/);
  assert.match(gateChinese, /不得視為 approval/);
});

test("dashboard bookmark template targets the on-demand protocol handler", async () => {
  const text = await readFile("templates/devgov-dashboard-bookmark.html", "utf8");

  assert.match(text, /href="devgov:\/\/open"/);
  assert.match(text, /Open DevGov Dashboard/);
});

test("antivirus triage script parses in PowerShell", () => {
  const result = parsePowerShellScript("scripts/Invoke-AntivirusTriage.ps1");

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});

test("codex antivirus hook script parses in PowerShell", () => {
  const result = parsePowerShellScript("scripts/Invoke-CodexAntivirusHook.ps1");

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});

test("antivirus triage candidates generated artifacts and writes reports only", () => {
  const result = runAntivirusTriage([
    "-Path",
    "tests/fixtures/vite-project/dist/app.exe",
    "-ProjectRoot",
    "tests/fixtures/vite-project",
    "-RebuildCommand",
    "npm run build",
    "-OutputFormat",
    "Json",
    "-Out",
    "reports/antivirus-triage-candidate.test.json",
    "-NoDefenderEvidence",
    "-IncludeDefenderPreview"
  ]);

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const report = JSON.parse(readFileSyncUtf8("reports/antivirus-triage-candidate.test.json"));
  assert.equal(report.dry_run_only, true);
  assert.equal(report.recommendations[0].decision, "candidate");
  assert.equal(report.recommendations[0].classification, "generated-artifact-false-positive-candidate");
  assert.match(report.recommendations[0].defender_preview, /# Add-MpPreference/);
});

test("codex antivirus hook triggers triage from Bitdefender alert text", () => {
  const result = runCodexAntivirusHook([
    "-Product",
    "Bitdefender",
    "-Path",
    "tests/fixtures/vite-project/dist/app.exe",
    "-ProjectRoot",
    "tests/fixtures/vite-project",
    "-AlertText",
    "Bitdefender blocked generated build output",
    "-RebuildCommand",
    "npm run build",
    "-OutputFormat",
    "Json",
    "-Out",
    "reports/antivirus-hook-bitdefender.test.json"
  ]);

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const report = JSON.parse(readFileSyncUtf8("reports/antivirus-hook-bitdefender.test.json"));
  assert.equal(report.product, "Bitdefender");
  assert.equal(report.defender_evidence.status, "skipped-non-defender-product");
  assert.equal(report.recommendations[0].decision, "candidate");
});

test("codex antivirus hook ignores non-matching inputs without writing triage", () => {
  const result = runCodexAntivirusHook([
    "-AlertText",
    "ordinary build failure",
    "-Out",
    "reports/antivirus-hook-not-triggered.test.json"
  ]);

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /did not trigger/);
});

test("codex antivirus hook triggers from failed command output", () => {
  const result = runCodexAntivirusHook([
    "-Run",
    "node -e \"console.error('Bitdefender blocked generated build output'); process.exit(7)\"",
    "-Product",
    "Bitdefender",
    "-Path",
    "tests/fixtures/vite-project/dist/app.exe",
    "-ProjectRoot",
    "tests/fixtures/vite-project",
    "-RebuildCommand",
    "npm run build",
    "-OutputFormat",
    "Json",
    "-Out",
    "reports/antivirus-hook-run.test.json"
  ]);

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const report = JSON.parse(readFileSyncUtf8("reports/antivirus-hook-run.test.json"));
  assert.match(report.alert_text, /Hook trigger evidence: command-output/);
  assert.equal(report.recommendations[0].decision, "candidate");
});

test("antivirus triage rejects broad and source scopes", () => {
  const broadResult = runAntivirusTriage([
    "-Path",
    "tests/fixtures/vite-project",
    "-ProjectRoot",
    "tests/fixtures/vite-project",
    "-OutputFormat",
    "Json",
    "-Out",
    "reports/antivirus-triage-reject-broad.test.json",
    "-NoDefenderEvidence"
  ]);
  const sourceResult = runAntivirusTriage([
    "-Path",
    "tests/fixtures/vite-project/src/server.js",
    "-ProjectRoot",
    "tests/fixtures/vite-project",
    "-OutputFormat",
    "Json",
    "-Out",
    "reports/antivirus-triage-reject-source.test.json",
    "-NoDefenderEvidence"
  ]);

  assert.equal(broadResult.status, 0, `${broadResult.stderr}\n${broadResult.stdout}`);
  assert.equal(sourceResult.status, 0, `${sourceResult.stderr}\n${sourceResult.stdout}`);
  const broadReport = JSON.parse(readFileSyncUtf8("reports/antivirus-triage-reject-broad.test.json"));
  const sourceReport = JSON.parse(readFileSyncUtf8("reports/antivirus-triage-reject-source.test.json"));
  assert.equal(broadReport.recommendations[0].decision, "reject");
  assert.equal(sourceReport.recommendations[0].decision, "reject");
  assert.equal(broadReport.recommendations[0].risk, "high");
  assert.equal(sourceReport.recommendations[0].risk, "high");
});

test("antivirus triage switches severe alert text to security triage", () => {
  const result = runAntivirusTriage([
    "-Path",
    "tests/fixtures/vite-project/dist/app.exe",
    "-ProjectRoot",
    "tests/fixtures/vite-project",
    "-AlertText",
    "Ransomware behavior detected",
    "-OutputFormat",
    "Json",
    "-Out",
    "reports/antivirus-triage-severe.test.json",
    "-NoDefenderEvidence"
  ]);

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const report = JSON.parse(readFileSyncUtf8("reports/antivirus-triage-severe.test.json"));
  assert.equal(report.severe_alert_detected, true);
  assert.equal(report.recommendations[0].decision, "triage");
  assert.equal(report.recommendations[0].classification, "real-security-triage");
});

test("antivirus triage refuses to write evidence outside reports", () => {
  const result = runAntivirusTriage([
    "-Path",
    "tests/fixtures/vite-project/dist/app.exe",
    "-ProjectRoot",
    "tests/fixtures/vite-project",
    "-Out",
    "docs/antivirus-triage-bad.md",
    "-NoDefenderEvidence"
  ]);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write antivirus triage evidence outside reports/);
});

function runAntivirusTriage(args) {
  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/Invoke-AntivirusTriage.ps1", ...args],
    { encoding: "utf8" }
  );
}

function runCodexAntivirusHook(args) {
  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/Invoke-CodexAntivirusHook.ps1", ...args],
    { encoding: "utf8" }
  );
}

function parsePowerShellScript(scriptPath) {
  return spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${scriptPath}',[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`
    ],
    { encoding: "utf8" }
  );
}

function readFileSyncUtf8(path) {
  return readFileSync(path, "utf8");
}
