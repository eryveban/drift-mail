import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Home view replaces browser confirm with an in-app delete dialog', async () => {
  const source = await readFile(new URL('../src-frontend/views/Home.vue', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\bconfirm\(/);
  assert.match(source, /const showDeleteConfirm = ref\(false\)/);
  assert.match(source, /const deletingAccount = ref\(false\)/);
  assert.match(source, /function requestDeleteAccount\(\)/);
  assert.match(source, /async function confirmDeleteAccount\(\)/);
  assert.match(source, /@click="requestDeleteAccount"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /删除当前邮箱/);
});
