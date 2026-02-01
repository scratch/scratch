import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { hasStaticFileExtension, isPortAvailable, startServerWithFallback } from "../../src/cmd/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import net from "net";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-server-"));
  // Create a simple index.html for server tests
  await fs.writeFile(path.join(tempDir, "index.html"), "<html><body>Hello</body></html>");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("hasStaticFileExtension", () => {
  // Known static extensions should return true
  test("returns true for known web asset extensions", () => {
    expect(hasStaticFileExtension("/style.css")).toBe(true);
    expect(hasStaticFileExtension("/script.js")).toBe(true);
    expect(hasStaticFileExtension("/data.json")).toBe(true);
    expect(hasStaticFileExtension("/page.html")).toBe(true);
    expect(hasStaticFileExtension("/module.mjs")).toBe(true);
  });

  test("returns true for known image extensions", () => {
    expect(hasStaticFileExtension("/photo.png")).toBe(true);
    expect(hasStaticFileExtension("/photo.jpg")).toBe(true);
    expect(hasStaticFileExtension("/photo.jpeg")).toBe(true);
    expect(hasStaticFileExtension("/icon.svg")).toBe(true);
    expect(hasStaticFileExtension("/image.webp")).toBe(true);
    expect(hasStaticFileExtension("/favicon.ico")).toBe(true);
  });

  test("returns true for known font extensions", () => {
    expect(hasStaticFileExtension("/font.woff")).toBe(true);
    expect(hasStaticFileExtension("/font.woff2")).toBe(true);
    expect(hasStaticFileExtension("/font.ttf")).toBe(true);
  });

  test("returns true for known source file extensions", () => {
    expect(hasStaticFileExtension("/file.ts")).toBe(true);
    expect(hasStaticFileExtension("/file.tsx")).toBe(true);
    expect(hasStaticFileExtension("/file.jsx")).toBe(true);
    expect(hasStaticFileExtension("/file.md")).toBe(true);
    expect(hasStaticFileExtension("/file.mdx")).toBe(true);
  });

  // Routes without known extensions should return false
  test("returns false for paths without extensions", () => {
    expect(hasStaticFileExtension("/about")).toBe(false);
    expect(hasStaticFileExtension("/posts/hello")).toBe(false);
    expect(hasStaticFileExtension("/")).toBe(false);
  });

  test("returns false for unknown extensions (dotted filenames)", () => {
    // These are routes from files like test.file.md -> /test.file
    expect(hasStaticFileExtension("/test.file")).toBe(false);
    expect(hasStaticFileExtension("/my.page.name")).toBe(false);
    expect(hasStaticFileExtension("/docs/v1.2.3")).toBe(false);
  });

  test("only considers the last path segment", () => {
    // The dot is in a directory name, not the file
    expect(hasStaticFileExtension("/v1.0/about")).toBe(false);
    expect(hasStaticFileExtension("/test.dir/page")).toBe(false);
    // But if the last segment has a known extension, return true
    expect(hasStaticFileExtension("/v1.0/style.css")).toBe(true);
  });

  test("is case-insensitive for extensions", () => {
    expect(hasStaticFileExtension("/style.CSS")).toBe(true);
    expect(hasStaticFileExtension("/script.JS")).toBe(true);
    expect(hasStaticFileExtension("/image.PNG")).toBe(true);
  });

  test("handles edge cases", () => {
    expect(hasStaticFileExtension("")).toBe(false);
    expect(hasStaticFileExtension(".css")).toBe(true); // just extension
    expect(hasStaticFileExtension("/.hidden")).toBe(false); // hidden file, not extension
  });
});

describe("isPortAvailable", () => {
  test("returns true for an unused port", async () => {
    // Find a random high port that's likely to be free
    const port = 40000 + Math.floor(Math.random() * 10000);
    const available = await isPortAvailable(port);
    expect(available).toBe(true);
  });

  test("returns false for a port in use", async () => {
    // Start a server on a port
    const port = 40000 + Math.floor(Math.random() * 10000);
    const server = net.createServer();

    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve());
    });

    try {
      const available = await isPortAvailable(port);
      expect(available).toBe(false);
    } finally {
      server.close();
    }
  });
});

