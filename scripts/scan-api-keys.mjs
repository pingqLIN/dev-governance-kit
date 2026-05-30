#!/usr/bin/env node
import { scanApiKeys, renderApiKeyAudit } from "./lib/api-keys-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = {
    projectPath: ".",
    out: undefined,
    allowOutsideReports: false,
    includeProcess: true,
    fixtureOnly: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--project") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--project requires a project path");
      }
      args.projectPath = argv[++index];
      continue;
    }
    if (value === "--out") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--out requires a report path");
      }
      args.out = argv[++index];
      continue;
    }
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (value === "--no-process") {
      args.includeProcess = false;
      continue;
    }
    if (value === "--fixture-only") {
      args.fixtureOnly = true;
      continue;
    }
    if (!value.startsWith("--")) {
      args.projectPath = value;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const scan = await scanApiKeys(args);
const report = renderApiKeyAudit(scan);

if (args.out) {
  await writeReport(args.out, report, args.allowOutsideReports);
  console.log(`Wrote ${args.out}`);
} else {
  console.log(report);
}
