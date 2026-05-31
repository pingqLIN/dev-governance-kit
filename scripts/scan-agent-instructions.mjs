#!/usr/bin/env node
import fs from "node:fs/promises";
import { buildAgentInstructionIndex, renderAgentInstructionTextIndex, validateAgentInstructionsRegistry } from "./lib/agent-instructions-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = {
    registry: "registry/agent-instructions.registry.json",
    jsonOut: "reports/agent-instructions-index.json",
    textOut: "reports/agent-instructions-index.txt",
    allowOutsideReports: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--registry") args.registry = argv[++index];
    if (value === "--json-out") args.jsonOut = argv[++index];
    if (value === "--text-out") args.textOut = argv[++index];
    if (value === "--allow-outside-reports") args.allowOutsideReports = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const registry = JSON.parse(await fs.readFile(args.registry, "utf8"));
const errors = validateAgentInstructionsRegistry(registry);
if (errors.length) {
  console.error("Agent instruction registry validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const index = buildAgentInstructionIndex(registry);
await writeReport(args.jsonOut, `${JSON.stringify(index, null, 2)}\n`, args.allowOutsideReports);
await writeReport(args.textOut, renderAgentInstructionTextIndex(index), args.allowOutsideReports);
console.log(`Indexed ${index.records.length} agent instruction records. Wrote ${args.jsonOut} and ${args.textOut}`);
