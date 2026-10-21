// DevGov UFFS search-router canary (trusted Windows host only).
// This is NOT an HTTP/MCP endpoint or a multi-tenant authorization broker.
// Caller input is request; trusted policy must be constructed by the host, not the LLM.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const win = path.win32;
const SENSITIVE_PARTS = new Set(['.ssh', '.aws', '.cloudflare', '.gnupg', '.env', 'id_rsa', 'id_ed25519', 'credentials.json', 'token.json']);
// Mirror the Local Files MCP fs_search directory exclusions for this canary.
const SEARCH_SKIP_DIRS = new Set(['.git', '.cache', '.clean', '.del', '.next', '.turbo', '.venv', '__pycache__', 'build', 'coverage', 'dist', 'node_modules', 'out']);
const INTENTS = new Set(['ntfs-metadata', 'content', 'git', 'semantic', 'external', 'none']);
const DELEGATED = { content: 'authorized-content-search', git: 'git-aware-search', semantic: 'document-semantic-search', external: 'provider-native-search' };
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_ENTRIES = 50000;
const TIMEOUT_MS = 8000;

function result(status, provider, matches = [], reason = null, coverage = {}) {
  return { status, provider, matches, count: matches.length, reason, coverage, observedAt: new Date().toISOString() };
}

function driveOf(p) {
  const m = /^([a-z]):\\/i.exec(p);
  return m ? m[1].toUpperCase() : null;
}

function isVolumeRoot(p) {
  return /^[A-Z]:\\$/i.test(p);
}

function under(p, root) {
  const rel = win.relative(root, p);
  return rel === '' || (rel !== '..' && !rel.startsWith('..\\') && !win.isAbsolute(rel));
}

function containsSensitive(p) {
  return p.split(/[\\/]+/).some(s => {
    const n = s.toLowerCase();
    return SENSITIVE_PARTS.has(n) || n.startsWith('.env.') || n.startsWith('secret.') ||
      n.startsWith('secrets.') || /\.(pem|pfx|p12|key)$/i.test(n) || /_(rsa|ed25519)$/.test(n);
  });
}

function canonicalInput(input) {
  if (typeof input !== 'string' || input.length > 1024 || !win.isAbsolute(input) ||
      input.includes('\0') || /[\r\n]/.test(input) || /^\\\\/.test(input) ||
      /^\\\\[?.]/.test(input) || /^[A-Z]:[^\\]/i.test(input)) return null;
  if (input.split(/[\\/]+/).some(part => part === '..' || part === '.')) return null;
  const normalized = win.normalize(input);
  return driveOf(normalized) ? normalized : null;
}

function normalizePolicyRoots(roots) {
  if (!Array.isArray(roots) || roots.length === 0) return [];
  return roots.map(canonicalInput).filter(Boolean);
}

function matchName(pattern) {
  // Search mode: literal filename substring; '*' and '?' are wildcards.
  if (!/[*?]/.test(pattern)) {
    const q = pattern.toLowerCase();
    return filename => filename.toLowerCase().includes(q);
  }
  const escape = x => x.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp('^' + pattern.split('*').map(segment =>
    segment.split('?').map(escape).join('.')).join('.*') + '$', 'i');
  return filename => re.test(filename);
}

async function verifyScope(root, policy, filesystem) {
  const requested = canonicalInput(root);
  const permitted = normalizePolicyRoots(policy.allowedRoots);
  if (!requested || containsSensitive(requested) || permitted.length === 0 ||
      !permitted.some(p => under(requested, p))) return null;
  // Canonicalize both sides before permitting filesystem traversal. This is
  // important for Windows junction/reparse-point scope escapes.
  try {
    const realRequested = win.normalize(await filesystem.realpath(requested));
    let realAllowed = false;
    for (const allowed of permitted.filter(p => under(requested, p))) {
      const resolvedAllowed = win.normalize(await filesystem.realpath(allowed));
      if (under(realRequested, resolvedAllowed)) realAllowed = true;
    }
    if (!realAllowed || containsSensitive(realRequested)) return null;
    const st = await filesystem.lstat(realRequested);
    if (!st.isDirectory()) return null;
    return { root: realRequested, drive: driveOf(realRequested), completeRoot: isVolumeRoot(realRequested) };
  } catch {
    return null;
  }
}

