import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_MIN_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_CHARS_PER_TOKEN = 3;

export async function auditContextBudget(options = {}) {
  const root = path.resolve(options.root ?? ".");
  const codexHome = path.resolve(options.codexHome ?? path.join(os.homedir(), ".codex"));
  const skillRoots = options.skillRoots?.length
    ? options.skillRoots.map((skillRoot) => path.resolve(skillRoot))
    : [path.join(codexHome, "skills")];

  await assertDirectory(root, "root");
  if (options.requireCodexHome) {
    await assertDirectory(codexHome, "codexHome");
  }
  if (options.requireSkillRoots) {
    for (const skillRoot of skillRoots) {
      await assertDirectory(skillRoot, "skillRoot");
    }
  }

  const sources = [
    ...await scanAgentsFiles(root),
    ...await scanCodexConfig(codexHome),
    ...await scanSkillManifests(skillRoots)
  ];

  const localSubtotal = sumTokenRanges(sources.filter((source) => source.tokenRange));
  return {
    schema: "devgov.context-budget-audit.v1",
    generatedAt: new Date().toISOString(),
    root,
    codexHome,
    limits: [
      "Platform system, developer, native tool schema, and connector schemas are runtime-owned and not fully observable from local files.",
      "Token counts are estimates based on character ratios, not tokenizer telemetry.",
      "Existing Codex sessions do not shrink after governance changes; start a new session to observe a lower preload surface."
    ],
    summary: {
      localSources: sources.length,
      localEstimatedTokensMin: localSubtotal.min,
      localEstimatedTokensMax: localSubtotal.max,
      agentsFiles: sources.filter((source) => source.kind === "agents-file").length,
      skillManifests: sources.filter((source) => source.kind === "skill-manifest").length,
      mcpServerBlocks: sources
        .filter((source) => source.kind === "codex-config")
        .reduce((count, source) => count + (source.mcpServerBlocks ?? 0), 0)
    },
    sources,
    recommendations: buildRecommendations(sources)
  };
}

export function renderContextBudgetAudit(audit) {
  const lines = [
    "# DevGov Context Budget Audit",
    "",
    `generatedAt: ${audit.generatedAt}`,
    `schema: ${audit.schema}`,
    "",
    "## Summary",
    "",
    `- Local sources: ${audit.summary.localSources}`,
    `- Local estimated tokens: ${audit.summary.localEstimatedTokensMin}-${audit.summary.localEstimatedTokensMax}`,
    `- AGENTS files: ${audit.summary.agentsFiles}`,
    `- Skill manifests: ${audit.summary.skillManifests}`,
    `- MCP server blocks: ${audit.summary.mcpServerBlocks}`,
    "",
    "## Observable Limits",
    ""
  ];

  for (const limit of audit.limits) {
    lines.push(`- ${limit}`);
  }

  lines.push(
    "",
    "## Source Breakdown",
    "",
    "| Kind | Label | Estimate | Notes |",
    "| --- | --- | ---: | --- |"
  );
  for (const source of audit.sources) {
    const estimate = source.tokenRange
      ? `${source.tokenRange.min}-${source.tokenRange.max}`
      : "n/a";
    lines.push(`| ${source.kind} | ${escapeTable(source.label)} | ${estimate} | ${escapeTable(source.notes)} |`);
  }

  lines.push("", "## Recommendations", "");
  for (const recommendation of audit.recommendations) {
    lines.push(`- ${recommendation}`);
  }

  return `${lines.join("\n")}\n`;
}

async function scanAgentsFiles(root) {
  const names = ["AGENTS.md", "AGENTS.CODEX.md", "AGENTS.CHATGPT.md"];
  const results = [];
  for (const name of names) {
    const filePath = path.join(root, name);
    const text = await readTextIfExists(filePath);
    if (text === undefined) continue;
    results.push({
      kind: "agents-file",
      label: name,
      path: filePath,
      charCount: text.length,
      tokenRange: estimateTokenRange(text.length),
      notes: "File-based instruction content that may enter the effective runtime context for this repo."
    });
  }
  return results;
}

