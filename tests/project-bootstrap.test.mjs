import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listWorkspaceProjects, redactEnvironment } from "../scripts/lib/project-bootstrap-core.mjs";

test("project registry discovers governed project markers and git state", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "devgov-bootstrap-"));
  await fs.mkdir(path.join(root, "alpha", ".git"), { recursive: true });
  await fs.writeFile(path.join(root, "alpha", "AGENTS.md"), "# test\n");
  const projects = await listWorkspaceProjects(root);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, "alpha");
  assert.equal(projects[0].agent.state, "ready");
  assert.equal(projects[0].git.initialized, true);
});

test("environment redaction never preserves secret values", () => {
  assert.deepEqual(redactEnvironment({ NODE_ENV: "test", OPENAI_API_KEY: "secret-value" }), {
    NODE_ENV: "test", OPENAI_API_KEY: "[present-redacted]"
  });
});
