#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { buildChildEnvironment, runPortPreflight } from "./lib/port-preflight-core.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const result = await runPortPreflight(args);
  reportSuccess(result, args);
  if (args.command.length) {
    const exitCode = await runChildCommand(args.command, result.entry);
    process.exit(exitCode);
  }
} catch (error) {
  if (process.argv.includes("--json")) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  } else {
    console.error(error.message);
  }
  process.exit(1);
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  const flagArgs = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  const options = {
    registryPath: path.resolve("registry", "ports.registry.json"),
    availability: "free",
    command,
    json: false,
    help: false
  };

  for (let index = 0; index < flagArgs.length; index += 1) {
    const arg = flagArgs[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-occupied") {
      options.availability = "allow-occupied";
    } else if (arg === "--skip-availability") {
      options.availability = "skip";
    } else if (arg === "--registry") {
      options.registryPath = path.resolve(requireValue(flagArgs, ++index, arg));
    } else if (arg === "--project") {
      options.project = requireValue(flagArgs, ++index, arg);
    } else if (arg === "--service") {
      options.service = requireValue(flagArgs, ++index, arg);
    } else if (arg === "--host") {
      options.host = requireValue(flagArgs, ++index, arg);
    } else if (arg === "--protocol") {
      options.protocol = requireValue(flagArgs, ++index, arg);
    } else if (arg === "--port") {
      options.port = parsePort(requireValue(flagArgs, ++index, arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port value: ${value}`);
  }
  return port;
}

function reportSuccess(result, args) {
  const payload = {
    ok: true,
    project: result.entry.project,
    service: result.entry.service,
    host: result.entry.host,
    port: result.entry.port,
    protocol: result.entry.protocol,
    visibility: result.entry.visibility,
    socket: result.socket,
    availability: result.availability ?? null,
    warnings: result.warnings
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Governed port OK: ${result.entry.project}/${result.entry.service} -> ${result.entry.protocol}://${result.entry.host}:${result.entry.port}`);
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

function runChildCommand(command, entry) {
  return new Promise((resolveRun) => {
    const [executable, ...childArgs] = command;
    if (!executable) {
      resolveRun(0);
      return;
    }
    const child = spawn(resolveWindowsExecutable(executable), childArgs, {
      stdio: "inherit",
      env: buildChildEnvironment(entry),
      shell: false
    });
    child.on("error", (error) => {
      console.error(`Failed to start child command: ${error.message}`);
      resolveRun(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`Child command exited by signal ${signal}`);
        resolveRun(1);
        return;
      }
      resolveRun(code ?? 0);
    });
  });
}

function resolveWindowsExecutable(executable) {
  if (process.platform !== "win32" || path.extname(executable)) {
    return executable;
  }
  if (["npm", "npx", "pnpm", "yarn"].includes(executable)) {
    return `${executable}.cmd`;
  }
  return executable;
}

function printHelp() {
  console.log(`Usage:
  node scripts/require-governed-port.mjs --project <project> --service <service> [options] [-- <command> ...]

Options:
  --registry <path>       Port registry path. Default: registry/ports.registry.json
  --host <host>           Require the registry entry to use this host.
  --port <port>           Require the registry entry to use this port.
  --protocol <protocol>   Require the registry entry to use this protocol.
  --allow-occupied        Allow the TCP socket to be occupied, for attach/open commands.
  --skip-availability     Skip TCP availability checks.
  --json                  Print machine-readable output.

Examples:
  node scripts/require-governed-port.mjs --project devgov --service dashboard-http --host 127.0.0.1 --port 3000
  node scripts/require-governed-port.mjs --project my-app --service web-http -- npm run dev:raw
`);
}
