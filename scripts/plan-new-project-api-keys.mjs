#!/usr/bin/env node
import { buildNewProjectApiKeyPlan, renderNewProjectApiKeyPlan } from "./lib/new-project-api-key-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = {
    projectName: "new-project",
    services: [],
    variables: [],
    out: undefined,
    jsonOut: undefined,
    allowOutsideReports: false,
    noLiveEnv: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--project-name") {
      args.projectName = requireValue(argv, ++index, "--project-name");
      continue;
    }
    if (value === "--service") {
      args.services.push(requireValue(argv, ++index, "--service"));
      continue;
    }
    if (value === "--variable") {
      args.variables.push(requireValue(argv, ++index, "--variable"));
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
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (value === "--no-live-env") {
      args.noLiveEnv = true;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index] || argv[index].startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return argv[index];
}

const args = parseArgs(process.argv.slice(2));
const plan = await buildNewProjectApiKeyPlan(args);
const report = renderNewProjectApiKeyPlan(plan);

if (args.out) {
  await writeReport(args.out, report, args.allowOutsideReports);
  console.log(`Wrote ${args.out}`);
} else {
  console.log(report);
}

if (args.jsonOut) {
  await writeReport(args.jsonOut, `${JSON.stringify(plan, null, 2)}\n`, args.allowOutsideReports);
  console.log(`Wrote ${args.jsonOut}`);
}
