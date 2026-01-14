import { describe, expect, test, beforeEach, afterEach, afterAll, beforeAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { mkTempDir } from "../../test-util";

// Test the migration logic from old config to new secrets
describe("CF Access Migration", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkTempDir("test-migration-");
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Old config format detection", () => {
    test("identifies config with CF Access credentials", () => {
      const content = `
# Scratch Cloud Global Configuration
server_url = "https://app.scratch.dev"
namespace = "acme.com"

# Cloudflare Access service token
cf_access_client_id = "abc123"
cf_access_client_secret = "secret456"
`;

      const hasCfId = /cf_access_client_id\s*=/.test(content);
      const hasCfSecret = /cf_access_client_secret\s*=/.test(content);

      expect(hasCfId).toBe(true);
      expect(hasCfSecret).toBe(true);
    });

    test("identifies config without CF Access credentials", () => {
      const content = `
# Scratch Cloud Global Configuration
server_url = "https://app.scratch.dev"
namespace = "acme.com"
`;

      const hasCfId = /cf_access_client_id\s*=/.test(content);
      const hasCfSecret = /cf_access_client_secret\s*=/.test(content);

      expect(hasCfId).toBe(false);
      expect(hasCfSecret).toBe(false);
    });
  });

  describe("Migration extraction", () => {
    test("extracts CF Access client ID", () => {
      const content = `cf_access_client_id = "my-client-id-123"`;
      const match = content.match(/^cf_access_client_id\s*=\s*"(.*)"\s*$/m);
      expect(match?.[1]).toBe("my-client-id-123");
    });

    test("extracts CF Access client secret", () => {
      const content = `cf_access_client_secret = "super-secret-value"`;
      const match = content.match(/^cf_access_client_secret\s*=\s*"(.*)"\s*$/m);
      expect(match?.[1]).toBe("super-secret-value");
    });

    test("handles secrets with special characters", () => {
      const content = `cf_access_client_secret = "secret+with/special=chars"`;
      const match = content.match(/^cf_access_client_secret\s*=\s*"(.*)"\s*$/m);
      expect(match?.[1]).toBe("secret+with/special=chars");
    });

    test("handles escaped quotes in values", () => {
      const content = `cf_access_client_secret = "value\\"with\\"quotes"`;
      const match = content.match(/^cf_access_client_secret\s*=\s*"(.*)"\s*$/m);
      expect(match?.[1]).toBe('value\\"with\\"quotes');
    });
  });

  describe("Migration cleanup", () => {
    function cleanConfigContent(content: string): string {
      const lines = content.split('\n');
      const cleanedLines = lines.filter(line => {
        const trimmed = line.trim();
        // Remove CF Access credential lines
        if (trimmed.match(/^cf_access_client_id\s*=/)) return false;
        if (trimmed.match(/^cf_access_client_secret\s*=/)) return false;
        // Remove Cloudflare Access comments
        if (trimmed.startsWith('#') && trimmed.toLowerCase().includes('cloudflare access')) return false;
        return true;
      });
      return cleanedLines.join('\n').replace(/\n+$/, '\n');
    }

    test("removes CF Access client ID line", () => {
      const original = `
server_url = "https://app.scratch.dev"
cf_access_client_id = "abc123"
namespace = "acme.com"
`;
      const cleaned = cleanConfigContent(original);
      expect(cleaned).not.toContain('cf_access_client_id');
      expect(cleaned).toContain('server_url');
      expect(cleaned).toContain('namespace');
    });

    test("removes CF Access client secret line", () => {
      const original = `
server_url = "https://app.scratch.dev"
cf_access_client_secret = "secret123"
`;
      const cleaned = cleanConfigContent(original);
      expect(cleaned).not.toContain('cf_access_client_secret');
      expect(cleaned).toContain('server_url');
    });

    test("removes Cloudflare Access comments", () => {
      const original = `
server_url = "https://app.scratch.dev"

# Cloudflare Access service token
cf_access_client_id = "abc123"
cf_access_client_secret = "secret123"
`;
      const cleaned = cleanConfigContent(original);
      expect(cleaned).not.toContain('Cloudflare Access');
      expect(cleaned).not.toContain('cf_access');
    });

    test("preserves other config values", () => {
      const original = `
# Scratch Cloud Global Configuration
server_url = "https://custom.scratch.dev"

# Default namespace for new projects
namespace = "acme.com"

# Cloudflare Access service token
cf_access_client_id = "abc123"
cf_access_client_secret = "secret123"
`;
      const cleaned = cleanConfigContent(original);
      expect(cleaned).toContain('server_url = "https://custom.scratch.dev"');
      expect(cleaned).toContain('namespace = "acme.com"');
      expect(cleaned).toContain('# Scratch Cloud Global Configuration');
      expect(cleaned).toContain('# Default namespace for new projects');
    });
  });

  describe("Secrets file format", () => {
    test("secrets are stored as JSON", async () => {
      const secretsPath = path.join(tempDir, "secrets.json");
      const secrets = {
        cf_access_client_id: "abc123",
        cf_access_client_secret: "secret456",
      };

      await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2) + "\n");

      const content = await fs.readFile(secretsPath, "utf-8");
      const loaded = JSON.parse(content);

      expect(loaded.cf_access_client_id).toBe("abc123");
      expect(loaded.cf_access_client_secret).toBe("secret456");
    });

    test("secrets file is valid JSON", async () => {
      const secretsPath = path.join(tempDir, "secrets-valid.json");
      const secrets = {
        cf_access_client_id: "abc123",
        cf_access_client_secret: "secret456",
      };

      await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2) + "\n");

      const content = await fs.readFile(secretsPath, "utf-8");
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  describe("End-to-end migration scenario", () => {
    test("migrates complete config file", async () => {
      const configDir = path.join(tempDir, "e2e-migration");
      const secretsDir = path.join(tempDir, "e2e-secrets");
      const configPath = path.join(configDir, "config.toml");
      const secretsPath = path.join(secretsDir, "secrets.json");

      await fs.mkdir(configDir, { recursive: true });
      await fs.mkdir(secretsDir, { recursive: true });

      // Write old-style config with CF Access credentials
      const oldConfig = `# Scratch Cloud Global Configuration
#
# These are your default settings for all Scratch projects.
# Run \`scratch cloud config\` from a non-project directory to update.
# Project-specific settings in .scratch/project.toml override these.

# Default server URL
server_url = "https://app.scratch.dev"

# Default namespace for new projects
namespace = "acme.com"

# Cloudflare Access service token
cf_access_client_id = "my-client-id"
cf_access_client_secret = "my-secret-value"
`;

      await fs.writeFile(configPath, oldConfig);

      // Simulate migration: extract credentials
      const content = await fs.readFile(configPath, "utf-8");
      const idMatch = content.match(/^cf_access_client_id\s*=\s*"(.*)"\s*$/m);
      const secretMatch = content.match(/^cf_access_client_secret\s*=\s*"(.*)"\s*$/m);

      expect(idMatch?.[1]).toBe("my-client-id");
      expect(secretMatch?.[1]).toBe("my-secret-value");

      // Save to secrets file
      const secrets = {
        cf_access_client_id: idMatch?.[1],
        cf_access_client_secret: secretMatch?.[1],
      };
      await fs.writeFile(secretsPath, JSON.stringify(secrets, null, 2) + "\n", { mode: 0o600 });

      // Clean up config file
      const lines = content.split('\n');
      const cleanedLines = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.match(/^cf_access_client_id\s*=/)) return false;
        if (trimmed.match(/^cf_access_client_secret\s*=/)) return false;
        if (trimmed.startsWith('#') && trimmed.toLowerCase().includes('cloudflare access')) return false;
        return true;
      });
      const newConfig = cleanedLines.join('\n').replace(/\n+$/, '\n');
      await fs.writeFile(configPath, newConfig);

      // Verify migration results
      const newConfigContent = await fs.readFile(configPath, "utf-8");
      expect(newConfigContent).not.toContain("cf_access_client_id");
      expect(newConfigContent).not.toContain("cf_access_client_secret");
      expect(newConfigContent).not.toContain("Cloudflare Access");
      expect(newConfigContent).toContain("server_url");
      expect(newConfigContent).toContain("namespace");

      const secretsContent = await fs.readFile(secretsPath, "utf-8");
      const loadedSecrets = JSON.parse(secretsContent);
      expect(loadedSecrets.cf_access_client_id).toBe("my-client-id");
      expect(loadedSecrets.cf_access_client_secret).toBe("my-secret-value");
    });
  });
});

