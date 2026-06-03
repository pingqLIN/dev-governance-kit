import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { auditContextBudget, renderContextBudgetAudit } from "../scripts/lib/context-budget-core.mjs";

test("context budget audit estimates observable local instruction sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "devgov-context-root-"));
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "devgov-context-home-"));
  const skillRoot = path.join(root, "skills");
  const skillDir = path.join(skillRoot, "pdf");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(root, "AGENTS.md"), "# AGENTS.md\n\nKeep this compact.\n", "utf8");
  await fs.writeFile(path.join(codexHome, "config.toml"), "[mcp_servers.example]\nenabled = true\n", "utf8");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), [
    "---",
    "name: pdf",
    "description: Create and edit PDF files",
    "---",
    "",
    "# PDF",
    "",
    "Long body that should remain lazy-loaded."
  ].join("\n"), "utf8");

  const audit = await auditContextBudget({ root, codexHome, skillRoots: [skillRoot] });
  assert.equal(audit.schema, "devgov.context-budget-audit.v1");
  assert.equal(audit.summary.agentsFiles, 1);
  assert.equal(audit.summary.skillManifests, 1);
  assert.equal(audit.summary.mcpServerBlocks, 1);
  assert.ok(audit.summary.localEstimatedTokensMin > 0);

  const skill = audit.sources.find((source) => source.kind === "skill-manifest");
  assert.equal(skill.label, "pdf");
  assert.match(skill.notes, /Create and edit PDF files/);
  assert.ok(skill.charCount < 80, "skill estimate should use manifest/header, not the full body");

  const report = renderContextBudgetAudit(audit);
  assert.match(report, /Observable Limits/);
  assert.match(report, /Platform system, developer/);
});
