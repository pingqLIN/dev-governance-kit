import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSearchRouter } from '../scripts/lib/uffs-search-router.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devgov-uffs-test-'));
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  await fs.mkdir(path.join(dir, 'nested'));
  await fs.mkdir(path.join(dir, '.ssh'));
  await fs.writeFile(path.join(dir, 'my-test-file.md'), 'fixture');
  await fs.writeFile(path.join(dir, 'nested', 'report.txt'), 'report');
  await fs.writeFile(path.join(dir, '.env'), 'never disclose');
  await fs.writeFile(path.join(dir, '.ssh', 'id_rsa'), 'never disclose');
  return dir;
}

function fakeFullDriveFs() {
  return { realpath: async p => p, lstat: async () => ({ isDirectory: () => true }) };
}
const ready = '● running\n── Drives ──\n  ● C:    100 records (live)\n── Physical drives ──';
const line = (p) => JSON.stringify({ path: p, name: path.win32.basename(p), size: 7, is_directory: false });

test('native fallback finds names inside an approved subtree only', async t => {
  const dir = await fixture(t);
  const router = createSearchRouter({ allowedRoots: [dir] });
  const res = await router.search({ intent: 'ntfs-metadata', scope: dir, pattern: '*.md' });
  assert.equal(res.status, 'found');
  assert.equal(res.provider, 'native-fs');
  assert.equal(res.matches.length, 1);
  assert.equal(res.matches[0].name, 'my-test-file.md');
  assert.equal(res.coverage.complete, false, 'excluded areas are not full coverage');
});

test('scoped searches do not call UFFS even if whole-drive UFFS is enabled', async t => {
  const dir = await fixture(t);
  let calls = 0;
  const router = createSearchRouter({ allowedRoots: [dir], uffsExecutable: 'C:\\Tools\\UFFS\\uffs.exe', enableFullDriveUFFS: true },
    { execFile: async () => { ++calls; throw new Error('must not use whole-drive index'); } });
  const res = await router.search({ intent: 'ntfs-metadata', scope: dir, pattern: 'my-test' });
  assert.equal(calls, 0);
  assert.equal(res.routingReason, 'uffs_subtree_filter_not_verified');
  assert.equal(res.status, 'found');
});

test('missing result has bounded complete coverage, not a UFFS inference', async t => {
  const dir = await fixture(t);
  const res = await createSearchRouter({ allowedRoots: [dir] }).search({
    intent: 'ntfs-metadata', scope: path.join(dir, 'nested'), pattern: '__not-a-file__'
  });
  assert.equal(res.status, 'not_found_with_coverage');
  assert.equal(res.coverage.complete, true);
});

test('sensitive filenames, paths and escaped scopes are never returned', async t => {
  const dir = await fixture(t);
  const router = createSearchRouter({ allowedRoots: [dir] });
  const r = await router.search({ intent: 'ntfs-metadata', scope: dir, pattern: '*' });
  assert.ok(r.matches.every(m => !/\.env|\.ssh|id_rsa/.test(m.path)));
  const forbidden = await router.search({ intent: 'ntfs-metadata', scope: path.join(dir, '.ssh'), pattern: '*' });
  assert.equal(forbidden.status, 'denied');
  const parent = await router.search({ intent: 'ntfs-metadata', scope: path.dirname(dir), pattern: '*' });
  assert.equal(parent.status, 'denied');
  const sibling = await router.search({ intent: 'ntfs-metadata', scope: dir + '-other', pattern: '*' });
  assert.equal(sibling.status, 'denied');
  const traversal = await router.search({ intent: 'ntfs-metadata', scope: dir + '\\..\\', pattern: '*' });
  assert.equal(traversal.status, 'denied');
});

test('search budget produces partial, not proof of absence', async t => {
  const dir = await fixture(t);
  const router = createSearchRouter({ allowedRoots: [dir], maxEntries: 1 });
  const r = await router.search({ intent: 'ntfs-metadata', scope: dir, pattern: 'missing', limit: 1 });
  assert.equal(r.status, 'partial');
  assert.equal(r.coverage.complete, false);
});

test('invalid arguments, no tool and explicit delegation are distinct', async t => {
  const dir = await fixture(t);
  const router = createSearchRouter({ allowedRoots: [dir] });
  assert.equal((await router.search({ intent: 'none' })).status, 'not_required');
  assert.equal((await router.search({ intent: 'content', scope: dir, pattern: 'abc' })).provider, 'authorized-content-search');
  assert.equal((await router.search({ intent: 'git', scope: dir })).provider, 'git-aware-search');
  assert.equal((await router.search({ intent: 'content', scope: path.join(dir, '.ssh'), pattern: 'x' })).status, 'denied');
  assert.equal((await router.search({ intent: 'ntfs-metadata', scope: dir, pattern: '', limit: 3 })).status, 'error');
  assert.equal((await router.search({ intent: 'ntfs-metadata', scope: dir, pattern: 'test', limit: 9999 })).status, 'error');
  assert.equal((await router.search({ intent: 'ntfs-metadata', scope: dir, pattern: 'test', limit: '10' })).status, 'error');
});

