import { describe, expect, test, beforeEach, afterEach, afterAll, beforeAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { mkTempDir } from "../../test-util";

// Import the normalizeServerUrl function directly
import { normalizeServerUrl } from "../../../src/config/credentials";
import type { CredentialEntry, CredentialsFile, Credentials } from "../../../src/config/types";

/**
 * Unit tests for multi-server credentials functionality.
 *
 * Note: The actual saveCredentials/loadCredentials/clearCredentials functions
 * use PATHS.credentials which is computed at import time from os.homedir().
 * These tests focus on:
 * 1. normalizeServerUrl function
 * 2. Credentials file format and validation logic
 * 3. Multi-server data structure
 *
 * The file I/O behavior is tested implicitly through e2e tests.
 */

describe("normalizeServerUrl", () => {
  test("removes trailing slashes", () => {
    expect(normalizeServerUrl("https://app.scratch.dev/")).toBe("https://app.scratch.dev");
    expect(normalizeServerUrl("https://app.scratch.dev///")).toBe("https://app.scratch.dev");
  });

  test("converts to lowercase", () => {
    expect(normalizeServerUrl("https://APP.Scratch.DEV")).toBe("https://app.scratch.dev");
  });

  test("handles URLs with paths", () => {
    expect(normalizeServerUrl("https://app.scratch.dev/api/")).toBe("https://app.scratch.dev/api");
  });

  test("handles localhost URLs", () => {
    expect(normalizeServerUrl("http://localhost:8788/")).toBe("http://localhost:8788");
    expect(normalizeServerUrl("http://LOCALHOST:8788")).toBe("http://localhost:8788");
  });

  test("returns unchanged URL if already normalized", () => {
    expect(normalizeServerUrl("https://app.scratch.dev")).toBe("https://app.scratch.dev");
  });

  test("handles empty string", () => {
    expect(normalizeServerUrl("")).toBe("");
  });

  test("handles URL with multiple path segments", () => {
    expect(normalizeServerUrl("https://app.scratch.dev/api/v1/")).toBe("https://app.scratch.dev/api/v1");
  });

  test("handles URL with port", () => {
    expect(normalizeServerUrl("https://app.scratch.dev:443/")).toBe("https://app.scratch.dev:443");
  });

  test("preserves query strings", () => {
    expect(normalizeServerUrl("https://app.scratch.dev?foo=bar")).toBe("https://app.scratch.dev?foo=bar");
  });
});

describe("Credentials File Format", () => {
  test("stores multiple server credentials", () => {
    const file: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "prod-token",
        user: { id: "user-1", email: "prod@example.com", name: "Prod User" },
      },
      "https://staging.scratch.dev": {
        token: "staging-token",
        user: { id: "user-2", email: "staging@example.com", name: null },
      },
      "http://localhost:8788": {
        token: "local-token",
        user: { id: "user-3", email: "local@example.com", name: "Local Dev" },
      },
    };

    expect(Object.keys(file)).toHaveLength(3);
    expect(file["https://app.scratch.dev"].token).toBe("prod-token");
    expect(file["https://staging.scratch.dev"].token).toBe("staging-token");
    expect(file["http://localhost:8788"].token).toBe("local-token");
  });

  test("each entry has correct structure", () => {
    const entry: CredentialEntry = {
      token: "test-token",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
    };

    expect(entry.token).toBeDefined();
    expect(entry.user.id).toBeDefined();
    expect(entry.user.email).toBeDefined();
    expect(entry.user.name).toBeDefined();
  });

  test("user name can be null", () => {
    const entry: CredentialEntry = {
      token: "test-token",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: null,
      },
    };

    expect(entry.user.name).toBeNull();
  });

  test("Credentials type includes server field", () => {
    const credentials: Credentials = {
      token: "test-token",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
      server: "https://app.scratch.dev",
    };

    expect(credentials.server).toBe("https://app.scratch.dev");
    expect(credentials.token).toBe("test-token");
  });
});

