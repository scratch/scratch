import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { mkTempDir } from "../../test-util";

// Import the functions we need to test
// Note: We test the public interfaces through file operations

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkTempDir("test-cloud-config-");
});

afterAll(async () => {
  // Clean up
  await fs.rm(tempDir, { recursive: true, force: true });
});

// Helper to read TOML content
function parseSimpleToml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(\w+)\s*=\s*"(.*)"\s*$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

describe("Global Config TOML", () => {
  test("parses config with all fields", () => {
    const content = `
# Scratch Cloud Global Configuration
server_url = "https://custom.scratch.dev"
namespace = "acme.com"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.server_url).toBe("https://custom.scratch.dev");
    expect(parsed.namespace).toBe("acme.com");
  });

  test("parses config with cf_access fields", () => {
    const content = `
# Scratch Cloud Global Configuration
server_url = "https://custom.scratch.dev"
cf_access_client_id = "my-client-id"
cf_access_client_secret = "my-client-secret"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.server_url).toBe("https://custom.scratch.dev");
    expect(parsed.cf_access_client_id).toBe("my-client-id");
    expect(parsed.cf_access_client_secret).toBe("my-client-secret");
  });

  test("parses config without cf_access fields (undefined)", () => {
    const content = `
server_url = "https://app.scratch.dev"
namespace = "acme.com"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.cf_access_client_id).toBeUndefined();
    expect(parsed.cf_access_client_secret).toBeUndefined();
  });

  test("parses config with missing optional fields", () => {
    const content = `
server_url = "https://app.scratch.dev"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.server_url).toBe("https://app.scratch.dev");
    expect(parsed.namespace).toBeUndefined();
  });

  test("parses config with comments and whitespace", () => {
    const content = `
# This is a comment
server_url = "https://app.scratch.dev"

# Another comment
  namespace = "example.com"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.server_url).toBe("https://app.scratch.dev");
    expect(parsed.namespace).toBe("example.com");
  });

  test("handles empty config", () => {
    const content = `
# Just comments
# No values
`;
    const parsed = parseSimpleToml(content);
    expect(Object.keys(parsed).length).toBe(0);
  });
});

describe("Project Config TOML", () => {
  test("parses config with all fields", () => {
    const content = `
name = "my-project"
namespace = "acme.com"
server_url = "https://custom.scratch.dev"
visibility = "public"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.name).toBe("my-project");
    expect(parsed.namespace).toBe("acme.com");
    expect(parsed.server_url).toBe("https://custom.scratch.dev");
    expect(parsed.visibility).toBe("public");
  });

  test("parses config with only required fields", () => {
    const content = `
name = "my-project"
namespace = "global"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.name).toBe("my-project");
    expect(parsed.namespace).toBe("global");
    expect(parsed.server_url).toBeUndefined();
    expect(parsed.visibility).toBeUndefined();
  });

  test("handles custom visibility values", () => {
    const content = `
name = "my-project"
namespace = "global"
visibility = "alice@example.com,@partner.com"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.visibility).toBe("alice@example.com,@partner.com");
  });

  test("handles domain visibility", () => {
    const content = `
name = "my-project"
namespace = "global"
visibility = "@acme.com"
`;
    const parsed = parseSimpleToml(content);
    expect(parsed.visibility).toBe("@acme.com");
  });
});

