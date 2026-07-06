import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const GIT_MISSING_MESSAGE = "Git executable not found in PATH. Install Git for Windows or add git.exe to PATH before running scan-worktrees.";

export async function assertGitAvailable() {
  try {
    const { stdout } = await execFileAsync("git", ["--version"], {
      encoding: "utf8",
      windowsHide: true
    });
    return stdout.trim();
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(GIT_MISSING_MESSAGE);
    }
    const details = String(error.stderr || error.stdout || error.message || "").trim();
    throw new Error(`Git preflight failed${details ? `: ${details}` : "."}`);
  }
}

function normalizePath(pathValue) {
  return resolve(pathValue);
}

function resolveGitPath(topLevel, gitPath) {
  if (isAbsolute(gitPath)) {
    return normalizePath(gitPath);
  }
  return normalizePath(join(topLevel, gitPath));
}

function isWorktreeContainerName(name) {
  return /(^|[-.])worktrees?$/i.test(name);
}

async function listDirectories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(root, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      windowsHide: true
    });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.code ?? 1 };
  }
}

async function readGitEntry(candidate) {
  const revParse = await runGit(["rev-parse", "--show-toplevel", "--git-common-dir", "--git-dir"], candidate.path);
  if (!revParse.ok) {
    return null;
  }

  const [topLevelRaw, commonRaw, gitDirRaw] = revParse.stdout.trim().split(/\r?\n/);
  const topLevel = normalizePath(topLevelRaw);
  const commonDir = resolveGitPath(topLevel, commonRaw);
  const gitDir = resolveGitPath(topLevel, gitDirRaw);
  const status = await runGit(["status", "--porcelain"], candidate.path);
  const stat = await fs.stat(candidate.path);

  return {
    ...candidate,
    path: normalizePath(candidate.path),
    topLevel,
    commonDir,
    gitDir,
    isLinkedWorktree: gitDir !== commonDir,
    dirty: status.ok ? status.stdout.trim().length > 0 : null,
    statusError: status.ok ? null : (status.stderr || status.stdout).trim(),
    lastWriteTime: stat.mtime
  };
}

export async function scanWorktrees(workspaceRoot, options = {}) {
  const resolvedRoot = normalizePath(workspaceRoot);
  await fs.access(resolvedRoot);
  await assertGitAvailable();

  const topLevelDirectories = await listDirectories(resolvedRoot);
  const worktreeContainers = topLevelDirectories.filter((entry) => isWorktreeContainerName(entry.name));
  const candidates = topLevelDirectories.map((entry) => ({ scope: "top", name: entry.name, path: entry.path }));

  for (const container of worktreeContainers) {
    const children = await listDirectories(container.path);
    for (const child of children) {
      candidates.push({
        scope: "worktree-container-child",
        name: `${container.name}/${child.name}`,
        path: child.path
      });
    }
  }

  const gitEntries = [];
  for (const candidate of candidates) {
    const entry = await readGitEntry(candidate);
    if (entry) {
      gitEntries.push(entry);
    }
  }

  const groupsByCommonDir = new Map();
  for (const entry of gitEntries) {
    const group = groupsByCommonDir.get(entry.commonDir) ?? {
      commonDir: entry.commonDir,
      entries: [],
      linkedWorktrees: []
    };
    group.entries.push(entry);
    if (entry.isLinkedWorktree) {
      group.linkedWorktrees.push(entry);
    }
    groupsByCommonDir.set(entry.commonDir, group);
  }

  const generatedAt = options.generatedAt ?? new Date();
  const maxAgeDays = options.maxAgeDays ?? 30;
  const maxLinkedWorktrees = options.maxLinkedWorktrees ?? 3;
  const now = generatedAt.getTime();

  const groups = [...groupsByCommonDir.values()]
    .map((group) => {
      const linkedWorktrees = group.linkedWorktrees.map((entry) => {
        const ageDays = Math.floor((now - entry.lastWriteTime.getTime()) / 86_400_000);
        return {
          ...entry,
          ageDays,
          stale: ageDays > maxAgeDays
        };
      });
      return {
        ...group,
        entries: group.entries.sort((left, right) => left.path.localeCompare(right.path)),
        linkedWorktrees,
        linkedCount: linkedWorktrees.length,
        dirtyCount: group.entries.filter((entry) => entry.dirty).length,
        staleCount: linkedWorktrees.filter((entry) => entry.stale).length,
        overLimit: linkedWorktrees.length > maxLinkedWorktrees
      };
    })
    .sort((left, right) => right.entries.length - left.entries.length || left.commonDir.localeCompare(right.commonDir));

  return {
    workspaceRoot: resolvedRoot,
    generatedAt,
    maxAgeDays,
    maxLinkedWorktrees,
    topLevelDirectoryCount: topLevelDirectories.length,
    scannedCandidateCount: candidates.length,
    gitEntryCount: gitEntries.length,
    uniqueRepositoryCount: groups.length,
    linkedWorktreeCount: gitEntries.filter((entry) => entry.isLinkedWorktree).length,
    worktreeContainers,
    groups
  };
}

