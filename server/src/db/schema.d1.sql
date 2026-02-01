-- Canonical schema for Cloudflare D1 (SQLite)
-- This is the source of truth for new database instances.
-- Migrations handle upgrades for existing instances.
--
-- Tables use snake_case column names for SQL convention.
-- BetterAuth tables use their default camelCase where required.
-- BetterAuth field mappings handle camelCase conversion.

-- Users (BetterAuth)
CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    image TEXT,
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Sessions (BetterAuth)
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);

-- Accounts (OAuth - BetterAuth)
CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TEXT,
    refresh_token_expires_at TEXT,
    scope TEXT,
    id_token TEXT,
    password TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE (provider_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_account_user ON account(user_id);

-- Verification tokens (BetterAuth)
CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Device codes (BetterAuth device-authorization plugin, RFC 8628)
CREATE TABLE IF NOT EXISTS device_code (
    id TEXT PRIMARY KEY,
    device_code TEXT UNIQUE NOT NULL,
    user_code TEXT UNIQUE NOT NULL,
    user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
    client_id TEXT,
    scope TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TEXT NOT NULL,
    last_polled_at TEXT,
    polling_interval INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_device_code_device ON device_code(device_code);
CREATE INDEX IF NOT EXISTS idx_device_code_user ON device_code(user_code);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    namespace TEXT NOT NULL DEFAULT 'global',
    owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    live_deploy_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_namespace ON projects(name, namespace);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- Deploys
CREATE TABLE IF NOT EXISTS deploys (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    file_count INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project_id, version)
);
CREATE INDEX IF NOT EXISTS idx_deploys_project ON deploys(project_id);

-- Share tokens
CREATE TABLE IF NOT EXISTS share_tokens (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_project ON share_tokens(project_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);

-- API Keys (BetterAuth apiKey plugin)
-- Used for CLI/CI authentication without interactive login
-- Note: Uses BetterAuth's default camelCase column names
CREATE TABLE IF NOT EXISTS apikey (
    id TEXT PRIMARY KEY,
    name TEXT,
    start TEXT,                              -- First few chars (for display)
    prefix TEXT,                             -- Key prefix (plaintext)
    key TEXT NOT NULL,                       -- Hashed key
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    enabled INTEGER DEFAULT 1,
    remaining INTEGER,
    refillAmount INTEGER,
    refillInterval INTEGER,
    lastRefillAt TEXT,
    expiresAt TEXT,
    rateLimitEnabled INTEGER DEFAULT 1,
    rateLimitTimeWindow INTEGER,
    rateLimitMax INTEGER,
    requestCount INTEGER DEFAULT 0,
    lastRequest TEXT,
    permissions TEXT,                        -- JSON permissions
    metadata TEXT,                           -- JSON metadata
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apikey_user ON apikey(userId);
CREATE INDEX IF NOT EXISTS idx_apikey_key ON apikey(key);
