#!/usr/bin/env node
// One trusted local Agent session only. No HTTP, no network listener, no write tools.
// Environment policy is host-owned. Do not expose as a remote/public MCP endpoint.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createLocalFilesScopedSearch } from './lib/local-files-scoped-search.mjs';

async function main() {
  const modulePath = process.env.UFFS_LOCAL_FILES_CONFIG_MODULE;
  const pinnedScope = process.env.UFFS_CANARY_SCOPE;
  if (!modulePath || !path.win32.isAbsolute(modulePath) || !pinnedScope)
    throw new Error('Missing trusted local configuration module / canary scope');
  // The trusted operator selects this installed Local Files MCP config source.
  // No raw paths or policy configuration are passed by the calling agent.
  const localFiles = await import(pathToFileURL(modulePath).href);
  if (typeof localFiles.loadConfig !== 'function')
    throw new Error('Trusted Local Files configuration loader unavailable');

  const router = createLocalFilesScopedSearch({
    allowedScope: pinnedScope,
    getTrustedRoots: async () => {
      const config = localFiles.loadConfig();
      if (!config?.roots || typeof config.roots !== 'object')
        throw new Error('Local Files MCP roots not configured');
      return config.roots;
    }
  });

  const server = new McpServer({
    name: 'devgov-uffs-scope-canary',
    version: '0.1.0'
  }, { instructions: 'Trusted local canary. Filename metadata only under a pinned Local Files alias. No file reads, writing, arbitrary roots, host paths, HTTP or root discovery.' });

  server.registerTool('search_file_names', {
    title: 'Scoped filename search',
    description: 'Read-only filename search strictly inside one operator-pinned Local Files MCP alias subtree. Results are aliases, never raw Windows paths.',
    inputSchema: {
      relativeFolder: z.string().max(256).default(''),
      pattern: z.string().min(1).max(256),
      limit: z.number().int().min(1).max(50).default(20)
    }
  }, async ({ relativeFolder, pattern, limit }) => {
    const req = { intent: 'ntfs-metadata',
      scope: pinnedScope + (relativeFolder ? '/' + relativeFolder : ''),
      pattern, limit };
    try {
      const result = await router.search(req);
      return {
        isError: result.status === 'denied' || result.status === 'error',
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result
      };
    } catch {
      return { isError: true, content: [{ type: 'text',
        text: JSON.stringify({ status: 'unavailable', reason: 'trusted_policy_unavailable' }) }] };
    }
  });

  await server.connect(new StdioServerTransport());
}
main().catch(() => {
  // Never dump environment variables, filesystem roots or auth context.
  process.stderr.write('Local UFFS canary startup failed (configuration unavailable).\n');
  process.exitCode = 1;
});