function formatBool(value) {
  if (value === null) {
    return "unknown";
  }
  return value ? "yes" : "no";
}

function renderRecommendation(group) {
  if (group.linkedCount === 0) {
    return "none";
  }
  if (group.dirtyCount > 0) {
    return "review dirty worktrees before cleanup";
  }
  if (group.staleCount > 0 || group.overLimit) {
    return "cleanup candidate after branch/review check";
  }
  return "within policy";
}

export function renderWorktreeAudit(audit) {
  const lines = [
    "# Worktree Audit",
    "",
    `Generated: ${audit.generatedAt.toISOString()}`,
    `Workspace root: ${audit.workspaceRoot}`,
    "",
    "## Summary",
    "",
    `- Top-level directories: ${audit.topLevelDirectoryCount}`,
    `- Scanned directory candidates: ${audit.scannedCandidateCount}`,
    `- Git entries: ${audit.gitEntryCount}`,
    `- Unique Git repositories: ${audit.uniqueRepositoryCount}`,
    `- Linked worktree entries: ${audit.linkedWorktreeCount}`,
    `- Worktree containers: ${audit.worktreeContainers.length}`,
    `- Stale threshold: ${audit.maxAgeDays} days`,
    `- Linked worktree soft limit per repo: ${audit.maxLinkedWorktrees}`,
    "",
    "## Repository Groups",
    "",
    "| Common repo | Entries | Linked | Dirty | Stale | Recommendation |",
    "|---|---:|---:|---:|---:|---|"
  ];

  for (const group of audit.groups) {
    lines.push(
      `| \`${group.commonDir}\` | ${group.entries.length} | ${group.linkedCount} | ${group.dirtyCount} | ${group.staleCount} | ${renderRecommendation(group)} |`
    );
  }

  lines.push("", "## Worktree Details", "");

  for (const group of audit.groups.filter((item) => item.entries.length > 1 || item.linkedCount > 0)) {
    lines.push(`### ${group.commonDir}`, "");
    for (const entry of group.entries) {
      const age = entry.isLinkedWorktree ? `${Math.floor((audit.generatedAt.getTime() - entry.lastWriteTime.getTime()) / 86_400_000)}d` : "n/a";
      lines.push(
        `- ${entry.isLinkedWorktree ? "linked" : "primary"} | dirty: ${formatBool(entry.dirty)} | age: ${age} | ${entry.path}`
      );
    }
    lines.push("");
  }

  lines.push(
    "## Cleanup Policy",
    "",
    "- This report is read-only evidence. It does not remove, prune, stage, commit, or reset anything.",
    "- Clean stale worktrees can be considered for `git worktree remove <path>` after branch/review checks.",
    "- Dirty or unmerged worktrees should be backed up first with branch refs, patches, and local artifacts under a reviewed `.clean` location.",
    "- After reviewed removals, run `git worktree prune` from the owning repository.",
    ""
  );

  return lines.join("\n");
}
