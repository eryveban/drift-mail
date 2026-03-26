CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    is_verified INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    address TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    token TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
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
);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    filename TEXT,
    content_type TEXT,
    size INTEGER,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_expires_at ON accounts(expires_at);
CREATE INDEX IF NOT EXISTS idx_accounts_address ON accounts(address);
CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
