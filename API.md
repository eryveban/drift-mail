# DriftMail API 文档

DriftMail临时邮箱服务 API。

## 基础信息

- **Base URL**: `https://your-domain.workers.dev`
- **Content-Type**: `application/json`
- **认证方式**: 
  - `X-Access-Key` 请求头 - 用于创建邮箱等敏感操作
  - `Bearer Token` - 用于邮箱操作（通过 Authorization 请求头）

---

## 域名管理

### GET /api/domains

获取可用域名列表。

**请求头**:
```
X-Access-Key: your-access-key
```

**响应**:
```json
{
  "hydra:member": [
    {
      "id": "uuid",
      "domain": "example.com",
      "isVerified": true,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "hydra:totalItems": 1
}
```

---

## 邮箱账户

### POST /api/accounts

创建新邮箱账户（带密码）。

**请求头**:
```
X-Access-Key: your-access-key
```

**请求体**:
```json
{
  "address": "user@example.com",
  "password": "yourpassword"
}
```

**参数说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| address | string | 是 | 完整邮箱地址 |
| password | string | 是 | 密码，至少6位 |

**响应**: `201 Created`
```json
{
  "id": "uuid",
  "address": "user@example.com",
  "authType": "email",
  "expiresAt": "2024-01-01T01:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**错误响应**:
- `400` - 邮箱格式无效或密码太短
- `409` - 邮箱地址已存在
- `422` - 域名不可用

---

### POST /api/generate

随机生成临时邮箱。

**请求头**:
```
X-Access-Key: your-access-key
```

**请求体** (可选):
```json
{
  "domain": "example.com"
}
```

**参数说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domain | string | 否 | 指定域名，不填则随机选择 |

**响应**: `201 Created`
```json
{
  "id": "uuid",
  "address": "randomuser@example.com",
  "password": "randompassword",
  "token": "jwt-token",
  "expiresAt": "2024-01-01T01:00:00Z"
}
```

---

### POST /api/custom

创建自定义用户名的邮箱。

**请求头**:
```
X-Access-Key: your-access-key
```

**请求体**:
```json
{
  "address": "myname@example.com"
}
```

**参数说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| address | string | 是 | 完整邮箱地址（用户名3-30字符） |

**响应**: `201 Created`
```json
{
  "id": "uuid",
  "address": "myname@example.com",
  "password": "randompassword",
  "token": "jwt-token",
  "expiresAt": "2024-01-01T01:00:00Z"
}
```

**错误响应**:
- `400` - 邮箱格式无效或用户名长度不符
- `409` - 邮箱地址已存在
- `422` - 域名不可用

---

### POST /api/token

获取认证令牌（登录）。

**请求体**:
```json
{
  "address": "user@example.com",
  "password": "yourpassword"
}
```

**响应**:
```json
{
  "id": "uuid",
  "token": "jwt-token",
  "expiresAt": "2024-01-01T01:00:00Z"
}
```

**错误响应**:
- `401` - 凭据无效

---

### GET /api/me

获取当前账户信息。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "id": "uuid",
  "address": "user@example.com",
  "authType": "email",
  "expiresAt": "2024-01-01T01:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**错误响应**:
- `401` - 未授权

---

### PATCH /api/me/extend

延长邮箱过期时间。

**请求头**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "minutes": 30
}
```

**参数说明**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| minutes | number | 否 | 延长分钟数，默认30 |

**响应**:
```json
{
  "success": true,
  "expiresAt": "2024-01-01T01:30:00Z"
}
```

---

### DELETE /api/accounts/{id}

删除邮箱账户（同时删除所有邮件）。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**: `204 No Content`

**错误响应**:
- `401` - 未授权
- `403` - 无权删除他人账户

---

## 邮件管理

### GET /api/messages

获取邮件列表。

**请求头**:
```
Authorization: Bearer <token>
```

**查询参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |

**响应**:
```json
{
  "hydra:member": [
    {
      "id": "uuid",
      "msgid": "message-id",
      "from": {
        "name": "Sender Name",
        "address": "sender@example.com"
      },
      "to": [
        {
          "name": "",
          "address": "user@example.com"
        }
      ],
      "subject": "邮件主题",
      "seen": false,
      "hasAttachments": true,
      "size": 1234,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "hydra:totalItems": 10
}
```

---

### GET /api/messages/{id}

获取邮件详情。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "id": "uuid",
  "msgid": "message-id",
  "from": {
    "name": "Sender Name",
    "address": "sender@example.com"
  },
  "to": [
    {
      "name": "",
      "address": "user@example.com"
    }
  ],
  "subject": "邮件主题",
  "text": "纯文本内容",
  "html": ["<html>...</html>"],
  "seen": false,
  "hasAttachments": true,
  "size": 1234,
  "attachments": [
    {
      "id": "uuid",
      "filename": "document.pdf",
      "contentType": "application/pdf",
      "size": 5678
    }
  ],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**错误响应**:
