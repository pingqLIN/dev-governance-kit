// Local Files MCP alias parity gate for a trusted single-user local stdio canary.
// Trust contract: getTrustedRoots and allowedScope are HOST owned, never MCP tool inputs.
// This is not Cloudflare Access authentication or a replacement for server-side ACLs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createSearchRouter } from './uffs-search-router.mjs';

const win = path.win32;
const DENIED = new Set(['.git', '.ssh', '.aws', '.cloudflare', '.gnupg', '.env',
  'id_rsa', 'id_ed25519', 'credentials.json', 'token.json']);
const SKIP = new Set(['.cache', '.clean', '.del', '.next', '.turbo', '.venv',
  '__pycache__', 'build', 'coverage', 'dist', 'node_modules', 'out']);
const MAX_LIMIT = 50;

function subpathIsSafe(s) {
  if (typeof s !== 'string' || s.length > 1000 || /[\0\r\n]/.test(s)) return false;
  if (win.isAbsolute(s) || /^[/\\]/.test(s) || /^[a-z]:/i.test(s)) return false;
  return !s.split(/[\\/]+/).some(p => p === '.' || p === '..' || p.includes(':'));
}
function denyComponent(name) {
  const n = name.toLowerCase();
  return DENIED.has(n) || /^\.env\./.test(n) || /^secrets?(\.|$)/.test(n) ||
    /\.(key|p12|pem|pfx)$/i.test(n) || /_(ed25519|rsa)$/.test(n);
}
function denied(relative) {
  return relative.split(/[\\/]+/).some(denyComponent);
}
function blockedForSearch(relative) {
  return relative.split(/[\\/]+/).some(p => SKIP.has(p.toLowerCase()) || denyComponent(p));
}
function within(p, root) {
  const rel = win.relative(root, p);
  return rel === '' || (rel !== '..' && !rel.startsWith('..\\') && !win.isAbsolute(rel));
}
function splitAlias(input) {
  const m = /^([a-z-]+):(.*)$/.exec(input);
  if (!m || !subpathIsSafe(m[2])) return null;
  return { alias: m[1], relative: m[2].replaceAll('/', '\\') };
}
function deniedResponse(reason = 'scope_not_authorized') {
  return { status: 'denied', provider: null, matches: [], count: 0, reason,
    coverage: { complete: false }, observedAt: new Date().toISOString() };
}

export function createLocalFilesScopedSearch({ getTrustedRoots, allowedScope, fsApi = fs,
  routerFactory = createSearchRouter, routerOptions = {} }) {
  if (typeof getTrustedRoots !== 'function' || !splitAlias(allowedScope))
    throw new Error('Trusted root source and pinned alias scope required');
  const pinned = splitAlias(allowedScope);
  if (!pinned.relative || denied(pinned.relative) || blockedForSearch(pinned.relative))
    throw new Error('Pin a specific non-sensitive project subtree, not an entire volume');
  // Load roots on each call: no stale cache of a moved/reconfigured root.
  return {
    async search(request) {
      if (!request || request.intent !== 'ntfs-metadata') return deniedResponse('metadata_only_canary');
      const input = splitAlias(request.scope);
      if (!input || input.alias !== pinned.alias) return deniedResponse();
      if (denied(input.relative) || blockedForSearch(input.relative)) return deniedResponse();
      const rootConfig = await getTrustedRoots();
      const raw = rootConfig && rootConfig[pinned.alias];
      if (!raw || typeof raw.rootPath !== 'string') return deniedResponse('alias_missing_from_trusted_config');
      const allowed = win.resolve(raw.rootPath, pinned.relative);
      const candidate = win.resolve(raw.rootPath, input.relative);
      const root = win.resolve(raw.rootPath);
      if (!within(allowed, root) || !within(candidate, allowed)) return deniedResponse();
      let allowedReal, candidateReal, actualRoot;
      try {
        actualRoot = win.normalize(await fsApi.realpath(root));
        allowedReal = win.normalize(await fsApi.realpath(allowed));
        candidateReal = win.normalize(await fsApi.realpath(candidate));
        if (!within(allowedReal, actualRoot) || !within(candidateReal, allowedReal))
          return deniedResponse('resolved_path_outside_scope');
        if (!(await fsApi.lstat(candidateReal)).isDirectory()) return deniedResponse();
      } catch {
        return deniedResponse('missing_or_unverifiable_scope');
      }
      const router = routerFactory({ ...routerOptions, allowedRoots: [allowedReal],
        enableFullDriveUFFS: false }, { fs: fsApi });
      // Force local-only scoped search. Do not take executable/privilege knobs from requests.
      const r = await router.search({ intent: 'ntfs-metadata', scope: candidateReal,
        pattern: request.pattern, limit: Math.min(request.limit ?? 20, MAX_LIMIT), filesOnly: true });
      const matches = [];
      for (const item of r.matches ?? []) {
        const p = win.normalize(item.path ?? '');
        if (!within(p, allowedReal)) continue;
        const relFromAlias = win.relative(actualRoot, p);
        if (denied(relFromAlias) || blockedForSearch(relFromAlias)) continue;
        // A returned canonical alias never embeds the real local host root.
        matches.push({ path: pinned.alias + ':' + relFromAlias.replaceAll('\\', '/'),
          name: win.basename(p), source: item.source });
      }
      const coverage = { ...r.coverage, canonicalAlias: pinned.alias, complete: r.coverage?.complete === true };
      return { ...r, matches, count: matches.length, coverage, provider: r.provider,
        scopeAlias: request.scope };
    }
  };
}
