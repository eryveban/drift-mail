/**
 * Temporary Email Service - Main Worker
 * API compatible with DuckMail
 */

import { SignJWT, jwtVerify } from './jwt.js';

const SCHEMA_TABLES = [
  `CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    is_verified INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    address TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    token TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    msgid TEXT,
    account_id TEXT NOT NULL,
    from_name TEXT,
    from_address TEXT,
    to_address TEXT,
    subject TEXT,
    text TEXT,
    html TEXT,
    seen INTEGER DEFAULT 0,
    has_attachments INTEGER DEFAULT 0,
    size INTEGER DEFAULT 0,
    raw_source TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    filename TEXT,
    content_type TEXT,
    size INTEGER,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  )`,
];

const SCHEMA_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_accounts_expires_at ON accounts(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_address ON accounts(address)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
];

const REQUIRED_SCHEMA_OBJECTS = [
  'domains',
  'accounts',
  'messages',
  'attachments',
  'idx_accounts_expires_at',
  'idx_accounts_address',
  'idx_messages_account_id',
  'idx_messages_created_at',
];

const schemaReadyByDb = new WeakMap();

// ============ JWT Secret 管理 ============

async function getJwtSecret(env) {
  if (!env.MAIL_KV) {
    throw new Error('MAIL_KV not bound. Please bind KV namespace in Dashboard.');
  }
  
  // 优先使用环境变量
  if (env.JWT_SECRET) return env.JWT_SECRET;
  
  // 从 KV 获取
  let secret = await env.MAIL_KV.get('jwt_secret');
  if (secret) return secret;
  
  // 自动生成并存储
  secret = crypto.randomUUID() + crypto.randomUUID();
  await env.MAIL_KV.put('jwt_secret', secret);
  return secret;
}

// ============ 数据库初始化 ============

async function initDatabase(env) {
  if (!env.MAIL_KV || !env.DB) {
    throw new Error('Missing bindings: MAIL_KV=' + !!env.MAIL_KV + ', DB=' + !!env.DB);
  }
  
  // 检查是否已初始化
  const initialized = await env.MAIL_KV.get('db_initialized');
  if (initialized) {
    console.log('Database already initialized');
    return;
  }

  console.log('Starting database initialization...');
  
  // 分步创建表
  const tables = [
    `CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      is_verified INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      address TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      token TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      msgid TEXT,
      account_id TEXT NOT NULL,
      from_name TEXT,
      from_address TEXT,
      to_address TEXT,
      subject TEXT,
      text TEXT,
      html TEXT,
      seen INTEGER DEFAULT 0,
      has_attachments INTEGER DEFAULT 0,
      size INTEGER DEFAULT 0,
      raw_source TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      filename TEXT,
      content_type TEXT,
      size INTEGER,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )`
  ];

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_accounts_expires_at ON accounts(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_address ON accounts(address)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`
  ];

  try {
    // 创建表
    for (const sql of tables) {
      await env.DB.prepare(sql).run();
    }
    console.log('Tables created');
    
    // 创建索引
    for (const sql of indexes) {
      await env.DB.prepare(sql).run();
    }
    console.log('Indexes created');

    // 标记已初始化
    await env.MAIL_KV.put('db_initialized', 'true');
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// ============ 工具函数 ============

async function ensureDatabaseSchema(env) {
  if (!env.DB) {
    throw new Error('DB not bound. Please configure the D1 binding named DB.');
  }

  const cached = schemaReadyByDb.get(env.DB);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const placeholders = REQUIRED_SCHEMA_OBJECTS.map(() => '?').join(', ');
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_schema WHERE name IN (${placeholders})`
    ).bind(...REQUIRED_SCHEMA_OBJECTS).all();

    const existingObjects = new Set(results.map((row) => row.name));
    const schemaReady = REQUIRED_SCHEMA_OBJECTS.every((name) => existingObjects.has(name));
    if (schemaReady) {
      return;
    }

    console.log('Ensuring database schema...');

    for (const sql of SCHEMA_TABLES) {
      await env.DB.prepare(sql).run();
    }

    for (const sql of SCHEMA_INDEXES) {
      await env.DB.prepare(sql).run();
    }
  })();

  schemaReadyByDb.set(env.DB, pending);

  try {
    await pending;
  } catch (error) {
    schemaReadyByDb.delete(env.DB);
    console.error('Database schema ensure failed:', error);
    throw error;
  }
}

