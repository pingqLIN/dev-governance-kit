import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRegistry } from "../scripts/lib/registry-core.mjs";
import { validateGovernanceRegistry } from "../scripts/lib/governance-registry-core.mjs";

function baseRegistry(entries) {
  return {
    schema: "devgov.ports.registry.v1",
    ranges: {
      frontend: { start: 3100, end: 3199 }
    },
    entries
  };
}

test("validateRegistry accepts a complete local entry", () => {
  const errors = validateRegistry(baseRegistry([
    {
      project: "demo",
      service: "frontend",
      range: "frontend",
      port: 3101,
      host: "127.0.0.1",
      visibility: "local",
      protocol: "tcp",
      source: "PORTS.md",
      notes: "dev server"
    }
  ]));

  assert.deepEqual(errors, []);
});

test("validateRegistry rejects duplicate host protocol ports", () => {
  const entry = {
    project: "demo",
    service: "frontend",
    range: "frontend",
    port: 3101,
    host: "127.0.0.1",
    visibility: "local",
    protocol: "tcp",
    source: "PORTS.md",
    notes: "dev server"
  };

  const errors = validateRegistry(baseRegistry([entry, { ...entry, service: "api" }]));
  assert.ok(errors.some((error) => error.includes("overlaps")));
});

test("validateRegistry rejects overlapping socket allocations", () => {
  const first = {
    project: "demo",
    service: "frontend",
    range: "frontend",
    port: 3101,
    host: "0.0.0.0",
    visibility: "lan",
    protocol: "http",
    source: "PORTS.md",
    notes: "LAN browser testing"
  };
  const second = {
    ...first,
    service: "local-preview",
    host: "localhost",
    visibility: "local",
    protocol: "tcp",
    notes: "local preview"
  };

  const errors = validateRegistry(baseRegistry([first, second]));
  assert.ok(errors.some((error) => error.includes("overlaps")));
});

test("validateRegistry rejects local wildcard bindings", () => {
  const errors = validateRegistry(baseRegistry([
    {
      project: "demo",
      service: "frontend",
      range: "frontend",
      port: 3101,
      host: "0.0.0.0",
      visibility: "local",
      protocol: "tcp",
      source: "PORTS.md",
      notes: "bad binding"
    }
  ]));

  assert.ok(errors.some((error) => error.includes("wildcard host cannot use local visibility")));
});

test("validateRegistry rejects unknown ranges", () => {
  const errors = validateRegistry(baseRegistry([
    {
      project: "demo",
      service: "frontend",
      range: "missing",
      port: 3101,
      host: "127.0.0.1",
      visibility: "local",
      protocol: "tcp",
      source: "PORTS.md",
      notes: "dev server"
    }
  ]));

  assert.ok(errors.some((error) => error.includes("references unknown range missing")));
});

test("validateRegistry rejects overlapping ranges", () => {
  const errors = validateRegistry({
    schema: "devgov.ports.registry.v1",
    ranges: {
      frontend: { start: 3100, end: 3199 },
      api: { start: 3190, end: 3299 }
    },
    entries: []
  });

  assert.ok(errors.some((error) => error.includes("overlaps")));
});

test("validateRegistry rejects empty source and notes", () => {
  const errors = validateRegistry(baseRegistry([
    {
      project: "demo",
      service: "frontend",
      range: "frontend",
      port: 3101,
      host: "127.0.0.1",
      visibility: "local",
      protocol: "tcp",
      source: "",
      notes: ""
    }
  ]));

  assert.ok(errors.some((error) => error.includes("source is required")));
  assert.ok(errors.some((error) => error.includes("notes is required")));
  assert.ok(errors.some((error) => error.includes("source must be a non-empty string")));
  assert.ok(errors.some((error) => error.includes("notes must be a non-empty string")));
});

test("validateRegistry rejects machine-local registry fields", () => {
  const errors = validateRegistry(baseRegistry([
    {
      project: "Q:\\Projects\\demo",
      service: "frontend see Q:\\Projects\\demo",
      range: "frontend",
      port: 3101,
      host: "127.0.0.1",
      visibility: "local",
      protocol: "tcp",
      source: "\\\\wsl.localhost\\Ubuntu\\home\\miles\\dev2\\projects\\demo\\PORTS.md",
      notes: "dev server from windows-projects:demo"
    }
  ]));

  assert.ok(errors.some((error) => error.includes("project must not contain machine-local")));
  assert.ok(errors.some((error) => error.includes("service must not contain machine-local")));
  assert.ok(errors.some((error) => error.includes("source must not contain machine-local")));
  assert.ok(errors.some((error) => error.includes("notes must not contain machine-local")));
});

test("validateGovernanceRegistry delegates existing port registry validation", () => {
  const errors = validateGovernanceRegistry(baseRegistry([]));

  assert.deepEqual(errors, []);
});
