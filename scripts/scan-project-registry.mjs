#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { listWorkspaceProjects } from "./lib/project-bootstrap-core.mjs";

const [workspaceRoot, ...rest] = process.argv.slice(2);
if (!workspaceRoot) throw new Error("Usage: node scripts/scan-project-registry.mjs <workspaceRoot> [--out report.json]");
const outIndex = rest.indexOf("--out");
const out = outIndex >= 0 ? rest[outIndex + 1] : "reports/project-registry-audit.json";
if (!out || out.startsWith("--")) throw new Error("--out requires a JSON path");
const projects = await listWorkspaceProjects(workspaceRoot);
const report = { "$schema": "devgov.project-registry-audit.v1", workspaceRoot: path.resolve(workspaceRoot), generatedAt: new Date().toISOString(), projects };
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Indexed ${projects.length} projects. Wrote ${out}`);