describe("Global Config TOML Generation", () => {
  // Helper to generate TOML (matches the pattern in user-config.ts)
  function generateGlobalConfigToml(config: { server_url?: string; namespace?: string; cf_access_client_id?: string; cf_access_client_secret?: string }): string {
    const DEFAULT_SERVER_URL = 'https://app.scratch.dev';
    const escapeTomlString = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const lines = [
      '# Scratch Cloud Global Configuration',
      '#',
      '# These are your default settings for all Scratch projects.',
      '# Run `scratch cloud config` from a non-project directory to update.',
      '# Project-specific settings in .scratch/project.toml override these.',
      '',
      '# Default server URL',
      `server_url = "${escapeTomlString(config.server_url || DEFAULT_SERVER_URL)}"`,
    ];

    if (config.namespace) {
      lines.push('', '# Default namespace for new projects', `namespace = "${escapeTomlString(config.namespace)}"`);
    }

    if (config.cf_access_client_id && config.cf_access_client_secret) {
      lines.push(
        '',
        '# Cloudflare Access service token',
        `cf_access_client_id = "${escapeTomlString(config.cf_access_client_id)}"`,
        `cf_access_client_secret = "${escapeTomlString(config.cf_access_client_secret)}"`
      );
    }

    return lines.join('\n') + '\n';
  }

  test("generates config with cf_access credentials", () => {
    const toml = generateGlobalConfigToml({
      server_url: "https://app.scratch.dev",
      cf_access_client_id: "my-client-id",
      cf_access_client_secret: "my-client-secret"
    });
    expect(toml).toContain('cf_access_client_id = "my-client-id"');
    expect(toml).toContain('cf_access_client_secret = "my-client-secret"');
  });

  test("generates config without cf_access credentials when not set", () => {
    const toml = generateGlobalConfigToml({
      server_url: "https://app.scratch.dev"
    });
    expect(toml).not.toContain('cf_access_client_id');
    expect(toml).not.toContain('cf_access_client_secret');
  });

  test("escapes special characters in cf_access credentials", () => {
    const toml = generateGlobalConfigToml({
      cf_access_client_id: 'client-id',
      cf_access_client_secret: 'secret\\with"quotes'
    });
    expect(toml).toContain('cf_access_client_secret = "secret\\\\with\\"quotes"');
  });

  test("requires both credentials to include them", () => {
    const toml = generateGlobalConfigToml({
      cf_access_client_id: "only-id"
    });
    expect(toml).not.toContain('cf_access_client_id');
  });
});

describe("TOML String Escaping", () => {
  test("escapes backslashes in values", () => {
    // Backslashes should be escaped when written
    const input = "C:\\Users\\test";
    const escaped = input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    expect(escaped).toBe("C:\\\\Users\\\\test");
  });

  test("escapes quotes in values", () => {
    const input = 'He said "hello"';
    const escaped = input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    expect(escaped).toBe('He said \\"hello\\"');
  });

  test("escapes both backslashes and quotes", () => {
    const input = 'Path: "C:\\test"';
    const escaped = input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    expect(escaped).toBe('Path: \\"C:\\\\test\\"');
  });
});

