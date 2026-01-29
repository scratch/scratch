-- Users (BetterAuth compatible - no custom fields)
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    image TEXT,
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (BetterAuth compatible)
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);

-- Accounts (OAuth providers - BetterAuth compatible)
CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TEXT,
    refresh_token_expires_at TEXT,
    scope TEXT,
    id_token TEXT,
    password TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_user ON account(user_id);

-- Verification tokens (BetterAuth compatible)
CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Device codes (BetterAuth device-authorization plugin, RFC 8628)
CREATE TABLE IF NOT EXISTS device_code (
    id TEXT PRIMARY KEY,
    device_code TEXT UNIQUE NOT NULL,
    user_code TEXT UNIQUE NOT NULL,
    user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    client_id TEXT,
    scope TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TEXT NOT NULL,
    last_polled_at TEXT,
    polling_interval INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_code_device ON device_code(device_code);
CREATE INDEX IF NOT EXISTS idx_device_code_user ON device_code(user_code);

-- API Keys (BetterAuth apiKey plugin)
-- Used for CLI/CI authentication without interactive login
-- Note: Uses BetterAuth's default camelCase column names
CREATE TABLE IF NOT EXISTS apikey (
    id TEXT PRIMARY KEY,
    name TEXT,
    start TEXT,                              -- First few chars (for display)
    prefix TEXT,                             -- Key prefix (plaintext)
    key TEXT NOT NULL,                       -- Hashed key
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
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
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apikey_user ON apikey(userId);
CREATE INDEX IF NOT EXISTS idx_apikey_key ON apikey(key);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    live_deploy_id TEXT,           -- Points to current live deploy
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Project names are unique per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_owner
    ON projects(name, owner_id);

-- Deploys (each deploy is a versioned snapshot)
CREATE TABLE IF NOT EXISTS deploys (
    id TEXT PRIMARY KEY,           -- Internal ID (used for R2 storage path)
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,      -- 1, 2, 3, ... (user-facing identifier)
    file_count INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_deploys_project ON deploys(project_id);

-- Share tokens (time-limited anonymous access URLs)
CREATE TABLE IF NOT EXISTS share_tokens (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration TEXT NOT NULL,  -- '1d', '1w', '1m'
    expires_at TEXT NOT NULL,
    revoked_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_project ON share_tokens(project_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
