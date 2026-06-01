import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { evaluatePortPreflight, runPortPreflight } from "../scripts/lib/port-preflight-core.mjs";

function registryWith(entry) {
  return {
    schema: "devgov.ports.registry.v1",
    sourceOfTruth: "registry/ports.registry.json",
    ranges: {
      frontend: { start: 3100, end: 3199 }
    },
    entries: [entry]
  };
}

function entryFor(port) {
  return {
    project: "demo",
    service: "web-http",
    port,
    host: "127.0.0.1",
    visibility: "local",
    protocol: "http",
    source: "test",
    notes: "test service"
  };
}

test("evaluatePortPreflight resolves a declared project service entry", async () => {
  const result = await evaluatePortPreflight(registryWith(entryFor(3101)), {
    project: "demo",
    service: "web-http",
    host: "127.0.0.1",
    port: 3101,
    protocol: "http",
    availability: "skip"
  });

  assert.equal(result.entry.project, "demo");
  assert.equal(result.entry.service, "web-http");
  assert.equal(result.socket, "tcp:127.0.0.1:3101");
  assert.equal(result.shouldCheckAvailability, false);
});

test("evaluatePortPreflight rejects missing entries and expected port drift", async () => {
  await assert.rejects(
    () => evaluatePortPreflight(registryWith(entryFor(3101)), { project: "demo", service: "api", availability: "skip" }),
    /No governed port entry/
  );

  await assert.rejects(
    () => evaluatePortPreflight(registryWith(entryFor(3101)), {
      project: "demo",
      service: "web-http",
      port: 3199,
      availability: "skip"
    }),
    /Expected port 3199/
  );
});

test("runPortPreflight rejects occupied TCP ports by default", async () => {
  const port = await findFreePort();
  const server = net.createServer();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const registryPath = await writeTempRegistry(entryFor(port));

  await assert.rejects(
    () => runPortPreflight({ registryPath, project: "demo", service: "web-http", availability: "free" }),
    /Governed port is occupied/
  );

  await new Promise((resolve) => server.close(resolve));
});

test("require-governed-port launches child command with governed env", async () => {
  const port = await findFreePort();
  const registryPath = await writeTempRegistry(entryFor(port));
  const childScript = "if (process.env.PORT !== String(process.argv[1])) process.exit(2); if (process.env.HOST !== '127.0.0.1') process.exit(3);";
  const result = spawnSync(process.execPath, [
    "scripts/require-governed-port.mjs",
    "--registry",
    registryPath,
    "--project",
    "demo",
    "--service",
    "web-http",
    "--port",
    String(port),
    "--",
    process.execPath,
    "-e",
    childScript,
    String(port)
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Governed port OK/);
});

async function writeTempRegistry(entry) {
  const root = await mkdtemp(join(tmpdir(), "devgov-port-preflight-"));
  const registryPath = join(root, "ports.registry.json");
  await writeFile(registryPath, `${JSON.stringify(registryWith(entry), null, 2)}\n`, "utf8");
  return registryPath;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
