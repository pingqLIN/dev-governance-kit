#!/usr/bin/env node
import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parsePorts(argv) {
  const raw = argv.length ? argv : [];
  const ports = raw.flatMap((value) => value.split(",")).map((value) => Number(value.trim()));
  const invalid = ports.filter((port) => !Number.isInteger(port) || port < 1 || port > 65535);
  if (invalid.length || ports.length === 0) {
    throw new Error("Usage: node templates/check-ports.mjs <tcp-port>[,<tcp-port>...]");
  }
  return ports;
}

function checkPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve({ port, host, available: false }));
    server.once("listening", () => {
      server.close(() => resolve({ port, host, available: true }));
    });
    server.listen(port, host);
  });
}

const ports = parsePorts(process.argv.slice(2));
const results = await Promise.all(ports.map((port) => checkPort(port)));
const occupied = results.filter((result) => !result.available);

if (occupied.length) {
  const owners = await findPortOwners(occupied.map((result) => result.port));
  console.error("Port conflict detected:");
  for (const result of occupied) {
    const owner = owners.get(result.port);
    const ownerText = owner ? ` pid=${owner.pid} state=${owner.state}` : " owner=unknown";
    console.error(`- ${result.host}:${result.port}${ownerText}`);
  }
  process.exit(1);
}

console.log("All required TCP ports are available.");

async function findPortOwners(ports) {
  if (process.platform !== "win32") {
    return new Map();
  }

  try {
    const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], { windowsHide: true });
    return parseWindowsNetstat(stdout, new Set(ports));
  } catch {
    return new Map();
  }
}

function parseWindowsNetstat(stdout, ports) {
  const owners = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0] !== "TCP") {
      continue;
    }

    const localAddress = columns[1];
    const state = columns[3];
    const pid = columns[4];
    const match = localAddress.match(/:(\d+)$/);
    if (!match) {
      continue;
    }

    const port = Number(match[1]);
    if (ports.has(port) && !owners.has(port)) {
      owners.set(port, { pid, state });
    }
  }
  return owners;
}