describe("Credential Entry Validation Logic", () => {
  /**
   * This mirrors the validation logic in credentials.ts isValidCredentialEntry
   */
  function isValidCredentialEntry(entry: unknown): entry is CredentialEntry {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (!e.token || typeof e.token !== "string") return false;
    if (typeof e.user !== "object" || e.user === null) return false;
    const user = e.user as Record<string, unknown>;
    if (!user.id || typeof user.id !== "string") return false;
    if (!user.email || typeof user.email !== "string") return false;
    return true;
  }

  test("validates complete entry", () => {
    const entry = {
      token: "test-token",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
    };
    expect(isValidCredentialEntry(entry)).toBe(true);
  });

  test("validates entry with null name", () => {
    const entry = {
      token: "test-token",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: null,
      },
    };
    expect(isValidCredentialEntry(entry)).toBe(true);
  });

  test("rejects missing token", () => {
    const entry = {
      user: {
        id: "user-123",
        email: "test@example.com",
        name: null,
      },
    };
    expect(isValidCredentialEntry(entry)).toBe(false);
  });

  test("rejects non-string token", () => {
    const entry = {
      token: 12345,
      user: {
        id: "user-123",
        email: "test@example.com",
        name: null,
      },
    };
    expect(isValidCredentialEntry(entry)).toBe(false);
  });

  test("rejects empty string token", () => {
    const entry = {
      token: "",
      user: {
        id: "user-123",
        email: "test@example.com",
        name: null,
      },
    };
    expect(isValidCredentialEntry(entry)).toBe(false);
  });

  test("rejects missing user", () => {
    const entry = {
      token: "test-token",
    };
    expect(isValidCredentialEntry(entry)).toBe(false);
  });

  test("rejects null user", () => {
    const entry = {
      token: "test-token",
      user: null,
    };
    expect(isValidCredentialEntry(entry)).toBe(false);
  });

  test("rejects missing user.id", () => {
    const entry = {
      token: "test-token",
      user: {
        email: "test@example.com",
        name: null,
      },
    };
    expect(isValidCredentialEntry(entry)).toBe(false);
  });

  test("rejects missing user.email", () => {
    const entry = {
      token: "test-token",
      user: {
        id: "user-123",
        name: null,
      },
    };
    expect(isValidCredentialEntry(entry)).toBe(false);
  });

  test("rejects null entry", () => {
    expect(isValidCredentialEntry(null)).toBe(false);
  });

  test("rejects undefined entry", () => {
    expect(isValidCredentialEntry(undefined)).toBe(false);
  });

  test("rejects string entry", () => {
    expect(isValidCredentialEntry("string")).toBe(false);
  });

  test("rejects number entry", () => {
    expect(isValidCredentialEntry(123)).toBe(false);
  });

  test("rejects array entry", () => {
    expect(isValidCredentialEntry([])).toBe(false);
  });
});

describe("Multi-server Credential Lookup Logic", () => {
  /**
   * Simulates how credentials are looked up by server URL
   */
  function lookupCredentials(
    store: CredentialsFile,
    serverUrl: string
  ): Credentials | null {
    const normalizedUrl = normalizeServerUrl(serverUrl);
    const entry = store[normalizedUrl];

    if (!entry) return null;

    return {
      ...entry,
      server: serverUrl,
    };
  }

  const mockStore: CredentialsFile = {
    "https://app.scratch.dev": {
      token: "prod-token",
      user: { id: "user-1", email: "prod@example.com", name: "Prod User" },
    },
    "https://staging.scratch.dev": {
      token: "staging-token",
      user: { id: "user-2", email: "staging@example.com", name: null },
    },
    "http://localhost:8788": {
      token: "local-token",
      user: { id: "user-3", email: "local@example.com", name: "Local Dev" },
    },
  };

  test("returns credentials for known server", () => {
    const creds = lookupCredentials(mockStore, "https://app.scratch.dev");
    expect(creds).not.toBeNull();
    expect(creds!.token).toBe("prod-token");
  });

  test("returns null for unknown server", () => {
    const creds = lookupCredentials(mockStore, "https://unknown.scratch.dev");
    expect(creds).toBeNull();
  });

  test("normalizes URL before lookup", () => {
    const creds = lookupCredentials(mockStore, "https://APP.SCRATCH.DEV/");
    expect(creds).not.toBeNull();
    expect(creds!.token).toBe("prod-token");
  });

  test("includes server URL in returned credentials", () => {
    const creds = lookupCredentials(mockStore, "https://app.scratch.dev");
    expect(creds!.server).toBe("https://app.scratch.dev");
  });

  test("preserves original server URL case in returned credentials", () => {
    const creds = lookupCredentials(mockStore, "https://APP.SCRATCH.DEV");
    expect(creds!.server).toBe("https://APP.SCRATCH.DEV");
  });

  test("looks up localhost correctly", () => {
    const creds = lookupCredentials(mockStore, "http://localhost:8788");
    expect(creds).not.toBeNull();
    expect(creds!.token).toBe("local-token");
  });

  test("returns correct credentials for different servers", () => {
    const prodCreds = lookupCredentials(mockStore, "https://app.scratch.dev");
    const stagingCreds = lookupCredentials(mockStore, "https://staging.scratch.dev");

    expect(prodCreds!.user.email).toBe("prod@example.com");
    expect(stagingCreds!.user.email).toBe("staging@example.com");
  });
});

