#!/usr/bin/env node
import fs from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { findProjects, scanProject, renderWorkspaceAudit } from "./lib/scan-core.mjs";

function parseArgs(argv) {
  const args = { workspaceRoot: undefined, out: "reports/workspace-port-audit.md", allowOutsideReports: false };
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
    if (!args.workspaceRoot) {
      args.workspaceRoot = value;
    }
  }
  if (!args.workspaceRoot) {
    throw new Error("Usage: node scripts/scan-workspace.mjs <workspaceRoot> [--out report.md]");
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
const projects = await findProjects(args.workspaceRoot);
const scans = [];

for (const project of projects) {
  scans.push(await scanProject(project));
}

const report = renderWorkspaceAudit(args.workspaceRoot, scans);
assertReportOutputPath(args.out, args.allowOutsideReports);
await fs.mkdir(dirname(args.out), { recursive: true });
await fs.writeFile(args.out, report, "utf8");
console.log(`Scanned ${scans.length} projects. Wrote ${args.out}`);