describe("startServerWithFallback", () => {
  test("starts server on preferred port when available", async () => {
    const port = 41000 + Math.floor(Math.random() * 1000);
    const result = await startServerWithFallback({
      buildDir: tempDir,
      port,
    });

    try {
      expect(result.port).toBe(port);
      expect(result.server).toBeDefined();

      // Verify server is actually running
      const response = await fetch(`http://localhost:${port}/`);
      expect(response.ok).toBe(true);
    } finally {
      result.server.stop();
    }
  });

  test("falls back to next port when preferred is in use", async () => {
    const basePort = 42000 + Math.floor(Math.random() * 1000);

    // Block the first port
    const blocker = net.createServer();
    await new Promise<void>((resolve) => {
      blocker.listen(basePort, "127.0.0.1", () => resolve());
    });

    try {
      const result = await startServerWithFallback({
        buildDir: tempDir,
        port: basePort,
      });

      try {
        // Should have fallen back to next port
        expect(result.port).toBe(basePort + 1);
        expect(result.server).toBeDefined();
      } finally {
        result.server.stop();
      }
    } finally {
      blocker.close();
    }
  });

  test("serves index.html for root path", async () => {
    const port = 43000 + Math.floor(Math.random() * 1000);
    const result = await startServerWithFallback({
      buildDir: tempDir,
      port,
    });

    try {
      const response = await fetch(`http://localhost:${port}/`);
      expect(response.ok).toBe(true);
      const text = await response.text();
      expect(text).toContain("Hello");
    } finally {
      result.server.stop();
    }
  });

  test("returns 404 for non-existent files", async () => {
    const port = 44000 + Math.floor(Math.random() * 1000);
    const result = await startServerWithFallback({
      buildDir: tempDir,
      port,
    });

    try {
      const response = await fetch(`http://localhost:${port}/nonexistent.html`);
      expect(response.status).toBe(404);
    } finally {
      result.server.stop();
    }
  });

  test("throws error when no port available after max attempts", async () => {
    const basePort = 45000 + Math.floor(Math.random() * 1000);

    // Block multiple ports
    const blockers: net.Server[] = [];
    for (let i = 0; i < 3; i++) {
      const server = net.createServer();
      await new Promise<void>((resolve) => {
        server.listen(basePort + i, "127.0.0.1", () => resolve());
      });
      blockers.push(server);
    }

    try {
      await expect(
        startServerWithFallback({
          buildDir: tempDir,
          port: basePort,
          maxAttempts: 3,
        })
      ).rejects.toThrow(/Could not find an available port/);
    } finally {
      for (const blocker of blockers) {
        blocker.close();
      }
    }
  });

  test("injects live reload script when enabled", async () => {
    const port = 46000 + Math.floor(Math.random() * 1000);
    const result = await startServerWithFallback({
      buildDir: tempDir,
      port,
      liveReload: true,
    });

    try {
      const response = await fetch(`http://localhost:${port}/`);
      const text = await response.text();
      expect(text).toContain("__live_reload");
      expect(text).toContain("WebSocket");
    } finally {
      result.server.stop();
    }
  });

  test("does not inject live reload script when disabled", async () => {
    const port = 47000 + Math.floor(Math.random() * 1000);
    const result = await startServerWithFallback({
      buildDir: tempDir,
      port,
      liveReload: false,
    });

    try {
      const response = await fetch(`http://localhost:${port}/`);
      const text = await response.text();
      expect(text).not.toContain("__live_reload");
      expect(text).not.toContain("WebSocket");
    } finally {
      result.server.stop();
    }
  });

  test("sets no-cache headers when live reload enabled", async () => {
    const port = 48000 + Math.floor(Math.random() * 1000);
    const result = await startServerWithFallback({
      buildDir: tempDir,
      port,
      liveReload: true,
    });

    try {
      const response = await fetch(`http://localhost:${port}/`);
      expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
    } finally {
      result.server.stop();
    }
  });

  test("does not set no-cache headers when live reload disabled", async () => {
    const port = 49000 + Math.floor(Math.random() * 1000);
    const result = await startServerWithFallback({
      buildDir: tempDir,
      port,
      liveReload: false,
    });

    try {
      const response = await fetch(`http://localhost:${port}/`);
      // Should not have no-cache headers in preview mode
      expect(response.headers.get("Cache-Control")).toBeNull();
    } finally {
      result.server.stop();
    }
  });
});
