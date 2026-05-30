#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DASHBOARD_HOST, DASHBOARD_PORT, DASHBOARD_URL } from "./lib/dashboard-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shouldOpenBrowser = process.argv.includes("--open");

if (!await isHealthy()) {
  const child = spawn(process.execPath, ["scripts/serve-dashboard.mjs"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  await waitForHealth();
}

console.log(DASHBOARD_URL);
if (shouldOpenBrowser) openBrowser(DASHBOARD_URL);

async function waitForHealth() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await isHealthy()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error(`DevGov dashboard did not become healthy at ${DASHBOARD_URL}`);
}

function isHealthy() {
  return new Promise((resolveHealth) => {
    const request = http.get({
      host: DASHBOARD_HOST,
      port: DASHBOARD_PORT,
      path: "/health",
      timeout: 800
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        resolveHealth(response.statusCode === 200 && body.includes("\"project\": \"devgov\""));
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolveHealth(false));
  });
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], { detached: true, stdio: "ignore" }).unref();
}
