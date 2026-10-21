import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLocalFilesScopedSearch } from '../scripts/lib/local-files-scoped-search.mjs';

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'uffs-canary-fixture-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await fs.mkdir(path.join(base, 'project', 'src'), { recursive: true });
  await fs.writeFile(path.join(base, 'project', 'src', 'example.md'), 'test only');
  await fs.writeFile(path.join(base, 'sibling.md'), 'sibling');
  const roots = { 'windows-projects': { rootPath: base, readOnly: false } };
  const router = createLocalFilesScopedSearch({
    getTrustedRoots: async () => roots,
    allowedScope: 'windows-projects:project'
  });
  return { roots, router };
}
test('trusted alias returns only canonical alias paths', async t => {
  const { router } = await fixture(t);
  const r = await router.search({ intent: 'ntfs-metadata',
    scope: 'windows-projects:project/src', pattern: '*.md', limit: 10 });
  assert.equal(r.status, 'found');
  assert.deepEqual(r.matches.map(x => x.path), ['windows-projects:project/src/example.md']);
  assert.equal(JSON.stringify(r).includes('uffs-canary-fixture-'), false);
});
test('rejects broader scopes, sibling scopes, and traversal', async t => {
  const { router } = await fixture(t);
  for (const scope of ['windows-projects:', 'windows-projects:sibling',
    'windows-projects:project/../', 'windows-d:project',
    'windows-projects:project:bad', 'windows-projects:/project']) {
    assert.equal((await router.search({ intent: 'ntfs-metadata', scope, pattern: '*' })).status,
      'denied', scope);
  }
});
test('rejects non-metadata requests and missing trusted roots', async t => {
  const { router, roots } = await fixture(t);
  assert.equal((await router.search({ intent: 'content', scope: 'windows-projects:project' })).status, 'denied');
  delete roots['windows-projects'];
  assert.equal((await router.search({ intent: 'ntfs-metadata',
    scope: 'windows-projects:project', pattern: '*.md' })).status, 'denied');
});

test('junction root escape cannot reveal sibling filenames', async t => {
  const { router, roots } = await fixture(t);
  const link = path.join(roots['windows-projects'].rootPath, 'project', 'outlink');
  try {
    await fs.symlink(roots['windows-projects'].rootPath, link, 'junction');
  } catch (err) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(err.code)) return t.skip('junction unavailable');
    throw err;
  }
  const r = await router.search({ intent: 'ntfs-metadata',
    scope: 'windows-projects:project/outlink', pattern: '*.md' });
  assert.equal(r.status, 'denied');
  assert.equal(r.count, 0);
});
test('canary forces off full-drive UFFS despite host router options', async t => {
  const { roots } = await fixture(t);
  let seen;
  const gate = createLocalFilesScopedSearch({
    getTrustedRoots: async () => roots,
    allowedScope: 'windows-projects:project',
    routerOptions: { enableFullDriveUFFS: true },
    routerFactory: policy => {
      seen = policy;
      return { search: async () => ({ status: 'not_found_with_coverage',
        provider: 'test', matches: [], count: 0, coverage: { complete: true } }) };
    }
  });
  await gate.search({ intent: 'ntfs-metadata',
    scope: 'windows-projects:project/src', pattern: '*.md' });
  assert.equal(seen.enableFullDriveUFFS, false);
});
