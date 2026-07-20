#!/usr/bin/env node
import { loadServiceOnboardingAudit, renderServiceOnboardingAudit, renderServiceOnboardingAuditZhTw } from "./lib/service-onboarding-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = {
    out: "reports/service-onboarding-audit.md",
    zhTwOut: "reports/service-onboarding-audit.zh-tw.md",
    jsonOut: "reports/service-onboarding-audit.json",
    allowOutsideReports: false
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
      args.out = argv[++index];
      continue;
    }
    if (value === "--json-out") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--json-out requires a report path");
      }
      args.jsonOut = argv[++index];
      continue;
    }
    if (value === "--zh-tw-out") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) {
        throw new Error("--zh-tw-out requires a report path");
      }
      args.zhTwOut = argv[++index];
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const audit = await loadServiceOnboardingAudit(".");
await writeReport(args.out, renderServiceOnboardingAudit(audit), args.allowOutsideReports);
await writeReport(args.zhTwOut, renderServiceOnboardingAuditZhTw(audit), args.allowOutsideReports);
await writeReport(args.jsonOut, `${JSON.stringify(audit, null, 2)}\n`, args.allowOutsideReports);
console.log(`Wrote ${args.out}`);
console.log(`Wrote ${args.zhTwOut}`);
console.log(`Wrote ${args.jsonOut}`);
