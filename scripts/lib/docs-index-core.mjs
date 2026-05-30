import fs from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "reports"]);
const TARGET_EXTENSIONS = new Set([".md", ".json", ".yml", ".yaml"]);
const ALLOWED_TOP_LEVEL_DIRS = new Set(["docs", "registry", "templates"]);
const ALLOWED_TOP_LEVEL_FILES = new Set(["README.md", "README.zh-tw.md", "AGENTS.md", "AGENTS.zh-tw.md", "package.json"]);

export async function buildDocsIndex(root = ".") {
  const resolvedRoot = path.resolve(root);
  const documents = [];
  for (const file of await collectFiles(resolvedRoot)) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    documents.push({
      path: path.relative(resolvedRoot, file),
      title: inferTitle(text, file),
      tokens: extractTokens(text),
      preview: redact(text).replace(/\s+/g, " ").trim().slice(0, 240)
    });
  }
  return {
    schema: "devgov.docs-index.v1",
    generatedAt: new Date().toISOString(),
    root: resolvedRoot,
    documents
  };
}

export function renderSearchHtml(indexSource = "search-index.json") {
  const bootstrapScript = typeof indexSource === "string"
    ? `let docs = [];\nfetch('${indexSource}').then(r => r.json()).then(index => { docs = index.documents || []; render(''); });`
    : `const docs = ${JSON.stringify(indexSource.documents ?? [])};\nrender('');`;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DevGov Search</title>
  <style>
    body{font-family:Segoe UI,system-ui,sans-serif;margin:0;background:#f6f8fa;color:#20242a}
    main{max-width:980px;margin:0 auto;padding:32px 20px}
    input{width:100%;box-sizing:border-box;font-size:18px;padding:12px;border:1px solid #b8c0cc;border-radius:6px}
    article{background:white;border:1px solid #d8dee8;border-radius:6px;margin:14px 0;padding:14px}
    h1{font-size:28px;margin:0 0 16px}
    h2{font-size:18px;margin:0 0 8px}
    code{color:#5b6270}
  </style>
</head>
<body>
<main>
  <h1>DevGov 文件檢索</h1>
  <input id="q" autofocus placeholder="搜尋 registry、templates、docs">
  <section id="results"></section>
</main>
<script>
const results = document.getElementById('results');
const input = document.getElementById('q');
${bootstrapScript}
input.addEventListener('input', () => render(input.value));
function render(query) {
  const terms = query.toLowerCase().split(/\\s+/).filter(Boolean);
  const matches = docs.filter(doc => !terms.length || terms.every(term => (doc.path + ' ' + doc.title + ' ' + doc.tokens.join(' ')).toLowerCase().includes(term))).slice(0, 50);
  results.innerHTML = matches.map(doc => '<article><h2>' + esc(doc.title) + '</h2><code>' + esc(doc.path) + '</code><p>' + esc(doc.preview) + '</p></article>').join('');
}
function esc(value){return String(value).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
</script>
</body>
</html>
`;
}

async function collectFiles(root) {
  const files = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(filePath);
        continue;
      }
      const relativePath = path.relative(root, filePath);
      if (TARGET_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && isAllowedDocument(relativePath)) {
        files.push(filePath);
      }
    }
  }
  await walk(root);
  return files.sort();
}

function isAllowedDocument(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.length === 1) return ALLOWED_TOP_LEVEL_FILES.has(parts[0]);
  return ALLOWED_TOP_LEVEL_DIRS.has(parts[0]);
}

function inferTitle(text, file) {
  const heading = text.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : path.basename(file);
}

function extractTokens(text) {
  return [...new Set(redact(text).toLowerCase().match(/[a-z0-9_.:-]{3,}|[\u4e00-\u9fff]{2,}/g) ?? [])].slice(0, 300);
}

function redact(text) {
  return text
    .replace(/\b(token|secret|password|api_key|key)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1=<redacted>")
    .replace(/\b(Authorization)\s*:\s*(Bearer|Basic)\s+[^,\s;|"'`]+/gi, "$1: $2 <redacted>")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^@\s"'`]+)@/gi, "$1<redacted>@");
}
