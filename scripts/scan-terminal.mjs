#!/usr/bin/env node
import { scanTerminalSettingsFiles, renderTerminalReport } from "./lib/terminal-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = { settings: [], out: undefined, allowOutsideReports: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
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
const report = renderTerminalReport(scans);

if (args.out) {
  await writeReport(args.out, report, args.allowOutsideReports);
  console.log(`Wrote ${args.out}`);
} else {
  console.log(report);
}
