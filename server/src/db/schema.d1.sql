-- Fresh SQLite schema for Cloudflare D1
-- Tables use snake_case column names for SQL convention
-- BetterAuth field mappings handle camelCase conversion

-- Users (BetterAuth)
CREATE TABLE user (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    image TEXT,
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Sessions (BetterAuth)
CREATE TABLE session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_session_user ON session(user_id);
CREATE INDEX idx_session_token ON session(token);

-- Accounts (OAuth - BetterAuth)
CREATE TABLE account (
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
CREATE INDEX idx_account_user ON account(user_id);

-- Verification tokens (BetterAuth)
CREATE TABLE verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Device codes (BetterAuth device-authorization plugin, RFC 8628)
CREATE TABLE device_code (
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
CREATE INDEX idx_device_code_device ON device_code(device_code);
CREATE INDEX idx_device_code_user ON device_code(user_code);

-- Projects
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    namespace TEXT NOT NULL DEFAULT 'global',
    owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    live_deploy_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_projects_name_namespace ON projects(name, namespace);
CREATE INDEX idx_projects_owner ON projects(owner_id);

-- Deploys
CREATE TABLE deploys (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    file_count INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project_id, version)
);
CREATE INDEX idx_deploys_project ON deploys(project_id);

-- Share tokens
CREATE TABLE share_tokens (
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
CREATE INDEX idx_share_tokens_project ON share_tokens(project_id);
