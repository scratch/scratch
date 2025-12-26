import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { findRouteToOpen } from "../../src/cmd/dev";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-dev-"));
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("findRouteToOpen", () => {
  test("returns '/' when index.mdx exists", async () => {
    const dir = path.join(tempDir, "with-index-mdx");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.mdx"), "# Index");
    await fs.writeFile(path.join(dir, "other.md"), "# Other");

    expect(await findRouteToOpen(dir)).toBe("/");
  });

  test("returns '/' when index.md exists", async () => {
    const dir = path.join(tempDir, "with-index-md");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.md"), "# Index");
    await fs.writeFile(path.join(dir, "other.md"), "# Other");

    expect(await findRouteToOpen(dir)).toBe("/");
  });

  test("prefers index.mdx over index.md", async () => {
    const dir = path.join(tempDir, "both-index");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.mdx"), "# MDX");
    await fs.writeFile(path.join(dir, "index.md"), "# MD");

    expect(await findRouteToOpen(dir)).toBe("/");
  });

  test("returns first file alphabetically when no index", async () => {
    const dir = path.join(tempDir, "no-index");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "beta.md"), "# Beta");
    await fs.writeFile(path.join(dir, "alpha.md"), "# Alpha");
    await fs.writeFile(path.join(dir, "gamma.mdx"), "# Gamma");

    expect(await findRouteToOpen(dir)).toBe("/alpha");
  });

  test("returns null for empty directory", async () => {
    const dir = path.join(tempDir, "empty");
    await fs.mkdir(dir, { recursive: true });

    expect(await findRouteToOpen(dir)).toBe(null);
  });

  test("skips empty subdirectories to find content", async () => {
    const dir = path.join(tempDir, "skip-empty");
    await fs.mkdir(path.join(dir, "aaa-empty"), { recursive: true });
    await fs.mkdir(path.join(dir, "bbb-content"), { recursive: true });
    await fs.writeFile(path.join(dir, "bbb-content", "page.md"), "# Page");

    // Should skip aaa-empty (alphabetically first) and find bbb-content/page.md
    expect(await findRouteToOpen(dir)).toBe("/bbb-content/page");
  });

  test("searches subdirectories when no markdown in root", async () => {
    const dir = path.join(tempDir, "with-subdir");
    await fs.mkdir(path.join(dir, "posts"), { recursive: true });
    await fs.writeFile(path.join(dir, "posts", "hello.md"), "# Hello");

    expect(await findRouteToOpen(dir)).toBe("/posts/hello");
  });

  test("prefers index in subdirectory", async () => {
    const dir = path.join(tempDir, "subdir-index");
    await fs.mkdir(path.join(dir, "docs"), { recursive: true });
    await fs.writeFile(path.join(dir, "docs", "index.md"), "# Docs");

    expect(await findRouteToOpen(dir)).toBe("/docs");
  });

  test("ignores non-markdown files", async () => {
    const dir = path.join(tempDir, "mixed-files");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "readme.txt"), "text");
    await fs.writeFile(path.join(dir, "script.js"), "js");
    await fs.writeFile(path.join(dir, "page.md"), "# Page");

    expect(await findRouteToOpen(dir)).toBe("/page");
  });
});