- `404` - 邮件不存在

---

### PATCH /api/messages/{id}

标记邮件为已读。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "seen": true
}
```

---

### DELETE /api/messages/{id}

删除邮件。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**: `204 No Content`

---

### GET /api/sources/{id}

获取原始邮件源码。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "id": "uuid",
  "data": "原始邮件完整内容..."
}
```

---

## 附件

### GET /api/attachments/{id}

下载附件。

**请求头**:
```
Authorization: Bearer <token>
```

**响应**: 二进制文件流

**响应头**:
```
Content-Type: <附件类型>
Content-Disposition: attachment; filename="<文件名>"
```

---

## 错误响应格式

所有错误响应格式统一：

```json
{
  "error": "Error",
  "message": "错误描述信息"
}
```

**常见状态码**:
| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未授权（缺少或无效的认证） |
| 403 | 禁止访问（无权限） |
| 404 | 资源不存在 |
| 409 | 资源冲突（如邮箱已存在） |
| 422 | 无法处理的实体（如域名无效） |
| 500 | 服务器内部错误 |

---

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| JWT_SECRET | 是 | - | JWT 签名密钥 |
| ACCESS_KEY | 是 | - | API 访问密钥 |
| MAIL_DOMAINS | 是 | - | 可用域名，逗号分隔 |
| EXPIRE_MINUTES | 否 | 30 | 邮箱过期时间（分钟） |

---

## 项目接入示例

如果你要在自己的项目里接入 DriftMail，最少只需要准备下面两个配置：

- **Base URL**: `https://your-domain.workers.dev`
- **ACCESS_KEY**: 用于创建临时邮箱，请在请求头中写入 `X-Access-Key`

创建临时邮箱成功后，接口会返回当前邮箱自己的 `token`。后续获取该邮箱的邮件列表、邮件正文和附件时，使用 `Authorization: Bearer <token>` 即可。

> 建议把 `ACCESS_KEY` 放在你自己的服务端环境变量里，不要直接暴露给浏览器前端。

### Node.js 最小客户端封装

```js
const config = {
  baseUrl: process.env.DRIFTMAIL_BASE_URL,
  accessKey: process.env.DRIFTMAIL_ACCESS_KEY,
};

async function request(path, options = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers['X-Access-Key'] = config.accessKey;
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) return null;

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }

  return data;
}

export async function createTemporaryMailbox(domain) {
  const body = domain ? { domain } : {};
  return request('/api/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listMessages(token, page = 1) {
  return request(`/api/messages?page=${page}`, {}, token);
}

export async function getMessage(token, messageId) {
  return request(`/api/messages/${messageId}`, {}, token);
}
```

### 批量创建 N 个邮箱并读取内容

```js
import { createTemporaryMailbox, listMessages, getMessage } from './driftmail-client.js';

async function createMailboxes(count) {
  return Promise.all(
    Array.from({ length: count }, () => createTemporaryMailbox())
  );
}

async function collectMailboxContent(mailboxes) {
  const result = [];

  for (const mailbox of mailboxes) {
    const messageList = await listMessages(mailbox.token);
    const details = await Promise.all(
      (messageList['hydra:member'] || []).map((message) =>
        getMessage(mailbox.token, message.id)
      )
    );

    result.push({
      id: mailbox.id,
      address: mailbox.address,
      token: mailbox.token,
      messages: details,
    });
  }

  return result;
}

const mailboxes = await createMailboxes(3);
const inboxSnapshot = await collectMailboxContent(mailboxes);

console.log(inboxSnapshot);
```

### 轮询等待新邮件

```js
import { createTemporaryMailbox, listMessages, getMessage } from './driftmail-client.js';

async function waitForFirstMessage(token, options = {}) {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 120000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const data = await listMessages(token);
    const firstMessage = data['hydra:member']?.[0];

    if (firstMessage) {
      return getMessage(token, firstMessage.id);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for incoming email');
}

const mailbox = await createTemporaryMailbox();
const message = await waitForFirstMessage(mailbox.token);

console.log(mailbox.address, message.subject);
```

---

## 使用示例

### 创建随机邮箱

```bash
curl -X POST https://your-domain.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -H "X-Access-Key: your-access-key"
```

### 创建自定义邮箱

```bash
curl -X POST https://your-domain.workers.dev/api/custom \
  -H "Content-Type: application/json" \
  -H "X-Access-Key: your-access-key" \
  -d '{"address": "myname@example.com"}'
```

### 获取邮件列表

```bash
curl https://your-domain.workers.dev/api/messages \
  -H "Authorization: Bearer <token>"
```

### 下载附件

```bash
curl https://your-domain.workers.dev/api/attachments/<id> \
  -H "Authorization: Bearer <token>" \
  -o filename.pdf
```
