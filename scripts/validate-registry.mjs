#!/usr/bin/env node
import { loadJson, loadRegistryFiles, validateGovernanceRegistry } from "./lib/governance-registry-core.mjs";

const targetPath = process.argv[2] ?? "registry";
const registryPaths = await loadRegistryFiles(targetPath);
const failures = [];

for (const registryPath of registryPaths) {
  const registry = await loadJson(registryPath);
  const errors = validateGovernanceRegistry(registry);
  if (errors.length) {
    failures.push({ registryPath, errors });
  }
}

if (failures.length) {
  console.error("Registry validation failed:");
  for (const failure of failures) {
    console.error(`\n${failure.registryPath}`);
    for (const error of failure.errors) {
      console.error(`- ${error}`);
    }
  }
  process.exit(1);
}

for (const registryPath of registryPaths) {
  console.log(`Registry valid: ${registryPath}`);
}
