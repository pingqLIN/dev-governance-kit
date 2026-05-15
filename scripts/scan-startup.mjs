#!/usr/bin/env node
import { scanStartup, renderStartupReport } from "./lib/startup-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = { startupDir: undefined, fixtureOnly: false, out: undefined, allowOutsideReports: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--fixture-only") {
      args.fixtureOnly = true;
      continue;
    }
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (value === "--startup-dir") {
      args.startupDir = argv[++index];
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
const scan = await scanStartup(args);
const report = renderStartupReport(scan);

if (args.out) {
  await writeReport(args.out, report, args.allowOutsideReports);
  console.log(`Wrote ${args.out}`);
} else {
  console.log(report);
}