async function scanCodexConfig(codexHome) {
  const configPath = path.join(codexHome, "config.toml");
  const text = await readTextIfExists(configPath);
  if (text === undefined) return [];
  const mcpServerBlocks = [...text.matchAll(/^\s*\[mcp_servers\.[^\]]+\]\s*$/gim)].length;
  const enabledHints = [...text.matchAll(/^\s*enabled\s*=\s*true\s*$/gim)].length;
  const disabledHints = [...text.matchAll(/^\s*enabled\s*=\s*false\s*$/gim)].length;
  return [{
    kind: "codex-config",
    label: "codex config shape",
    path: configPath,
    charCount: text.length,
    tokenRange: estimateTokenRange(text.length),
    mcpServerBlocks,
    enabledHints,
    disabledHints,
    notes: `Config shape only; found ${mcpServerBlocks} MCP server blocks, ${enabledHints} enabled hints, ${disabledHints} disabled hints.`
  }];
}

async function scanSkillManifests(skillRoots) {
  const results = [];
  for (const skillRoot of skillRoots) {
    const skillFiles = await findSkillFiles(skillRoot);
    for (const filePath of skillFiles) {
      const text = await readTextIfExists(filePath);
      if (text === undefined) continue;
      const manifest = extractSkillManifest(text);
      results.push({
        kind: "skill-manifest",
        label: manifest.name ?? path.basename(path.dirname(filePath)),
        path: filePath,
        charCount: manifest.text.length,
        tokenRange: estimateTokenRange(manifest.text.length),
        notes: manifest.description
          ? truncateSingleLine(manifest.description, 120)
          : "Skill manifest/header estimate; full body should stay lazy-loaded."
      });
    }
  }
  return results.sort((left, right) => left.label.localeCompare(right.label));
}

async function findSkillFiles(root) {
  const rootStat = await fs.stat(root).catch(() => undefined);
  if (!rootStat?.isDirectory()) return [];
  const found = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") {
        found.push(entryPath);
      }
    }
  }
  return found;
}

async function assertDirectory(directoryPath, label) {
  const stat = await fs.stat(directoryPath).catch((error) => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (!stat?.isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${directoryPath}`);
  }
}

function extractSkillManifest(text) {
  const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const headerMatch = text.match(/^#\s+(.+)$/m);
  const nameMatch = text.match(/^name:\s*(.+)$/m);
  const descriptionMatch = text.match(/^description:\s*(.+)$/m);
  const manifestText = frontmatterMatch?.[0]
    ?? text.split(/\r?\n/).slice(0, 12).join("\n");
  return {
    text: manifestText,
    name: cleanYamlScalar(nameMatch?.[1]) ?? headerMatch?.[1]?.trim(),
    description: cleanYamlScalar(descriptionMatch?.[1])
  };
}

function cleanYamlScalar(value) {
  if (!value) return undefined;
  return value.trim().replace(/^["']|["']$/g, "");
}

function estimateTokenRange(charCount) {
  return {
    min: Math.ceil(charCount / DEFAULT_MIN_CHARS_PER_TOKEN),
    max: Math.ceil(charCount / DEFAULT_MAX_CHARS_PER_TOKEN)
  };
}

function sumTokenRanges(sources) {
  return sources.reduce((sum, source) => ({
    min: sum.min + source.tokenRange.min,
    max: sum.max + source.tokenRange.max
  }), { min: 0, max: 0 });
}

function buildRecommendations(sources) {
  const recommendations = [
    "Keep global-home instructions as a short router and safety baseline; move platform, workspace, and repo details into narrower overlays.",
    "Keep skill bodies lazy-loaded. Startup context should include only short trigger metadata unless a task matches the skill.",
    "Treat reports as local evidence; promote only stable routing rules and budget gates into registry data."
  ];
  if (sources.some((source) => source.kind === "codex-config" && source.mcpServerBlocks > 0)) {
    recommendations.push("Review enabled MCP server blocks separately; broad connector/tool schemas are a hidden runtime cost even when local files only show config shape.");
  }
  if (sources.filter((source) => source.kind === "skill-manifest").length > 20) {
    recommendations.push("Large skill inventories should be exposed through a compact routing index, not pasted as full descriptions into every session.");
  }
  return recommendations;
}

async function readTextIfExists(filePath) {
  return fs.readFile(filePath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
}

function truncateSingleLine(value, maxLength) {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 3)}...` : oneLine;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
