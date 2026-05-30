#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctorChecks } from "./lib/doctor-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const result = await runDoctorChecks(root, { repair: args.repair });
const reportPath = args.out ?? "reports/devgov-doctor-report.json";

await writeReport(reportPath, `${JSON.stringify(result, null, 2)}\n`, args.allowOutsideReports);

for (const check of result.checks) {
  console.log(`${check.ok ? "ok" : "fail"} ${check.id}: ${check.detail}`);
}
for (const repair of result.repairs) {
  console.log(`repair ${repair}`);
}
console.log(`Wrote ${reportPath}`);

if (!result.ok) process.exit(1);

function parseArgs(argv) {
  const parsed = { repair: false, allowOutsideReports: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--repair") parsed.repair = true;
    if (value === "--allow-outside-reports") parsed.allowOutsideReports = true;
    if (value === "--out") parsed.out = argv[++index];
  }
  return parsed;
}
