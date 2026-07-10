#!/usr/bin/env node
import {
  buildResourceCoordinationMemoryHintProposal,
  buildResourceCoordinationSnapshot,
  renderResourceCoordinationMemoryHintProposal,
  renderResourceCoordinationSnapshot
} from "./lib/resource-coordination-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = {
    root: ".",
    out: "reports/resource-coordination-snapshot.md",
    jsonOut: "reports/resource-coordination-snapshot.json",
    sampleMs: 100,
    includeProcessFamilies: false,
    memoryHintProposal: false,
    memoryHintProposalOut: "reports/resource-coordination-memory-hint-proposal.md",
    memoryHintProposalJsonOut: "reports/resource-coordination-memory-hint-proposal.json",
    memoryHintProject: "stable-project-id",
    memoryHintResourceClass: "browser-profile",
    memoryHintIntent: "Short sanitized description of intended resource use.",
    memoryHintConfidence: "declared",
    memoryHintSource: "devgov-scan",
    memoryHintValidSeconds: 1800,
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
    if (value === "--memory-hint-proposal") {
      args.memoryHintProposal = true;
      continue;
    }
    if (value === "--memory-hint-proposal-out") {
      args.memoryHintProposal = true;
      args.memoryHintProposalOut = requireValue(argv, ++index, "--memory-hint-proposal-out");
      continue;
    }
    if (value === "--memory-hint-proposal-json-out") {
      args.memoryHintProposal = true;
      args.memoryHintProposalJsonOut = requireValue(argv, ++index, "--memory-hint-proposal-json-out");
      continue;
    }
    if (value === "--memory-hint-project") {
      args.memoryHintProject = requireValue(argv, ++index, "--memory-hint-project");
      continue;
    }
    if (value === "--memory-hint-resource-class") {
      args.memoryHintResourceClass = requireValue(argv, ++index, "--memory-hint-resource-class");
      continue;
    }
    if (value === "--memory-hint-intent") {
      args.memoryHintIntent = requireValue(argv, ++index, "--memory-hint-intent");
      continue;
    }
    if (value === "--memory-hint-confidence") {
      args.memoryHintConfidence = requireValue(argv, ++index, "--memory-hint-confidence");
      continue;
    }
    if (value === "--memory-hint-source") {
      args.memoryHintSource = requireValue(argv, ++index, "--memory-hint-source");
      continue;
    }
    if (value === "--memory-hint-valid-seconds") {
      args.memoryHintValidSeconds = Number(requireValue(argv, ++index, "--memory-hint-valid-seconds"));
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
if (!Number.isInteger(args.memoryHintValidSeconds) || args.memoryHintValidSeconds < 60 || args.memoryHintValidSeconds > 1800) {
  throw new Error("--memory-hint-valid-seconds must be an integer from 60 to 1800");
}

const snapshot = await buildResourceCoordinationSnapshot(args.root, {
  sampleMs: args.sampleMs,
  includeProcessFamilies: args.includeProcessFamilies
});
await writeReport(args.jsonOut, `${JSON.stringify(snapshot, null, 2)}\n`, args.allowOutsideReports);
await writeReport(args.out, renderResourceCoordinationSnapshot(snapshot), args.allowOutsideReports);

console.log(`Wrote ${args.out} and ${args.jsonOut}`);
console.log(`Resource coordination state: ${snapshot.coordinationState} (${snapshot.diagnosticDisposition})`);

if (args.memoryHintProposal) {
  const proposal = buildResourceCoordinationMemoryHintProposal({
    generatedAt: snapshot.generatedAt,
    observedAt: snapshot.generatedAt,
    project: args.memoryHintProject,
    resourceClass: args.memoryHintResourceClass,
    intent: args.memoryHintIntent,
    confidence: args.memoryHintConfidence,
    source: args.memoryHintSource,
    validForSeconds: args.memoryHintValidSeconds
  });
  await writeReport(args.memoryHintProposalJsonOut, `${JSON.stringify(proposal, null, 2)}\n`, args.allowOutsideReports);
  await writeReport(args.memoryHintProposalOut, renderResourceCoordinationMemoryHintProposal(proposal), args.allowOutsideReports);
  console.log(
    `Resource coordination memory hint proposal status: ${proposal.status}. Wrote ${args.memoryHintProposalOut} and ${args.memoryHintProposalJsonOut}`
  );
}

function requireValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
