-- Migration: Add apikey table for API token authentication
-- Used by BetterAuth apiKey plugin for CLI/CI authentication
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