test('full-drive UFFS read-only execution uses array arguments and filters metadata', async () => {
  const calls = [];
  const runner = async (exe, args, options) => {
    calls.push({ exe, args, options });
    if (args[0] === '--daemon') return { stdout: ready };
    return { stdout: [line('C:\\in-scope.txt'), line('D:\\out-of-scope.txt'), line('C:\\.env'), line('C:\\other.txt')].join('\n') };
  };
  const router = createSearchRouter({
    allowedRoots: ['C:\\'], uffsExecutable: 'C:\\Tools\\UFFS\\uffs.exe', enableFullDriveUFFS: true
  }, { fs: fakeFullDriveFs(), execFile: runner });
  const r = await router.search({ intent: 'ntfs-metadata', scope: 'C:\\', pattern: '*.txt', limit: 5 });
  assert.equal(r.status, 'found');
  assert.deepEqual(r.matches.map(x => x.path), ['C:\\in-scope.txt', 'C:\\other.txt']);
  assert.deepEqual(calls[1].args, ['--search', '*.txt', '--drive', 'C', '--limit', '6', '--format', 'json', '--files-only']);
  assert.equal(calls.length, 2);
});

test('unindexed drive cannot be mistaken for not-found or auto-started', async () => {
  let calls = 0;
  const router = createSearchRouter({ allowedRoots: ['D:\\'], uffsExecutable: 'D:\\tools\\uffs.exe', enableFullDriveUFFS: true },
    { fs: fakeFullDriveFs(), execFile: async () => { ++calls; return { stdout: ready }; } });
  const r = await router.search({ intent: 'ntfs-metadata', scope: 'D:\\', pattern: 'anything' });
  assert.equal(r.status, 'unavailable');
  assert.equal(calls, 1);
  assert.equal(r.reason, 'daemon_or_index_unavailable');
});

test('index zero-hit is uncertain and is not declared absent', async () => {
  const router = createSearchRouter({ allowedRoots: ['C:\\'], uffsExecutable: 'C:\\tools\\uffs.exe', enableFullDriveUFFS: true },
    { fs: fakeFullDriveFs(), execFile: async (_ex, a) => ({ stdout: a[0] === '--daemon' ? ready : '' }) });
  const r = await router.search({ intent: 'ntfs-metadata', scope: 'C:\\', pattern: 'nonexistent' });
  assert.equal(r.status, 'partial');
  assert.equal(r.reason, 'zero_hits_not_verified');
});

test('UFFS limit, invalid NDJSON and timeout have explicit non-success states', async () => {
  const policy = { allowedRoots: ['C:\\'], uffsExecutable: 'C:\\tools\\uffs.exe', enableFullDriveUFFS: true };
  const fsFake = fakeFullDriveFs();
  const limited = createSearchRouter(policy, { fs: fsFake, execFile: async (_e, args) =>
    ({ stdout: args[0] === '--daemon' ? ready : [line('C:\\one.txt'),line('C:\\two.txt')].join('\n') }) });
  const a = await limited.search({ intent: 'ntfs-metadata', scope: 'C:\\', pattern: '*.txt', limit: 1 });
  assert.equal(a.status, 'found');
  assert.equal(a.coverage.complete, false);
  const bad = createSearchRouter(policy, { fs: fsFake, execFile: async (_e, args) =>
    ({ stdout: args[0] === '--daemon' ? ready : '{"bad":' }) });
  const b = await bad.search({ intent: 'ntfs-metadata', scope: 'C:\\', pattern: '*.txt' });
  assert.equal(b.status, 'partial');
  const down = createSearchRouter(policy, { fs: fsFake, execFile: async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); } });
  const c = await down.search({ intent: 'ntfs-metadata', scope: 'C:\\', pattern: '*.txt' });
  assert.equal(c.status, 'unavailable');
});

test('unsafe UNC/device roots and caller-provided non-allowlisted drives are denied', async () => {
  const router = createSearchRouter({ allowedRoots: ['C:\\'], uffsExecutable: 'C:\\tools\\uffs.exe', enableFullDriveUFFS: true },
    { fs: fakeFullDriveFs() });
  for (const scope of ['\\\\server\\share', '\\\\?\\C:\\', 'D:\\', 'C:\\x\\..\\', 'C:\\.ssh']) {
    const r = await router.search({ intent: 'ntfs-metadata', scope, pattern: '*' });
    assert.equal(r.status, 'denied', scope);
  }
});