function generateId() {
  return crypto.randomUUID();
}

function generateRandomString(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function hashPassword(password) {
  // 简单 hash，生产环境应使用更强的加密
  return btoa(password);
}

// 解码 Quoted-Printable（支持字符集）
function normalizeCharset(charset = 'utf-8') {
  const normalized = String(charset || 'utf-8')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .toLowerCase();

  if (!normalized || normalized === 'utf8') {
    return 'utf-8';
  }

  if (['gb2312', 'gbk', 'gb18030', 'x-gbk', 'cp936', 'gb_2312-80'].includes(normalized)) {
    return 'gb18030';
  }

  return normalized;
}

function bytesToByteString(bytes) {
  let result = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return result;
}

function byteStringToBytes(value) {
  const bytes = new Uint8Array(value.length);

  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i) & 0xFF;
  }

  return bytes;
}

function decodeBytes(bytes, charset = 'utf-8') {
  const normalized = normalizeCharset(charset);

  try {
    return new TextDecoder(normalized).decode(bytes);
  } catch {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return bytesToByteString(bytes);
    }
  }
}

function decodePercentEncodedBytes(value) {
  const bytes = [];

  for (let i = 0; i < value.length; i++) {
    if (value[i] === '%' && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(value.charCodeAt(i) & 0xFF);
    }
  }

  return new Uint8Array(bytes);
}

