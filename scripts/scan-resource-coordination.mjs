#!/usr/bin/env node
import { buildResourceCoordinationSnapshot, renderResourceCoordinationSnapshot } from "./lib/resource-coordination-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = {
    root: ".",
    out: "reports/resource-coordination-snapshot.md",
    jsonOut: "reports/resource-coordination-snapshot.json",
    sampleMs: 100,
    includeProcessFamilies: false,
    allowOutsideReports: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") {
      args.root = requireValue(argv, ++index, "--root");
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
    if (value === "--sample-ms") {
      args.sampleMs = Number(requireValue(argv, ++index, "--sample-ms"));
      continue;
    }
    if (value === "--include-processes") {
      args.includeProcessFamilies = true;
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
if (!Number.isInteger(args.sampleMs) || args.sampleMs < 25 || args.sampleMs > 5000) {
  throw new Error("--sample-ms must be an integer from 25 to 5000");
}

const snapshot = await buildResourceCoordinationSnapshot(args.root, {
  sampleMs: args.sampleMs,
  includeProcessFamilies: args.includeProcessFamilies
});
await writeReport(args.jsonOut, `${JSON.stringify(snapshot, null, 2)}\n`, args.allowOutsideReports);
await writeReport(args.out, renderResourceCoordinationSnapshot(snapshot), args.allowOutsideReports);

console.log(`Wrote ${args.out} and ${args.jsonOut}`);
console.log(`Resource coordination state: ${snapshot.coordinationState} (${snapshot.diagnosticDisposition})`);

function requireValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