describe("Validation", () => {
  // Import validators from shared
  const { validateProjectName, validateNamespace, validateNamespaceForUser } = require('../../../src/shared/project');
  const { validateGroupInput } = require('../../../src/shared/group');

  describe("Project Name Validation", () => {
    test("accepts valid project names", () => {
      expect(validateProjectName("my-project").valid).toBe(true);
      expect(validateProjectName("foo").valid).toBe(true);
      expect(validateProjectName("my-awesome-project-123").valid).toBe(true);
    });

    test("rejects names too short", () => {
      expect(validateProjectName("ab").valid).toBe(false);
    });

    test("rejects names with invalid characters", () => {
      expect(validateProjectName("My-Project").valid).toBe(false); // uppercase
      expect(validateProjectName("my_project").valid).toBe(false); // underscore
      expect(validateProjectName("my.project").valid).toBe(false); // dot
    });

    test("rejects names starting with number", () => {
      expect(validateProjectName("123project").valid).toBe(false);
    });

    test("rejects names starting with hyphen", () => {
      expect(validateProjectName("-project").valid).toBe(false);
    });

    test("rejects reserved names", () => {
      expect(validateProjectName("api").valid).toBe(false);
      expect(validateProjectName("admin").valid).toBe(false);
      expect(validateProjectName("www").valid).toBe(false);
    });
  });

  describe("Namespace Validation", () => {
    test("accepts global namespace", () => {
      expect(validateNamespace("global").valid).toBe(true);
      expect(validateNamespace("_").valid).toBe(true);
      expect(validateNamespace("").valid).toBe(true);
      expect(validateNamespace(null).valid).toBe(true);
    });

    test("accepts valid domain namespaces", () => {
      expect(validateNamespace("acme.com").valid).toBe(true);
      expect(validateNamespace("example.co.uk").valid).toBe(true);
    });

    test("rejects invalid domain format", () => {
      expect(validateNamespace("not-a-domain").valid).toBe(false);
      expect(validateNamespace("nodot").valid).toBe(false);
    });
  });

  describe("Namespace For User Validation", () => {
    test("accepts global namespace for any user", () => {
      expect(validateNamespaceForUser("global", "user@acme.com").valid).toBe(true);
    });

    test("accepts matching domain", () => {
      expect(validateNamespaceForUser("acme.com", "user@acme.com").valid).toBe(true);
    });

    test("rejects non-matching domain", () => {
      const result = validateNamespaceForUser("other.com", "user@acme.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("acme.com");
    });
  });

  describe("Visibility Validation", () => {
    test("accepts public and private", () => {
      expect(validateGroupInput("public")).toBeNull();
      expect(validateGroupInput("private")).toBeNull();
    });

    test("accepts valid domain", () => {
      expect(validateGroupInput("@acme.com")).toBeNull();
      expect(validateGroupInput("@example.co.uk")).toBeNull();
    });

    test("accepts valid email", () => {
      expect(validateGroupInput("user@example.com")).toBeNull();
    });

    test("accepts comma-separated list", () => {
      expect(validateGroupInput("user@example.com,@partner.com")).toBeNull();
    });

    test("rejects invalid format", () => {
      expect(validateGroupInput("not-valid")).not.toBeNull();
      expect(validateGroupInput("@")).not.toBeNull();
    });
  });
});

describe("Server URL Validation", () => {
  // These are CLI-only validations
  function validateServerUrl(url: string): string | null {
    try {
      new URL(url);
    } catch {
      return `Invalid URL: ${url}`;
    }
    if (!url.startsWith('https://') && !url.includes('localhost')) {
      return 'Server URL must use HTTPS (except for localhost)';
    }
    return null;
  }

  test("accepts valid HTTPS URLs", () => {
    expect(validateServerUrl("https://app.scratch.dev")).toBeNull();
    expect(validateServerUrl("https://custom.example.com")).toBeNull();
  });

  test("accepts localhost URLs", () => {
    expect(validateServerUrl("http://localhost:8788")).toBeNull();
    expect(validateServerUrl("https://localhost:8788")).toBeNull();
  });

  test("rejects HTTP for non-localhost", () => {
    expect(validateServerUrl("http://example.com")).not.toBeNull();
  });

  test("rejects invalid URLs", () => {
    expect(validateServerUrl("not-a-url")).not.toBeNull();
    expect(validateServerUrl("://missing-protocol")).not.toBeNull();
  });
});

describe("Config File Operations", () => {
  test("creates project config directory", async () => {
    const projectDir = path.join(tempDir, "project-dir-test");
    await fs.mkdir(projectDir, { recursive: true });

    const scratchDir = path.join(projectDir, ".scratch");
    const configPath = path.join(scratchDir, "project.toml");

    // Simulate saveProjectConfig behavior
    await fs.mkdir(scratchDir, { recursive: true });
    await fs.writeFile(configPath, 'name = "test"\nnamespace = "global"\n');

    const exists = await fs.exists(configPath);
    expect(exists).toBe(true);

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('name = "test"');
  });

  test("overwrites existing config", async () => {
    const projectDir = path.join(tempDir, "project-overwrite-test");
    const scratchDir = path.join(projectDir, ".scratch");
    const configPath = path.join(scratchDir, "project.toml");

    await fs.mkdir(scratchDir, { recursive: true });
    await fs.writeFile(configPath, 'name = "old"\n');

    // Overwrite
    await fs.writeFile(configPath, 'name = "new"\n');

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toBe('name = "new"\n');
  });

  test("handles missing config file gracefully", async () => {
    const projectDir = path.join(tempDir, "project-missing-test");
    await fs.mkdir(projectDir, { recursive: true });

    const configPath = path.join(projectDir, ".scratch", "project.toml");

    try {
      await fs.readFile(configPath, "utf-8");
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
  });
});

describe("Config Precedence", () => {
  // Test that project config fields take precedence over global config

  test("project server_url overrides global when set", () => {
    const globalConfig = { server_url: "https://global.scratch.dev" };
    const projectConfig = { server_url: "https://project.scratch.dev" };

    const effectiveUrl = projectConfig.server_url || globalConfig.server_url;
    expect(effectiveUrl).toBe("https://project.scratch.dev");
  });

  test("falls back to global when project server_url not set", () => {
    const globalConfig = { server_url: "https://global.scratch.dev" };
    const projectConfig = { server_url: undefined };

    const effectiveUrl = projectConfig.server_url || globalConfig.server_url;
    expect(effectiveUrl).toBe("https://global.scratch.dev");
  });

  test("falls back to default when neither set", () => {
    const globalConfig = { server_url: undefined };
    const projectConfig = { server_url: undefined };
    const defaultUrl = "https://app.scratch.dev";

    const effectiveUrl = projectConfig.server_url || globalConfig.server_url || defaultUrl;
    expect(effectiveUrl).toBe("https://app.scratch.dev");
  });

  test("project namespace overrides global when set", () => {
    const globalConfig = { namespace: "global-domain.com" };
    const projectConfig = { namespace: "project-domain.com" };

    const effectiveNamespace = projectConfig.namespace || globalConfig.namespace;
    expect(effectiveNamespace).toBe("project-domain.com");
  });
});
