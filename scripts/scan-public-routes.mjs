#!/usr/bin/env node
import { scanPublicRouteConfigs, renderPublicRoutesReport } from "./lib/public-routes-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = { config: undefined, out: undefined, allowOutsideReports: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (value === "--config") {
      args.config = argv[++index];
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
const scan = await scanPublicRouteConfigs(args.config);
const report = renderPublicRoutesReport(scan);

if (args.out) {
  await writeReport(args.out, report, args.allowOutsideReports);
  console.log(`Wrote ${args.out}`);
} else {
  console.log(report);
}