function decodeEncodedWord(word) {
  const match = word.match(/^=\?([^?]+)\?([bqBQ])\?([^?]*)\?=$/);
  if (!match) {
    return word;
  }

  const [, charset, encoding, encodedText] = match;

  try {
    if (encoding.toLowerCase() === 'b') {
      return decodeBytes(byteStringToBytes(atob(encodedText)), charset);
    }

    const qDecoded = encodedText.replace(/_/g, ' ');
    const bytes = [];

    for (let i = 0; i < qDecoded.length; i++) {
      if (qDecoded[i] === '=' && /^[0-9A-F]{2}$/i.test(qDecoded.slice(i + 1, i + 3))) {
        bytes.push(parseInt(qDecoded.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(qDecoded.charCodeAt(i) & 0xFF);
      }
    }

    return decodeBytes(new Uint8Array(bytes), charset);
  } catch {
    return word;
  }
}

function decodeHeaderValue(value) {
  if (!value || !value.includes('=?')) {
    return value || '';
  }

  const encodedWordPattern = /=\?[^?]+\?[bqBQ]\?[^?]*\?=/g;
  let result = '';
  let lastIndex = 0;
  let previousWasEncodedWord = false;
  let match;

  while ((match = encodedWordPattern.exec(value)) !== null) {
    const between = value.slice(lastIndex, match.index);

    if (!(previousWasEncodedWord && /^[ \t\r\n]+$/.test(between))) {
      result += between;
    }

    result += decodeEncodedWord(match[0]);
    lastIndex = match.index + match[0].length;
    previousWasEncodedWord = true;
  }

  result += value.slice(lastIndex);
  return result;
}

function stripMatchingQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function decodeHeaderParameter(headerValue, parameterName) {
  if (!headerValue) {
    return '';
  }

  const extendedMatch = headerValue.match(new RegExp(`${parameterName}\\*\\s*=\\s*(\"[^\"]*\"|[^;]+)`, 'i'));
  if (extendedMatch) {
    const rawValue = stripMatchingQuotes(extendedMatch[1].trim());
    const parts = rawValue.match(/^([^']*)'[^']*'(.*)$/);

    if (parts) {
      return decodeBytes(decodePercentEncodedBytes(parts[2]), parts[1] || 'utf-8');
    }

    return decodeBytes(decodePercentEncodedBytes(rawValue), 'utf-8');
  }

  const basicMatch = headerValue.match(new RegExp(`${parameterName}\\s*=\\s*(\"[^\"]*\"|[^;]+)`, 'i'));
  if (!basicMatch) {
    return '';
  }

  return decodeHeaderValue(stripMatchingQuotes(basicMatch[1].trim()));
}

function extractAttachmentFilename(headers) {
  return (
    decodeHeaderParameter(headers['content-disposition'], 'filename')
    || decodeHeaderParameter(headers['content-type'], 'name')
    || 'attachment'
  );
}

function parseMailboxHeader(value, fallbackAddress = '') {
  const decoded = decodeHeaderValue(value || '').trim();
  const addressMatch = decoded.match(/<([^<>@\s]+@[^<>@\s]+)>/)
    || decoded.match(/([^\s<>]+@[^\s<>]+)/);
  const address = addressMatch ? (addressMatch[1] || addressMatch[0]) : (fallbackAddress || '');
  let name = '';

  if (addressMatch) {
    name = decoded
      .replace(addressMatch[0], '')
      .replace(/[<>"]/g, '')
      .trim();
  } else if (decoded && decoded !== address) {
    name = decoded;
  }

  return { name, address };
}

async function readRawEmail(rawSource) {
  if (typeof rawSource === 'string') {
    return rawSource;
  }

  const buffer = await new Response(rawSource).arrayBuffer();
  return bytesToByteString(new Uint8Array(buffer));
}

function decodeQP(str, charset = 'utf-8') {
  const decoded = str
    .replace(/=\r\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // 如果不是 UTF-8，尝试转换
  if (charset && charset.toLowerCase() !== 'utf-8' && charset.toLowerCase() !== 'utf8') {
    try {
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return decoded;
    }
  }
  return decoded;
}

// 解码 Base64（正确处理 UTF-8）
function decodeBase64(str, charset = 'utf-8') {
  try {
    const binary = atob(str.replace(/\s/g, ''));
    // 将二进制字符串转换为 Uint8Array
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // 使用 TextDecoder 解码
    const decoder = new TextDecoder(charset);
    return decoder.decode(bytes);
  } catch {
    return str;
  }
}

// 解码内容（根据 Content-Transfer-Encoding）
function decodeContent(content, encoding, charset = 'utf-8') {
  if (!content) return '';
  const enc = (encoding || '').toLowerCase();
  
  if (enc === 'base64') {
    return decodeBase64(content.replace(/\s/g, ''), charset);
  } else if (enc === 'quoted-printable') {
    return decodeQP(content, charset);
  }
  
  // 对于 7bit/8bit 等编码，也可能需要字符集转换
  if (charset && charset.toLowerCase() !== 'utf-8' && charset.toLowerCase() !== 'utf8') {
    try {
      const bytes = new Uint8Array(content.length);
      for (let i = 0; i < content.length; i++) {
        bytes[i] = content.charCodeAt(i);
      }
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return content;
    }
  }
  
  return content;
}

// 解析邮件头
function decodeQPBytes(str, charset = 'utf-8') {
  const bytes = [];

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '=') {
      if (str[i + 1] === '\r' && str[i + 2] === '\n') {
        i += 2;
        continue;
      }

      if (str[i + 1] === '\n') {
        i += 1;
        continue;
      }

      if (/^[0-9A-F]{2}$/i.test(str.slice(i + 1, i + 3))) {
        bytes.push(parseInt(str.slice(i + 1, i + 3), 16));
        i += 2;
        continue;
      }
    }

    bytes.push(str.charCodeAt(i) & 0xFF);
  }

  return decodeBytes(new Uint8Array(bytes), charset);
}

function decodeBase64Bytes(str, charset = 'utf-8') {
  try {
    return decodeBytes(byteStringToBytes(atob(str.replace(/\s/g, ''))), charset);
  } catch {
    return str;
  }
}

function decodeContentPreservingBytes(content, encoding, charset = 'utf-8') {
  if (!content) return '';

  const enc = (encoding || '').toLowerCase();
  if (enc === 'base64') {
    return decodeBase64Bytes(content.replace(/\s/g, ''), charset);
  }

  if (enc === 'quoted-printable') {
    return decodeQPBytes(content, charset);
  }

  return decodeBytes(byteStringToBytes(content), charset);
}

function parseHeaders(headerStr) {
  const headers = {};
  const lines = headerStr.split(/\r?\n/);
  let currentHeader = '';
  
  for (const line of lines) {
    if (/^\s/.test(line) && currentHeader) {
      headers[currentHeader] += ' ' + line.trim();
    } else {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        currentHeader = match[1].toLowerCase();
        headers[currentHeader] = match[2];
      }
    }
  }
  return headers;
}

// 提取 Content-Type 参数
function parseContentType(ct) {
  if (!ct) return { type: 'text/plain', charset: 'utf-8', boundary: null };
  
  const parts = ct.split(';').map(p => p.trim());
  const type = parts[0].toLowerCase();
  let charset = 'utf-8';
  let boundary = null;
  
  for (const part of parts.slice(1)) {
    const lowerPart = part.toLowerCase();

    if (lowerPart.startsWith('charset=')) {
      charset = normalizeCharset(part.substring(8).replace(/"/g, ''));
    } else if (lowerPart.startsWith('boundary=')) {
      boundary = part.substring(9).replace(/"/g, '');
    }
  }
  
  return { type, charset, boundary };
}

// 解析单个 MIME 部分
function parseMimePart(partStr) {
  const headerEnd = partStr.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;
  
  const headerStr = partStr.substring(0, headerEnd);
  const content = partStr.substring(headerEnd + 4);
  const headers = parseHeaders(headerStr);
  const ct = parseContentType(headers['content-type']);
  const encoding = headers['content-transfer-encoding'] || '7bit';
  
  return { headers, content, contentType: ct, encoding };
}

// 递归解析邮件内容
function parseEmailContent(rawEmail) {
  let text = '';
  let html = '';
  const attachments = [];
  
  const headerEnd = rawEmail.indexOf('\r\n\r\n');
  const headerStr = headerEnd > 0 ? rawEmail.substring(0, headerEnd) : '';
  const bodyStr = headerEnd > 0 ? rawEmail.substring(headerEnd + 4) : rawEmail;
  const mainHeaders = parseHeaders(headerStr);
  const mainCT = parseContentType(mainHeaders['content-type']);
  
  if (mainCT.type.startsWith('multipart/') && mainCT.boundary) {
    const boundaryEscaped = mainCT.boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = bodyStr.split(new RegExp(`--${boundaryEscaped}`));
    
    for (const partStr of parts) {
      if (partStr.trim() === '' || partStr.trim() === '--') continue;
      
      const part = parseMimePart(partStr);
      if (!part) continue;
      
      if (part.contentType.type === 'text/plain' && !text) {
        text = decodeContentPreservingBytes(part.content, part.encoding, part.contentType.charset);
      } else if (part.contentType.type === 'text/html' && !html) {
        html = decodeContentPreservingBytes(part.content, part.encoding, part.contentType.charset);
      } else if (part.contentType.type.startsWith('multipart/') && part.contentType.boundary) {
        // 嵌套 multipart
        const nested = parseEmailContent(partStr);
        if (!text && nested.text) text = nested.text;
        if (!html && nested.html) html = nested.html;
        attachments.push(...nested.attachments);
      } else if (!part.contentType.type.startsWith('text/')) {
        // 附件
        const filename = extractAttachmentFilename(part.headers);
        attachments.push({
          filename,
          contentType: part.contentType.type,
          content: part.content.trim(),
          encoding: part.encoding
        });
      }
    }
  } else if (mainCT.type === 'text/plain') {
    const encoding = mainHeaders['content-transfer-encoding'] || '7bit';
    text = decodeContentPreservingBytes(bodyStr, encoding, mainCT.charset);
  } else if (mainCT.type === 'text/html') {
    const encoding = mainHeaders['content-transfer-encoding'] || '7bit';
    html = decodeContentPreservingBytes(bodyStr, encoding, mainCT.charset);
  } else {
    text = bodyStr;
  }
  
  return { text, html, attachments, headers: mainHeaders };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function error(message, status = 400) {
  return json({ error: 'Error', message }, status);
}

async function getToken(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }
  return auth.substring(7);
}

async function verifyToken(token, env) {
  try {
    const secret = await getJwtSecret(env);
    const payload = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

async function getAuthUser(request, env) {
  const token = await getToken(request, env);
  if (!token) return null;

  // 检查是否是数据库中的有效 token
  const { results } = await env.DB.prepare(
    'SELECT * FROM accounts WHERE token = ? AND expires_at > datetime("now")'
  ).bind(token).all();

  return results[0] || null;
}

// 验证 ACCESS_KEY
function verifyAccessKey(request, env) {
  const key = request.headers.get('X-Access-Key');
  if (!key || key !== env.ACCESS_KEY) {
    return false;
  }
  return true;
}

// ============ 域名同步 ============

async function syncDomains(env) {
  if (!env.MAIL_DOMAINS) return;
  if (!env.DB) return;

  const domains = env.MAIL_DOMAINS.split(',').map(d => d.trim()).filter(Boolean);
  if (domains.length === 0) return;

  try {
    // 获取现有域名
    const { results: existing } = await env.DB.prepare('SELECT domain FROM domains').all();
    const existingDomains = new Set(existing.map(d => d.domain));

    // 删除不在环境变量中的域名
    for (const d of existing) {
      if (!domains.includes(d.domain)) {
        await env.DB.prepare('DELETE FROM domains WHERE domain = ?').bind(d.domain).run();
      }
    }

    // 添加新域名（使用 INSERT OR IGNORE 避免重复）
    for (const domain of domains) {
      if (!existingDomains.has(domain)) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO domains (id, domain, is_verified, created_at) VALUES (?, ?, 1, datetime("now"))'
        ).bind(generateId(), domain).run();
      }
    }
  } catch (error) {
    console.error('syncDomains error:', error);
  }
}

// ============ API 路由 ============

// GET /domains - 获取域名列表
async function getDomains(request, env) {
  const { results } = await env.DB.prepare(
    'SELECT id, domain, is_verified, created_at FROM domains WHERE is_verified = 1'
  ).all();

  return json({
    'hydra:member': results.map(d => ({
      id: d.id,
      domain: d.domain,
      isVerified: !!d.is_verified,
      createdAt: d.created_at,
    })),
    'hydra:totalItems': results.length,
  });
}

// POST /accounts - 创建账户
async function createAccount(request, env) {
  const body = await request.json();
  const { address, password } = body;

  if (!address || !address.includes('@')) {
    return error('Invalid email address format');
  }

  const [username, domain] = address.split('@');
  if (username.length < 3) {
    return error('Username must be at least 3 characters');
  }
  if (!password || password.length < 6) {
    return error('Password must be at least 6 characters');
  }

  // 验证域名
  const { results: domains } = await env.DB.prepare(
    'SELECT * FROM domains WHERE domain = ? AND is_verified = 1'
  ).bind(domain).all();

  if (domains.length === 0) {
    return error('Domain not available', 422);
  }

  // 计算过期时间
  const expireMinutes = parseInt(env.EXPIRE_MINUTES || '30');
  const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();

  // 生成 token
  const secret = await getJwtSecret(env);
  const token = await new SignJWT({ address })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expireMinutes}m`)
    .sign(new TextEncoder().encode(secret));

  try {
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO accounts (id, address, password_hash, token, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(id, address, hashPassword(password), token, expiresAt).run();

    return json({
      id,
      address,
      authType: 'email',
      expiresAt,
      createdAt: new Date().toISOString(),
    }, 201);
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) {
      return error('Address already exists', 409);
    }
    return error('Failed to create account', 500);
  }
}

// POST /token - 获取认证令牌
async function getTokenHandler(request, env) {
  const body = await request.json();
  const { address, password } = body;

  if (!address || !password) {
    return error('Address and password required');
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM accounts WHERE address = ? AND password_hash = ? AND expires_at > datetime("now")'
  ).bind(address, hashPassword(password)).all();

  if (results.length === 0) {
    return error('Invalid credentials', 401);
  }

  const account = results[0];

  // 刷新 token 过期时间
  const expireMinutes = parseInt(env.EXPIRE_MINUTES || '30');
  const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();

  const secret = await getJwtSecret(env);
  const token = await new SignJWT({ address, id: account.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expireMinutes}m`)
    .sign(new TextEncoder().encode(secret));

  await env.DB.prepare(
    'UPDATE accounts SET token = ?, expires_at = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(token, expiresAt, account.id).run();

  return json({
    id: account.id,
    token,
    expiresAt,
  });
}

// GET /me - 获取当前账户信息
async function getMe(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  return json({
    id: user.id,
    address: user.address,
    authType: 'email',
    expiresAt: user.expires_at,
    createdAt: user.created_at,
  });
}

// PATCH /me/extend - 延长过期时间
async function extendExpiry(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  const body = await request.json().catch(() => ({}));
  const minutes = body.minutes || 30;

  const newExpiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

  await env.DB.prepare(
    'UPDATE accounts SET expires_at = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(newExpiresAt, user.id).run();

  return json({
    success: true,
    expiresAt: newExpiresAt,
  });
}

// DELETE /accounts/{id} - 删除账户
async function deleteAccount(request, env, id) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  if (user.id !== id) {
    return error('Forbidden', 403);
  }

  // 删除附件
  await env.DB.prepare(`
    DELETE FROM attachments WHERE message_id IN (
      SELECT id FROM messages WHERE account_id = ?
    )
  `).bind(id).run();
  // 删除邮件
  await env.DB.prepare('DELETE FROM messages WHERE account_id = ?').bind(id).run();
  // 删除账户
  await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();

  return new Response(null, { status: 204 });
}

// GET /messages - 获取邮件列表
async function getMessages(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 30;
  const offset = (page - 1) * limit;

  const { results } = await env.DB.prepare(
    `SELECT id, msgid, subject, from_name, from_address, to_address, seen, has_attachments, size, created_at
     FROM messages WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(user.id, limit, offset).all();

  const { results: countResult } = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM messages WHERE account_id = ?'
  ).bind(user.id).all();

  return json({
    'hydra:member': results.map(m => ({
      id: m.id,
      msgid: m.msgid,
      from: { name: decodeHeaderValue(m.from_name), address: m.from_address },
      to: [{ name: '', address: m.to_address }],
      subject: decodeHeaderValue(m.subject),
      seen: !!m.seen,
      hasAttachments: !!m.has_attachments,
      size: m.size,
      createdAt: m.created_at,
    })),
    'hydra:totalItems': countResult[0]?.total || 0,
  });
}

// GET /messages/{id} - 获取邮件详情
async function getMessage(request, env, id) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE id = ? AND account_id = ?'
  ).bind(id, user.id).all();

  if (results.length === 0) {
    return error('Message not found', 404);
  }

  const msg = results[0];

  // 获取附件
  const { results: attachments } = await env.DB.prepare(
    'SELECT id, filename, content_type, size FROM attachments WHERE message_id = ?'
  ).bind(id).all();

  return json({
    id: msg.id,
    msgid: msg.msgid,
    from: { name: decodeHeaderValue(msg.from_name), address: msg.from_address },
    to: [{ name: '', address: msg.to_address }],
    subject: decodeHeaderValue(msg.subject),
    text: msg.text,
    html: msg.html ? [msg.html] : [],
    seen: !!msg.seen,
    hasAttachments: !!msg.has_attachments,
    size: msg.size,
    attachments: attachments.map(a => ({
      id: a.id,
      filename: decodeHeaderValue(a.filename),
      contentType: a.content_type,
      size: a.size,
    })),
    createdAt: msg.created_at,
  });
}

// PATCH /messages/{id} - 标记已读
async function patchMessage(request, env, id) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  await env.DB.prepare(
    'UPDATE messages SET seen = 1 WHERE id = ? AND account_id = ?'
  ).bind(id, user.id).run();

  return json({ seen: true });
}

// DELETE /messages/{id} - 删除邮件
async function deleteMessage(request, env, id) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  // 删除附件
  await env.DB.prepare('DELETE FROM attachments WHERE message_id = ?').bind(id).run();
  // 删除邮件
  await env.DB.prepare(
    'DELETE FROM messages WHERE id = ? AND account_id = ?'
  ).bind(id, user.id).run();

  return new Response(null, { status: 204 });
}

// GET /sources/{id} - 获取原始邮件
async function getSource(request, env, id) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT raw_source FROM messages WHERE id = ? AND account_id = ?'
  ).bind(id, user.id).all();

  if (results.length === 0) {
    return error('Message not found', 404);
  }

  return json({
    id,
    data: results[0].raw_source,
  });
}

// GET /attachments/{id} - 获取附件
async function getAttachment(request, env, id) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return error('Unauthorized', 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT a.* FROM attachments a JOIN messages m ON a.message_id = m.id WHERE a.id = ? AND m.account_id = ?'
  ).bind(id, user.id).all();

  if (results.length === 0) {
    return error('Attachment not found', 404);
  }

  const att = results[0];
  const binary = Uint8Array.from(atob(att.content), c => c.charCodeAt(0));

  return new Response(binary, {
    headers: {
      'Content-Type': att.content_type,
      'Content-Disposition': `attachment; filename="${att.filename}"`,
    },
  });
}

// ============ 定时清理任务 ============

async function cleanupExpired(env) {
  const { results: expiredAccounts } = await env.DB.prepare(
    'SELECT id FROM accounts WHERE expires_at < datetime("now")'
  ).all();

  for (const account of expiredAccounts) {
    // 删除附件
    await env.DB.prepare(`
      DELETE FROM attachments WHERE message_id IN (
        SELECT id FROM messages WHERE account_id = ?
      )
    `).bind(account.id).run();
    // 删除邮件
    await env.DB.prepare('DELETE FROM messages WHERE account_id = ?').bind(account.id).run();
    // 删除账户
    await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(account.id).run();
  }

  console.log(`Cleaned up ${expiredAccounts.length} expired accounts`);
}

// ============ 随机邮箱生成 ============

async function generateRandomEmail(request, env) {

  // 尝试从请求体获取指定域名

  let domain = null;

  try {

    const body = await request.json();

    domain = body.domain;

  } catch (e) {}



  // 如果没有指定域名，随机选择

  if (!domain) {

    const { results: domains } = await env.DB.prepare(

      'SELECT domain FROM domains WHERE is_verified = 1 ORDER BY RANDOM() LIMIT 1'

    ).all();

    if (domains.length === 0) {

      return error('No domains available', 500);

    }

    domain = domains[0].domain;

  } else {

    // 验证指定域名是否有效

    const { results: validDomains } = await env.DB.prepare(

      'SELECT domain FROM domains WHERE domain = ? AND is_verified = 1'

    ).bind(domain).all();

    if (validDomains.length === 0) {

      return error('Invalid domain', 400);

    }

  }



    const username = generateRandomString(10);



    const address = `${username}@${domain}`;



    const password = generateRandomString(12);



  



    const expireMinutes = parseInt(env.EXPIRE_MINUTES || '30');



    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();



  



    const secret = await getJwtSecret(env);



    const token = await new SignJWT({ address })



      .setProtectedHeader({ alg: 'HS256' })



      .setIssuedAt()



      .setExpirationTime(`${expireMinutes}m`)



      .sign(new TextEncoder().encode(secret));



  



    try {



      const id = generateId();

    await env.DB.prepare(

      `INSERT INTO accounts (id, address, password_hash, token, expires_at, created_at, updated_at)

       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`

    ).bind(id, address, hashPassword(password), token, expiresAt).run();



    return json({

      id,

      address,

      password,

      token,

      expiresAt,

    }, 201);

  } catch (e) {

    return error('Failed to generate email', 500);

  }

}



// POST /custom - 创建自定义邮箱名

async function createCustomEmail(request, env) {

  let address = null;

  try {

    const body = await request.json();

    address = body.address;

  } catch (e) {}



  if (!address || !address.includes('@')) {

    return error('Invalid email address format');

  }



  const [username, domain] = address.split('@');

  

  if (username.length < 3) {

    return error('Username must be at least 3 characters');

  }

  

  if (username.length > 30) {

    return error('Username must be at most 30 characters');

  }



  // 验证域名

  const { results: domains } = await env.DB.prepare(

    'SELECT domain FROM domains WHERE domain = ? AND is_verified = 1'

  ).bind(domain).all();

  if (domains.length === 0) {

    return error('Domain not available', 422);

  }



  // 检查地址是否已存在

  const { results: existing } = await env.DB.prepare(

    'SELECT id FROM accounts WHERE address = ?'

  ).bind(address).all();

  if (existing.length > 0) {

    return error('Address already exists', 409);

  }



    const password = generateRandomString(12);



    const expireMinutes = parseInt(env.EXPIRE_MINUTES || '30');



    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();



  



    const secret = await getJwtSecret(env);



    const token = await new SignJWT({ address })



      .setProtectedHeader({ alg: 'HS256' })



      .setIssuedAt()



      .setExpirationTime(`${expireMinutes}m`)



      .sign(new TextEncoder().encode(secret));



  try {

    const id = generateId();

    await env.DB.prepare(

      `INSERT INTO accounts (id, address, password_hash, token, expires_at, created_at, updated_at)

       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`

    ).bind(id, address, hashPassword(password), token, expiresAt).run();



    return json({

      id,

      address,

      password,

      token,

      expiresAt,

    }, 201);

  } catch (e) {

    return error('Failed to create email', 500);

  }

}



// ============ 主路由 ============

async function handleRequest(request, env) {
  // 同步域名
  await syncDomains(env);

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // API 路由
  const routes = [
    ['GET', '/api/domains', () => {
      if (!verifyAccessKey(request, env)) return error('Unauthorized', 401);
      return getDomains(request, env);
    }],
    ['POST', '/api/accounts', () => {
      if (!verifyAccessKey(request, env)) return error('Unauthorized', 401);
      return createAccount(request, env);
    }],
    ['POST', '/api/token', () => getTokenHandler(request, env)],
    ['GET', '/api/me', () => getMe(request, env)],
    ['PATCH', '/api/me/extend', () => extendExpiry(request, env)],
    ['GET', '/api/messages', () => getMessages(request, env)],
    ['POST', '/api/generate', () => {
      if (!verifyAccessKey(request, env)) return error('Unauthorized', 401);
      return generateRandomEmail(request, env);
    }],
    ['POST', '/api/custom', () => {
      if (!verifyAccessKey(request, env)) return error('Unauthorized', 401);
      return createCustomEmail(request, env);
    }],
  ];

  // 匹配带 ID 的路由
  const messageIdMatch = path.match(/^\/api\/messages\/([^/]+)$/);
  const sourceMatch = path.match(/^\/api\/sources\/([^/]+)$/);
  const attachmentMatch = path.match(/^\/api\/attachments\/([^/]+)$/);
  const accountMatch = path.match(/^\/api\/accounts\/([^/]+)$/);

  if (messageIdMatch) {
    const id = messageIdMatch[1];
    if (method === 'GET') return getMessage(request, env, id);
    if (method === 'PATCH') return patchMessage(request, env, id);
    if (method === 'DELETE') return deleteMessage(request, env, id);
  }

  if (sourceMatch && method === 'GET') {
    return getSource(request, env, sourceMatch[1]);
  }

  if (attachmentMatch && method === 'GET') {
    return getAttachment(request, env, attachmentMatch[1]);
  }

  if (accountMatch && method === 'DELETE') {
    return deleteAccount(request, env, accountMatch[1]);
  }

  // 匹配简单路由
  for (const [rMethod, rPath, handler] of routes) {
    if (method === rMethod && path === rPath) {
      return handler();
    }
  }

  // 静态文件（前端）
  if (!path.startsWith('/api/')) {
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    // ASSETS 未绑定时返回 index.html
    return new Response('Frontend not available. Please bind ASSETS in wrangler.toml', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  return error('Not Found', 404);
}

// ============ 导出 ============

export default {
  async fetch(request, env, ctx) {
    // 自动初始化数据库
    await ensureDatabaseSchema(env);
    return handleRequest(request, env);
  },

  async scheduled(event, env, ctx) {
    await ensureDatabaseSchema(env);
    await cleanupExpired(env);
  },

  // Email 接收处理
  async email(message, env, ctx) {
    await ensureDatabaseSchema(env);
    const to = message.to;
    const [username, domain] = to.split('@');

    // 查找账户
    const { results } = await env.DB.prepare(
      'SELECT * FROM accounts WHERE address = ? AND expires_at > datetime("now")'
    ).bind(to).all();

    if (results.length === 0) {
      message.setReject('Address not found or expired');
      return;
    }

    const account = results[0];

    // 读取邮件内容
    const rawEmail = await readRawEmail(message.raw);

    // 解析发件人
    let from = message.from || '';
    let fromName = '';
    let fromAddress = from;
    const fromMatch = from.match(/(?:"?([^"]*)"?\s)?<?([^\s>]+@[^\s>]+)>?/);
    if (fromMatch) {
      fromName = fromMatch[1] || '';
      fromAddress = fromMatch[2];
    }

    // 使用新的解析器
    const parsed = parseEmailContent(rawEmail);
    const fromHeader = parsed.headers?.from || message.headers?.get('from') || message.from || '';
    ({ name: fromName, address: fromAddress } = parseMailboxHeader(fromHeader, message.from || ''));
    const subject = decodeHeaderValue(parsed.headers?.subject || message.headers?.get('subject') || '') || '(No Subject)';
    const textContent = parsed.text;
    const htmlContent = parsed.html;
    const hasAttachments = parsed.attachments.length > 0;

    // 存储邮件
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO messages (id, account_id, from_name, from_address, to_address, subject, text, html, has_attachments, size, raw_source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, account.id, fromName, fromAddress, to, subject, textContent, htmlContent || null, hasAttachments ? 1 : 0, rawEmail.length, rawEmail).run();

    // 存储附件
    for (const att of parsed.attachments) {
      const attId = generateId();
      // 将解码后的内容存储为 base64
      const contentBase64 = att.encoding === 'base64' ? att.content.replace(/\s/g, '') : btoa(unescape(encodeURIComponent(att.content)));
      await env.DB.prepare(
        `INSERT INTO attachments (id, message_id, filename, content_type, size, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(attId, id, att.filename, att.contentType, att.content.length, contentBase64).run();
    }
  },
};
