import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { cleanupOldCacheVersions, CACHE_DIR } from "../../src/cmd/watch";

describe("watch cache", () => {
  let testCacheDir: string;

  beforeEach(async () => {
    // Create a temporary cache directory for testing
    testCacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "scratch-cache-test-"));
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testCacheDir, { recursive: true, force: true });
  });

  describe("CACHE_DIR", () => {
    test("is under ~/.scratch/cache/", () => {
      const homeDir = os.homedir();
      expect(CACHE_DIR).toBe(path.join(homeDir, ".scratch", "cache"));
    });

    test("ends with /cache to isolate from other .scratch files", () => {
      expect(CACHE_DIR.endsWith(path.join(".scratch", "cache"))).toBe(true);
    });
  });

  describe("cleanupOldCacheVersions", () => {
    test("removes old version directories", async () => {
      // Create mock cache structure with old versions
      const oldVersion1 = path.join(testCacheDir, "0.5.10");
      const oldVersion2 = path.join(testCacheDir, "0.5.11");
      const currentVersion = path.join(testCacheDir, "0.5.12");

      await fs.mkdir(path.join(oldVersion1, "node_modules"), { recursive: true });
      await fs.mkdir(path.join(oldVersion2, "node_modules"), { recursive: true });
      await fs.mkdir(path.join(currentVersion, "node_modules"), { recursive: true });

      // Add some files to simulate real node_modules
      await fs.writeFile(path.join(oldVersion1, "node_modules", "react"), "fake");
      await fs.writeFile(path.join(oldVersion2, "node_modules", "react"), "fake");
      await fs.writeFile(path.join(currentVersion, "node_modules", "react"), "fake");

      // Use the actual function with custom cache directory
      await cleanupOldCacheVersions("0.5.12", testCacheDir);

      // Old versions should be gone
      expect(await fs.exists(oldVersion1)).toBe(false);
      expect(await fs.exists(oldVersion2)).toBe(false);

      // Current version should remain
      expect(await fs.exists(currentVersion)).toBe(true);
      expect(await fs.exists(path.join(currentVersion, "node_modules", "react"))).toBe(true);
    });

    test("does nothing when cache directory is empty", async () => {
      // Should not throw
      await cleanupOldCacheVersions("0.5.12", testCacheDir);

      // Directory should still exist
      expect(await fs.exists(testCacheDir)).toBe(true);
    });

    test("does nothing when only current version exists", async () => {
      const currentVersion = path.join(testCacheDir, "0.5.12");
      await fs.mkdir(path.join(currentVersion, "node_modules"), { recursive: true });
      await fs.writeFile(path.join(currentVersion, "node_modules", "react"), "fake");

      await cleanupOldCacheVersions("0.5.12", testCacheDir);

      // Current version should remain untouched
      expect(await fs.exists(currentVersion)).toBe(true);
      expect(await fs.exists(path.join(currentVersion, "node_modules", "react"))).toBe(true);
    });

    test("ignores files (only removes directories)", async () => {
      // Create a file in the cache directory (not a version directory)
      const someFile = path.join(testCacheDir, "some-file.txt");
      await fs.writeFile(someFile, "should not be deleted");

      const currentVersion = path.join(testCacheDir, "0.5.12");
      await fs.mkdir(currentVersion, { recursive: true });

      await cleanupOldCacheVersions("0.5.12", testCacheDir);

      // File should still exist
      expect(await fs.exists(someFile)).toBe(true);
    });

    test("handles non-existent cache directory gracefully", async () => {
      const nonExistentDir = path.join(testCacheDir, "does-not-exist");

      // Should not throw
      await cleanupOldCacheVersions("0.5.12", nonExistentDir);
    });

    test("removes multiple old versions at once", async () => {
      // Create many old versions
      const versions = ["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.5.1", "0.5.2"];
      for (const v of versions) {
        await fs.mkdir(path.join(testCacheDir, v, "node_modules"), { recursive: true });
      }

      const currentVersion = path.join(testCacheDir, "0.6.0");
      await fs.mkdir(path.join(currentVersion, "node_modules"), { recursive: true });

      await cleanupOldCacheVersions("0.6.0", testCacheDir);

      // All old versions should be gone
      for (const v of versions) {
        expect(await fs.exists(path.join(testCacheDir, v))).toBe(false);
      }

      // Current version should remain
      expect(await fs.exists(currentVersion)).toBe(true);
    });
  });
});
