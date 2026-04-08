import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { extractApiDocSections, renderApiDocHtml } from '../src-frontend/utils/api-doc.js';

test('extractApiDocSections returns h2 and h3 headings with stable ids', () => {
  const markdown = `# DriftMail API 文档

## 基础信息

### GET /api/domains

## 邮箱账户

### POST /api/token
`;

  assert.deepEqual(extractApiDocSections(markdown), [
    { level: 2, text: '基础信息', id: '基础信息' },
    { level: 3, text: 'GET /api/domains', id: 'get-api-domains' },
    { level: 2, text: '邮箱账户', id: '邮箱账户' },
    { level: 3, text: 'POST /api/token', id: 'post-api-token' },
  ]);
});

test('renderApiDocHtml renders headings, lists, tables and code blocks', () => {
  const markdown = `# DriftMail API 文档

- **Base URL**: \`https://example.com\`

| 字段 | 类型 |
|------|------|
| id | string |

\`\`\`json
{"ok": true}
\`\`\`
`;

  const html = renderApiDocHtml(markdown);

  assert.match(html, /<h1 id="driftmail-api-文档">DriftMail API 文档<\/h1>/);
  assert.match(html, /<ul class="api-doc-list">/);
  assert.match(html, /<strong>Base URL<\/strong>/);
  assert.match(html, /<table class="api-doc-table">/);
  assert.match(html, /<code class="api-doc-inline-code">https:\/\/example\.com<\/code>/);
  assert.match(html, /<pre class="api-doc-code-block"><code>\{&quot;ok&quot;: true\}<\/code><\/pre>/);
});

test('API docs include project integration examples for Base URL and ACCESS_KEY', async () => {
  const [markdown, docsView] = await Promise.all([
    readFile(new URL('../API.md', import.meta.url), 'utf8'),
    readFile(new URL('../src-frontend/views/ApiDocs.vue', import.meta.url), 'utf8'),
  ]);

  assert.match(markdown, /## 项目接入示例/);
  assert.match(markdown, /Base URL/);
  assert.match(markdown, /ACCESS_KEY/);
  assert.match(markdown, /Promise\.all/);
  assert.match(markdown, /createTemporaryMailbox/);
  assert.match(docsView, /快速接入/);
  assert.match(docsView, /Base URL/);
  assert.match(docsView, /ACCESS_KEY/);
});
