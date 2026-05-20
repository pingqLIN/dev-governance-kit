#!/usr/bin/env node
import { scanWorktrees, renderWorktreeAudit } from "./lib/worktree-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function readNumberFlag(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a number`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = {
    workspaceRoot: undefined,
    out: "reports/worktree-audit.md",
    allowOutsideReports: false,
    maxAgeDays: 30,
    maxLinkedWorktrees: 3
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (value === "--out") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--out requires a report path");
      }
      args.out = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--max-age-days") {
      args.maxAgeDays = readNumberFlag(value, argv[index + 1]);
      index += 1;
      continue;
    }
    if (value === "--max-linked-worktrees") {
      args.maxLinkedWorktrees = readNumberFlag(value, argv[index + 1]);
      index += 1;
      continue;
    }
    if (!args.workspaceRoot) {
      args.workspaceRoot = value;
      continue;
    }
    throw new Error(`Unexpected argument: ${value}`);
  }

  if (!args.workspaceRoot) {
    throw new Error("Usage: node scripts/scan-worktrees.mjs <workspaceRoot> [--out report.md] [--max-age-days 30] [--max-linked-worktrees 3]");
  }

  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const audit = await scanWorktrees(args.workspaceRoot, {
    maxAgeDays: args.maxAgeDays,
    maxLinkedWorktrees: args.maxLinkedWorktrees
  });
  await writeReport(args.out, renderWorktreeAudit(audit), args.allowOutsideReports);
  console.log(
    `Scanned ${audit.gitEntryCount} git entries across ${audit.uniqueRepositoryCount} unique repositories. Wrote ${args.out}`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
