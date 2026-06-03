#!/usr/bin/env node
import { auditContextBudget, renderContextBudgetAudit } from "./lib/context-budget-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = {
    root: ".",
    codexHome: undefined,
    requireCodexHome: false,
    skillRoots: [],
    requireSkillRoots: false,
    out: "reports/context-budget-audit.md",
    jsonOut: "reports/context-budget-audit.json",
    allowOutsideReports: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") {
      args.root = requireValue(argv, ++index, "--root");
      continue;
    }
    if (value === "--codex-home") {
      args.codexHome = requireValue(argv, ++index, "--codex-home");
      args.requireCodexHome = true;
      continue;
    }
    if (value === "--skill-root") {
      args.skillRoots.push(requireValue(argv, ++index, "--skill-root"));
      args.requireSkillRoots = true;
      continue;
    }
    if (value === "--out") {
      args.out = requireValue(argv, ++index, "--out");
      continue;
    }
    if (value === "--json-out") {
      args.jsonOut = requireValue(argv, ++index, "--json-out");
      continue;
    }
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (!value.startsWith("--")) {
      args.root = value;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const audit = await auditContextBudget(args);
await writeReport(args.jsonOut, `${JSON.stringify(audit, null, 2)}\n`, args.allowOutsideReports);
await writeReport(args.out, renderContextBudgetAudit(audit), args.allowOutsideReports);
console.log(`Wrote ${args.out} and ${args.jsonOut}`);
console.log(`Estimated local startup surface: ${audit.summary.localEstimatedTokensMin}-${audit.summary.localEstimatedTokensMax} tokens`);

function requireValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
