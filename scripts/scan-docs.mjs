#!/usr/bin/env node
import { buildDocsIndex, renderSearchHtml } from "./lib/docs-index-core.mjs";
import { writeReport } from "./lib/report-output.mjs";

function parseArgs(argv) {
  const args = { root: ".", out: "reports/search-index.json", htmlOut: "reports/search.html", allowOutsideReports: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--allow-outside-reports") {
      args.allowOutsideReports = true;
      continue;
    }
    if (value === "--root") {
      args.root = argv[++index];
      continue;
    }
    if (value === "--out") {
      args.out = argv[++index];
      continue;
    }
    if (value === "--html-out") {
      args.htmlOut = argv[++index];
      continue;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const index = await buildDocsIndex(args.root);
await writeReport(args.out, `${JSON.stringify(index, null, 2)}\n`, args.allowOutsideReports);
await writeReport(args.htmlOut, renderSearchHtml(index), args.allowOutsideReports);
console.log(`Indexed ${index.documents.length} documents. Wrote ${args.out} and ${args.htmlOut}`);