describe("Credential Storage Logic", () => {
  /**
   * Simulates how credentials are stored/merged
   */
  function storeCredentials(
    store: CredentialsFile,
    entry: CredentialEntry,
    serverUrl: string
  ): CredentialsFile {
    const normalizedUrl = normalizeServerUrl(serverUrl);
    return {
      ...store,
      [normalizedUrl]: entry,
    };
  }

  function removeCredentials(store: CredentialsFile, serverUrl: string): CredentialsFile {
    const normalizedUrl = normalizeServerUrl(serverUrl);
    const { [normalizedUrl]: _, ...rest } = store;
    return rest;
  }

  test("stores new credentials", () => {
    const store: CredentialsFile = {};
    const entry: CredentialEntry = {
      token: "new-token",
      user: { id: "user-1", email: "new@example.com", name: null },
    };

    const updated = storeCredentials(store, entry, "https://app.scratch.dev");

    expect(updated["https://app.scratch.dev"]).toBeDefined();
    expect(updated["https://app.scratch.dev"].token).toBe("new-token");
  });

  test("overwrites existing credentials for same server", () => {
    const store: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "old-token",
        user: { id: "user-1", email: "old@example.com", name: null },
      },
    };
    const entry: CredentialEntry = {
      token: "new-token",
      user: { id: "user-2", email: "new@example.com", name: null },
    };

    const updated = storeCredentials(store, entry, "https://app.scratch.dev");

    expect(updated["https://app.scratch.dev"].token).toBe("new-token");
    expect(updated["https://app.scratch.dev"].user.email).toBe("new@example.com");
  });

  test("preserves credentials for other servers", () => {
    const store: CredentialsFile = {
      "https://staging.scratch.dev": {
        token: "staging-token",
        user: { id: "user-1", email: "staging@example.com", name: null },
      },
    };
    const entry: CredentialEntry = {
      token: "prod-token",
      user: { id: "user-2", email: "prod@example.com", name: null },
    };

    const updated = storeCredentials(store, entry, "https://app.scratch.dev");

    expect(updated["https://app.scratch.dev"].token).toBe("prod-token");
    expect(updated["https://staging.scratch.dev"].token).toBe("staging-token");
  });

  test("normalizes URL when storing", () => {
    const store: CredentialsFile = {};
    const entry: CredentialEntry = {
      token: "test-token",
      user: { id: "user-1", email: "test@example.com", name: null },
    };

    const updated = storeCredentials(store, entry, "https://APP.SCRATCH.DEV/");

    expect(updated["https://app.scratch.dev"]).toBeDefined();
    expect(updated["https://APP.SCRATCH.DEV/"]).toBeUndefined();
  });

  test("removes credentials for specific server", () => {
    const store: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "prod-token",
        user: { id: "user-1", email: "prod@example.com", name: null },
      },
      "https://staging.scratch.dev": {
        token: "staging-token",
        user: { id: "user-2", email: "staging@example.com", name: null },
      },
    };

    const updated = removeCredentials(store, "https://app.scratch.dev");

    expect(updated["https://app.scratch.dev"]).toBeUndefined();
    expect(updated["https://staging.scratch.dev"]).toBeDefined();
  });

  test("normalizes URL when removing", () => {
    const store: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "test-token",
        user: { id: "user-1", email: "test@example.com", name: null },
      },
    };

    const updated = removeCredentials(store, "https://APP.SCRATCH.DEV/");

    expect(updated["https://app.scratch.dev"]).toBeUndefined();
  });

  test("removing non-existent server leaves store unchanged", () => {
    const store: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "test-token",
        user: { id: "user-1", email: "test@example.com", name: null },
      },
    };

    const updated = removeCredentials(store, "https://unknown.scratch.dev");

    expect(Object.keys(updated)).toHaveLength(1);
    expect(updated["https://app.scratch.dev"]).toBeDefined();
  });
});

describe("JSON Serialization", () => {
  test("serializes credentials file correctly", () => {
    const file: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "test-token",
        user: { id: "user-1", email: "test@example.com", name: "Test User" },
      },
    };

    const json = JSON.stringify(file, null, 2);
    const parsed = JSON.parse(json) as CredentialsFile;

    expect(parsed["https://app.scratch.dev"].token).toBe("test-token");
    expect(parsed["https://app.scratch.dev"].user.name).toBe("Test User");
  });

  test("preserves null values in serialization", () => {
    const file: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "test-token",
        user: { id: "user-1", email: "test@example.com", name: null },
      },
    };

    const json = JSON.stringify(file, null, 2);
    const parsed = JSON.parse(json) as CredentialsFile;

    expect(parsed["https://app.scratch.dev"].user.name).toBeNull();
  });

  test("handles empty credentials file", () => {
    const file: CredentialsFile = {};

    const json = JSON.stringify(file, null, 2);
    const parsed = JSON.parse(json) as CredentialsFile;

    expect(Object.keys(parsed)).toHaveLength(0);
  });

  test("handles special characters in email", () => {
    const file: CredentialsFile = {
      "https://app.scratch.dev": {
        token: "test-token",
        user: { id: "user-1", email: "test+tag@example.com", name: null },
      },
    };

    const json = JSON.stringify(file, null, 2);
    const parsed = JSON.parse(json) as CredentialsFile;

    expect(parsed["https://app.scratch.dev"].user.email).toBe("test+tag@example.com");
  });
});