describe("Backwards Compatibility", () => {
  describe("Config without CF Access", () => {
    test("config without CF Access is unaffected by migration", () => {
      const content = `
# Scratch Cloud Global Configuration
server_url = "https://app.scratch.dev"
namespace = "acme.com"
`;

      const hasCfAccess = /cf_access_client_(id|secret)/.test(content);
      expect(hasCfAccess).toBe(false);

      // Config should remain unchanged
      expect(content).toContain("server_url");
      expect(content).toContain("namespace");
    });
  });

  describe("Empty secrets file", () => {
    test("empty secrets object is valid", () => {
      const secrets = {};
      const json = JSON.stringify(secrets, null, 2);
      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.parse(json)).toEqual({});
    });
  });

  describe("Partial CF Access credentials", () => {
    test("only client ID is not migrated", () => {
      const content = `
server_url = "https://app.scratch.dev"
cf_access_client_id = "only-id"
`;

      const idMatch = content.match(/^cf_access_client_id\s*=\s*"(.*)"\s*$/m);
      const secretMatch = content.match(/^cf_access_client_secret\s*=\s*"(.*)"\s*$/m);

      // Both must be present for valid credentials
      const shouldMigrate = idMatch && secretMatch;
      expect(shouldMigrate).toBeFalsy();
    });

    test("only client secret is not migrated", () => {
      const content = `
server_url = "https://app.scratch.dev"
cf_access_client_secret = "only-secret"
`;

      const idMatch = content.match(/^cf_access_client_id\s*=\s*"(.*)"\s*$/m);
      const secretMatch = content.match(/^cf_access_client_secret\s*=\s*"(.*)"\s*$/m);

      // Both must be present for valid credentials
      const shouldMigrate = idMatch && secretMatch;
      expect(shouldMigrate).toBeFalsy();
    });
  });
});
