import fs from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function assertReportOutputPath(outPath, allowOutsideReports = false) {
  if (allowOutsideReports) return;
  const reportsRoot = resolve("reports");
  const resolved = resolve(outPath);
  const rel = relative(reportsRoot, resolved);
  if (rel.startsWith("..") || rel === "" || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) {
    throw new Error("Refusing to write audit evidence outside reports/. Use --allow-outside-reports for an explicit override.");
  }
}

export async function writeReport(outPath, content, allowOutsideReports = false) {
  assertReportOutputPath(outPath, allowOutsideReports);
  await fs.mkdir(dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, content, "utf8");
}
