import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

async function createWorkspaceWithWorktree() {
  const root = await mkdtemp(join(tmpdir(), "dev-governance-worktrees-"));
  const workspace = join(root, "workspace");
  const repo = join(workspace, "sample-repo");
  const container = join(workspace, "sample-repo.worktrees");
  const worktree = join(container, "feature-20260520-210000");

  await mkdir(repo, { recursive: true });
  await mkdir(container, { recursive: true });
  run("git", ["init"], { cwd: repo });
  run("git", ["config", "user.email", "test@example.invalid"], { cwd: repo });
  run("git", ["config", "user.name", "Test User"], { cwd: repo });
  await writeFile(join(repo, "README.md"), "# sample\n", "utf8");
  run("git", ["add", "README.md"], { cwd: repo });
  run("git", ["commit", "-m", "initial"], { cwd: repo });
  run("git", ["worktree", "add", "-b", "feature/test", worktree], { cwd: repo });

  return { root, workspace, repo, worktree };
}

test("scan-worktrees reports linked worktrees without double-counting projects", async () => {
  const { root, workspace, repo, worktree } = await createWorkspaceWithWorktree();
  const out = "reports/test-worktree-audit.md";

  try {
    const result = spawnSync(process.execPath, ["scripts/scan-worktrees.mjs", workspace, "--out", out], { encoding: "utf8" });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Scanned 2 git entries across 1 unique repositories/);

    const report = await readFile(out, "utf8");
    assert.match(report, /Unique Git repositories: 1/);
    assert.match(report, /Linked worktree entries: 1/);
    assert.match(report, /sample-repo\.worktrees/);
    assert.match(report, /feature-20260520-210000/);
    assert.match(report, new RegExp(repo.replaceAll("\\", "\\\\")));
    assert.match(report, new RegExp(worktree.replaceAll("\\", "\\\\")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(out, { force: true });
  }
});

test("scan-worktrees refuses to write reports outside reports by default", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/scan-worktrees.mjs", "tests/fixtures", "--out", join(tmpdir(), "devgov-worktrees-outside.md")],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /Refusing to write audit evidence outside reports/);
});
