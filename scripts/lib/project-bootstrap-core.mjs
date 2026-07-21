import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SECRET_KEY = /(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|cookie|credential)/i;

export async function listWorkspaceProjects(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name.endsWith(".worktrees")) continue;
    const projectPath = path.join(root, entry.name);
    const markers = await Promise.all([".git", "AGENTS.md", "package.json", "pyproject.toml"].map(async (name) =>
      Boolean(await fs.stat(path.join(projectPath, name)).catch(() => null))));
    if (markers.some(Boolean)) projects.push(await inspectProject(projectPath));
  }
  return projects.sort((left, right) => left.name.localeCompare(right.name));
}

export async function inspectProject(projectPath) {
  const root = path.resolve(projectPath);
  const name = path.basename(root);
  const git = await runGit(root, ["status", "--short", "--branch"]);
  const branch = git.stdout.match(/^##\s+([^\.\s]+)(?:\.\.\S+)?/m)?.[1] ?? null;
  const statusLines = git.stdout.split(/\r?\n/).filter((line) => /^[ MARCUD?!]{2}\s/.test(line));
  const dirty = statusLines.length > 0;
  const untracked = statusLines.filter((line) => line.startsWith("??")).length;
  return {
    id: slugify(name), name, path: root, status: "observed",
    agent: { state: await exists(path.join(root, "AGENTS.md")) ? "ready" : "missing" },
    git: { initialized: await exists(path.join(root, ".git")), branch, dirty, state: dirty ? "dirty" : "clean", changedFiles: statusLines.length, untrackedFiles: untracked },
    runtime: await runtimeSummary(root),
    observedAt: new Date().toISOString()
  };
}

export async function runtimeSummary(root) {
  const packageJson = await readJson(path.join(root, "package.json"));
  const pyproject = await exists(path.join(root, "pyproject.toml"));
  return {
    node: packageJson ? { detected: true, packageManager: packageJson.packageManager ?? null } : { detected: false },
    python: { detected: pyproject || await exists(path.join(root, "requirements.txt")) },
    gpu: { state: "not-probed", reason: "Bootstrap snapshots do not execute GPU probes." },
    models: { state: "not-probed", reason: "Model stores are not read during bootstrap." },
    toolchain: { markers: await presentMarkers(root, ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]) }
  };
}

export function redactEnvironment(environment = {}) {
  return Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, SECRET_KEY.test(key) ? "[present-redacted]" : String(value)]));
}

async function runGit(cwd, args) {
  try { return await execFileAsync("git", args, { cwd, windowsHide: true }); }
  catch (error) { return { stdout: "", stderr: String(error.message ?? error) }; }
}

async function readJson(file) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; } }
async function exists(file) { return Boolean(await fs.stat(file).catch(() => null)); }
async function presentMarkers(root, names) {
  const result = [];
  for (const name of names) if (await exists(path.join(root, name))) result.push(name);
  return result;
}
function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "project"; }
