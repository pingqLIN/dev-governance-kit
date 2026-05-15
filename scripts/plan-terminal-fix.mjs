#!/usr/bin/env node
import { applyTerminalFixPlan, buildTerminalFixPlan, scanTerminalSettingsFiles } from "./lib/terminal-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = { settings: [], out: "reports/terminal-fix-plan.json", apply: false, allowOutsideReports: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") {
      args.apply = true;
      continue;
    }
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (value === "--settings") {
      args.settings.push(argv[++index]);
      continue;
    }
    if (value === "--out") {
      args.out = argv[++index];
      continue;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const scans = await scanTerminalSettingsFiles(args.settings.length ? args.settings : undefined);
const plan = buildTerminalFixPlan(scans);
await writeReport(args.out, `${JSON.stringify(plan, null, 2)}\n`, args.allowOutsideReports);
console.log(`Wrote ${args.out}`);

if (args.apply) {
  const backups = await applyTerminalFixPlan(plan);
  for (const backup of backups) {
    console.log(`Backup: ${backup}`);
  }
} else {
  console.log("Dry run only. Re-run with --apply to edit Windows Terminal settings after reviewing the plan.");
}
