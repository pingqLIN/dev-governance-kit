#!/usr/bin/env node
import fs from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { scanProject, renderProjectAudit } from "./lib/scan-core.mjs";

function parseArgs(argv) {
  const args = { projectPath: undefined, out: undefined, allowOutsideReports: false };
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
    if (!args.projectPath) {
      args.projectPath = value;
    }
  }
  if (!args.projectPath) {
    throw new Error("Usage: node scripts/scan-project.mjs <projectPath> [--out report.md]");
  }
  return args;
}

function assertReportOutputPath(outPath, allowOutsideReports) {
  if (allowOutsideReports) {
    return;
  }
  const reportsRoot = resolve("reports");
  const resolved = resolve(outPath);
  const rel = relative(reportsRoot, resolved);
  if (rel.startsWith("..") || rel === "" || rel.startsWith(`..\\`) || rel.startsWith(`../`) || isAbsolute(rel)) {
    throw new Error("Refusing to write audit evidence outside reports/. Use --allow-outside-reports for an explicit override.");
  }
}

const args = parseArgs(process.argv.slice(2));
const scan = await scanProject(args.projectPath);
const report = renderProjectAudit(scan);

if (args.out) {
  assertReportOutputPath(args.out, args.allowOutsideReports);
  await fs.mkdir(dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, report, "utf8");
  console.log(`Wrote ${args.out}`);
} else {
  console.log(report);
}
