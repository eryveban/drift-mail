import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';

function createDbMock() {
  const existingObjects = new Set();
  const statements = [];

  function createStatement(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    return {
      bind() {
        return this;
      },
      async all() {
        if (/FROM sqlite_(schema|master)/i.test(normalized)) {
          return {
            results: [...existingObjects].map((name) => ({ name })),
          };
        }

        if (/SELECT id, domain, is_verified, created_at FROM domains/i.test(normalized)) {
          if (!existingObjects.has('domains')) {
            throw new Error('no such table: domains');
          }
          return { results: [] };
        }

        if (/SELECT domain FROM domains/i.test(normalized)) {
          if (!existingObjects.has('domains')) {
            throw new Error('no such table: domains');
          }
          return { results: [] };
        }

        if (/SELECT id FROM accounts WHERE expires_at/i.test(normalized)) {
          if (!existingObjects.has('accounts')) {
            throw new Error('no such table: accounts');
          }
          return { results: [] };
        }

        return { results: [] };
      },
      async run() {
        const tableMatch = normalized.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i);
        if (tableMatch) {
          existingObjects.add(tableMatch[1]);
        }

        const indexMatch = normalized.match(/^CREATE INDEX IF NOT EXISTS (\w+)/i);
        if (indexMatch) {
          existingObjects.add(indexMatch[1]);
        }

        return { success: true };
      },
    };
  }

  return {
    statements,
    prepare(sql) {
      statements.push(sql);
      return createStatement(sql);
    },
  };
}

test('fetch ensures schema even when KV initialization marker is stale', async () => {
  const db = createDbMock();
  const env = {
    ACCESS_KEY: 'secret',
    DB: db,
    MAIL_KV: {
      async get(key) {
        return key === 'db_initialized' ? 'true' : null;
      },
      async put() {},
    },
  };

  const response = await worker.fetch(
    new Request('https://example.com/api/domains', {
      headers: { 'X-Access-Key': 'secret' },
    }),
    env,
    {},
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body['hydra:member'], []);
  assert.ok(
    db.statements.some((sql) => /CREATE TABLE IF NOT EXISTS domains/i.test(sql)),
    'expected schema creation before querying domains',
  );
});

test('scheduled ensures schema before cleanup queries run', async () => {
  const db = createDbMock();
  const env = {
    DB: db,
    MAIL_KV: {
      async get() {
        return 'true';
      },
      async put() {},
    },
  };

  await worker.scheduled({}, env, {});

  assert.ok(
    db.statements.some((sql) => /CREATE TABLE IF NOT EXISTS accounts/i.test(sql)),
    'expected schema creation before scheduled cleanup',
  );
});