function parseUffsLines(text, scope, limit) {
  const output = [];
  let rejected = 0, malformed = 0, overflow = false, rows = 0;
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    rows++;
    let item;
    try { item = JSON.parse(line); } catch { malformed++; continue; }
    const p = canonicalInput(item.path);
    if (!p || !under(p, scope.root) || containsSensitive(p) ||
        (item.is_directory && scope.filesOnly)) { rejected++; continue; }
    if (output.length >= limit) { overflow = true; break; }
    output.push({ path: p, name: win.basename(p), source: 'uffs-cli', size: Number.isFinite(item.size) ? item.size : undefined });
  }
  return { output, rejected, malformed, overflow, rows };
}

async function nativeSearch(scope, pattern, limit, policy, filesystem) {
  const filter = matchName(pattern);
  const queue = [scope.root];
  const matches = [];
  const maxEntries = Math.max(limit, Math.min(policy.maxEntries || MAX_ENTRIES, 100000));
  const deadline = Date.now() + Math.min(policy.timeoutMs || TIMEOUT_MS, 30000);
  let visited = 0, incomplete = false, reason = null;
  while (queue.length) {
    if (Date.now() > deadline || visited >= maxEntries) {
      incomplete = true; reason = 'search_budget_exhausted'; break;
    }
    const dir = queue.shift();
    let children;
    try { children = await filesystem.readdir(dir, { withFileTypes: true }); }
    catch { incomplete = true; reason = 'directory_unreadable'; continue; }
    for (const child of children) {
      if (++visited > maxEntries || Date.now() > deadline) {
        incomplete = true; reason = 'search_budget_exhausted'; break;
      }
      const p = win.join(dir, child.name);
      if (containsSensitive(p)) { incomplete = true; reason ||= 'sensitive_path_skipped'; continue; }
      if (child.isSymbolicLink()) { incomplete = true; reason ||= 'reparse_point_skipped'; continue; }
      if (child.isDirectory() && SEARCH_SKIP_DIRS.has(child.name.toLowerCase())) {
        incomplete = true; reason ||= 'excluded_directory_skipped'; continue;
      }
      if (child.isDirectory()) {
        // lstat protects against a raced replacement or Windows junction.
        try {
          const st = await filesystem.lstat(p);
          if (st.isSymbolicLink()) { incomplete = true; reason ||= 'reparse_point_skipped'; }
          else if (st.isDirectory()) queue.push(p);
        } catch { incomplete = true; reason ||= 'directory_unreadable'; }
      } else if (!scope.filesOnly || child.isFile()) {
        if (filter(child.name)) {
          if (matches.length >= limit) { incomplete = true; reason = 'result_limit'; break; }
          matches.push({ path: p, name: child.name, source: 'native-fs' });
        }
      }
    }
    if (reason === 'search_budget_exhausted' || reason === 'result_limit') break;
  }
  // Denied or skipped sensitive paths are deliberately not enumerated.
  const coverage = { complete: !incomplete, scope: 'authorized-root', visitedEntries: visited };
  return result(matches.length ? 'found' : incomplete ? 'partial' : 'not_found_with_coverage',
    'native-fs', matches, reason, coverage);
}

