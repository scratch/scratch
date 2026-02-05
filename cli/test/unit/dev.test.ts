import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { findRoute, isProcessRunning, readLock, writeLock, removeLock, getLockFilePath } from "../../src/cmd/dev";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Note: hasStaticFileExtension tests are in server.test.ts since
// that function now lives in server.ts and is re-exported by dev.ts

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-dev-"));
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("findRoute", () => {
  test("returns '/' when index.html exists at root", async () => {
    const dir = path.join(tempDir, "with-index");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), "<html></html>");

    expect(await findRoute(dir)).toBe("/");
  });

  test("returns '/' for empty directory", async () => {
    const dir = path.join(tempDir, "empty");
    await fs.mkdir(dir, { recursive: true });

    expect(await findRoute(dir)).toBe("/");
  });

  test("ignores non-html files", async () => {
    const dir = path.join(tempDir, "mixed-files");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "readme.txt"), "text");
    await fs.writeFile(path.join(dir, "script.js"), "js");

    expect(await findRoute(dir)).toBe("/");
  });

  // Recursive tests
  test("finds index.html in subdirectory when root is empty", async () => {
    const dir = path.join(tempDir, "recursive-index");
    await fs.mkdir(path.join(dir, "blog"), { recursive: true });
    await fs.writeFile(path.join(dir, "blog", "index.html"), "<html></html>");

    expect(await findRoute(dir)).toBe("/blog");
  });

  test("prefers root index over subdirectory index", async () => {
    const dir = path.join(tempDir, "root-wins");
    await fs.mkdir(path.join(dir, "blog"), { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), "<html></html>");
    await fs.writeFile(path.join(dir, "blog", "index.html"), "<html></html>");

    expect(await findRoute(dir)).toBe("/");
  });

  test("finds index.html in deeply nested directory", async () => {
    const dir = path.join(tempDir, "deep-index");
    await fs.mkdir(path.join(dir, "a", "b", "c"), { recursive: true });
    await fs.writeFile(path.join(dir, "a", "b", "c", "index.html"), "<html></html>");

    expect(await findRoute(dir)).toBe("/a/b/c");
  });

  test("alphabetical order for subdirectories", async () => {
    const dir = path.join(tempDir, "alpha-order");
    await fs.mkdir(path.join(dir, "zebra"), { recursive: true });
    await fs.mkdir(path.join(dir, "alpha"), { recursive: true });
    await fs.writeFile(path.join(dir, "zebra", "index.html"), "<html></html>");
    await fs.writeFile(path.join(dir, "alpha", "index.html"), "<html></html>");

    // alpha comes before zebra alphabetically
    expect(await findRoute(dir)).toBe("/alpha");
  });

  test("skips hidden directories", async () => {
    const dir = path.join(tempDir, "hidden-dirs");
    await fs.mkdir(path.join(dir, ".hidden"), { recursive: true });
    await fs.mkdir(path.join(dir, "visible"), { recursive: true });
    await fs.writeFile(path.join(dir, ".hidden", "index.html"), "<html></html>");
    await fs.writeFile(path.join(dir, "visible", "index.html"), "<html></html>");

    expect(await findRoute(dir)).toBe("/visible");
  });

  test("returns first matching subdirectory in DFS order", async () => {
    const dir = path.join(tempDir, "dfs-order");
    await fs.mkdir(path.join(dir, "aaa", "nested"), { recursive: true });
    await fs.mkdir(path.join(dir, "bbb"), { recursive: true });
    await fs.writeFile(path.join(dir, "aaa", "nested", "index.html"), "<html></html>");
    await fs.writeFile(path.join(dir, "bbb", "index.html"), "<html></html>");

    // aaa/nested is found via DFS before bbb because aaa < bbb alphabetically
    expect(await findRoute(dir)).toBe("/aaa/nested");
  });
});

describe("dev server lock file", () => {
  let lockDir: string;
  let lockPath: string;

  beforeEach(async () => {
    lockDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-lock-"));
    lockPath = path.join(lockDir, ".scratch", "dev.lock");
  });

  afterEach(async () => {
    await fs.rm(lockDir, { recursive: true, force: true });
  });

  describe("getLockFilePath", () => {
    test("returns correct path", () => {
      expect(getLockFilePath("/project")).toBe("/project/.scratch/dev.lock");
    });
  });

  describe("isProcessRunning", () => {
    test("returns true for current process", () => {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    test("returns false for non-existent PID", () => {
      // Use a very high PID that's unlikely to exist
      expect(isProcessRunning(999999999)).toBe(false);
    });
  });

  describe("writeLock/readLock", () => {
    test("writes and reads lock file", async () => {
      const lock = { pid: process.pid, port: 5173 };
      await writeLock(lockPath, lock);

      const result = await readLock(lockPath);
      expect(result).toEqual(lock);
    });

    test("readLock returns null for non-existent file", async () => {
      const result = await readLock(lockPath);
      expect(result).toBeNull();
    });

    test("readLock returns null for stale lock (process not running)", async () => {
      const lock = { pid: 999999999, port: 5173 };
      await writeLock(lockPath, lock);

      const result = await readLock(lockPath);
      expect(result).toBeNull();

      // Lock file should be cleaned up
      const exists = await fs.exists(lockPath);
      expect(exists).toBe(false);
    });

    test("readLock returns null for invalid JSON", async () => {
      await fs.mkdir(path.dirname(lockPath), { recursive: true });
      await fs.writeFile(lockPath, "not json");

      const result = await readLock(lockPath);
      expect(result).toBeNull();
    });

    test("readLock returns null for invalid lock structure", async () => {
      await fs.mkdir(path.dirname(lockPath), { recursive: true });
      await fs.writeFile(lockPath, JSON.stringify({ foo: "bar" }));

      const result = await readLock(lockPath);
      expect(result).toBeNull();
    });
  });

  describe("removeLock", () => {
    test("removes existing lock file", async () => {
      await writeLock(lockPath, { pid: process.pid, port: 5173 });
      expect(await fs.exists(lockPath)).toBe(true);

      await removeLock(lockPath);
      expect(await fs.exists(lockPath)).toBe(false);
    });

    test("does not throw when lock file does not exist", async () => {
      await removeLock(lockPath);
      // Should not throw
    });
  });
});
