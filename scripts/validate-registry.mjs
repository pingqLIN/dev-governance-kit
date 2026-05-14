#!/usr/bin/env node
import { loadRegistry, validateRegistry } from "./lib/registry-core.mjs";

const registryPath = process.argv[2] ?? "registry/ports.registry.json";
const registry = await loadRegistry(registryPath);
const errors = validateRegistry(registry);

if (errors.length) {
  console.error("Port registry validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Port registry valid: ${registryPath}`);