async function runUffs(scope, pattern, limit, policy, runner) {
  const exe = policy.uffsExecutable;
  if (!exe || !win.isAbsolute(exe)) return null;
  try {
    const opts = { windowsHide: true, timeout: Math.min(policy.timeoutMs || TIMEOUT_MS, 30000), maxBuffer: 1024 * 1024 };
    // Explicit status check prevents search from implicitly starting a daemon in normal operation.
    const { stdout: daemon } = await runner(exe, ['--daemon', 'status', '--verbose'], opts);
    if (!/running/i.test(daemon) || /not running/i.test(daemon)) return null;
    const m = daemon.match(/── Drives ──([\s\S]*?)(?:──|$)/);
    if (!m || !new RegExp('^\\s*[●*]\\s*' + scope.drive + ':', 'mi').test(m[1])) return null;
    const { stdout } = await runner(exe,
      ['--search', pattern, '--drive', scope.drive, '--limit', String(limit + 1), '--format', 'json', ...(scope.filesOnly ? ['--files-only'] : [])], opts);
    const parsed = parseUffsLines(stdout, scope, limit);
    const backendCapped = parsed.rows >= limit + 1;
    if (parsed.malformed) return result(parsed.output.length ? 'found' : 'partial', 'uffs-cli', parsed.output, 'malformed_backend_output',
      { complete: false, scope: 'full-indexed-volume' });
    if (parsed.overflow || backendCapped) return result(parsed.output.length ? 'found' : 'partial', 'uffs-cli', parsed.output, 'backend_result_cap',
      { complete: false, scope: 'full-indexed-volume' });
    if (parsed.output.length) return result('found', 'uffs-cli', parsed.output, null,
      { complete: true, scope: 'full-indexed-volume' });
    // A zero-hit query is not proof of absence, even when the daemon reports an indexed volume.
    return result('partial', 'uffs-cli', [], 'zero_hits_not_verified', { complete: false, scope: 'full-indexed-volume' });
  } catch (error) {
    return result('unavailable', 'uffs-cli', [], error.code === 'ETIMEDOUT' ? 'timeout' : 'uffs_not_ready',
      { complete: false, scope: 'full-indexed-volume' });
  }
}

/**
 * Trusted host policy is supplied separately from untrusted Agent requests.
 * Returns metadata only; no content reads, write operations, elevation, or service starts.
 *
 * A full-volume UFFS call is allowed only when that exact root is allowlisted
 * and enableFullDriveUFFS=true. Scoped subtrees use the safe native fallback
 * until a verifiable *pre-query* subtree filter is available from UFFS.
 */
export function createSearchRouter(policy = {}, dependencies = {}) {
  const filesystem = dependencies.fs || fs;
  const runner = dependencies.execFile || execFile;
  return {
    async search(request) {
      if (!request || !INTENTS.has(request.intent)) return result('error', null, [], 'invalid_intent');
      if (request.intent === 'none') return result('not_required', null);
      if (DELEGATED[request.intent]) {
        // File-content and Git delegation still require an approved local root.
        // External/semantic tools own their separate provider-specific auth.
        if (request.intent === 'content' || request.intent === 'git') {
          if (!await verifyScope(request.scope, policy, filesystem))
            return result('denied', null, [], 'scope_not_authorized');
        }
        return result('routed', DELEGATED[request.intent], [], 'use_authorized_provider');
      }
      if (typeof request.pattern !== 'string' || !request.pattern.trim() ||
          request.pattern.length > 256 || /[\0\r\n]/.test(request.pattern)) {
        return result('error', null, [], 'invalid_pattern');
      }
      const limit = request.limit ?? DEFAULT_LIMIT;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return result('error', null, [], 'invalid_limit');
      const scope = await verifyScope(request.scope, policy, filesystem);
      if (!scope) return result('denied', null, [], 'scope_not_authorized');
      scope.filesOnly = request.filesOnly !== false;
      if (scope.completeRoot && policy.enableFullDriveUFFS === true) {
        const fast = await runUffs(scope, request.pattern, limit, policy, runner);
        if (fast && fast.status === 'found') return fast;
        if (fast && fast.status === 'partial' && fast.count > 0) return fast;
        // Do not recursively crawl an entire volume as an automatic fallback.
        if (fast) return fast;
        return result('unavailable', 'uffs-cli', [], 'daemon_or_index_unavailable',
          { complete: false, scope: 'full-volume' });
      }
      const fallback = await nativeSearch(scope, request.pattern, limit, policy, filesystem);
      if (policy.enableFullDriveUFFS && !scope.completeRoot)
        fallback.routingReason = 'uffs_subtree_filter_not_verified';
      return fallback;
    }
  };
}
