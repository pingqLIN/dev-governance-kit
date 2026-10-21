// Single-session stdio MCP acceptance and latency probe; no persistent MCP registration.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(repo, 'scripts', 'uffs-local-mcp-stdio.mjs');
const configModule = process.env.UFFS_LOCAL_FILES_CONFIG_MODULE;
const allowedScope = process.env.UFFS_CANARY_SCOPE;
if (!configModule || !allowedScope)
  throw new Error('Canary host configuration required');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [server],
  env: { ...process.env,
    UFFS_LOCAL_FILES_CONFIG_MODULE: configModule,
    UFFS_CANARY_SCOPE: allowedScope
  },
  stderr: 'pipe'
});
const client = new Client({ name: 'devgov-uffs-single-agent-canary', version: '0.1.0' });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name), ['search_file_names']);
  const positives = [];
  for (let i = 0; i < 15; i++) {
    const t = performance.now();
    const r = await client.callTool({ name: 'search_file_names',
      arguments: { relativeFolder: '', pattern: 'uffs-search-router.mjs', limit: 5 } });
    const ms = performance.now() - t;
    const v = r.structuredContent ?? JSON.parse(r.content[0].text);
    assert.equal(v.status, 'found');
    assert.equal(v.count, 1);
    assert.ok(v.matches[0].path.startsWith(allowedScope.split(':')[0] + ':'));
    assert.ok(!/^[A-Z]:\\/i.test(v.matches[0].path));
    positives.push(ms);
  }
  const denied = await client.callTool({ name: 'search_file_names',
    arguments: { relativeFolder: '../../', pattern: '*.md', limit: 5 } });
  const deniedBody = denied.structuredContent ?? JSON.parse(denied.content[0].text);
  assert.equal(deniedBody.status, 'denied');
  const sorted = positives.toSorted((a,b) => a-b);
  const p = q => Number(sorted[Math.ceil(sorted.length*q)-1].toFixed(2));
  console.log(JSON.stringify({ status: 'pass', tools: tools.tools.map(t=>t.name),
    positiveCalls: positives.length, deniedTest: deniedBody.status,
    p50Ms: p(0.5), p95Ms:p(0.95), maxMs:p(1),
    scopeClass: 'single-local-project-subtree', transport: 'stdio', hostPathsInResults: false }));
} finally {
  await client.close();
}
