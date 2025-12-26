import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { findRoute } from "../../src/cmd/dev";
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

describe("findRoute", () => {
  test("returns '/' when index.mdx exists", async () => {
    const dir = path.join(tempDir, "with-index-mdx");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.mdx"), "# Index");
    await fs.writeFile(path.join(dir, "other.md"), "# Other");

    expect(await findRoute(dir)).toBe("/");
  });

  test("returns '/' when index.md exists", async () => {
    const dir = path.join(tempDir, "with-index-md");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.md"), "# Index");
    await fs.writeFile(path.join(dir, "other.md"), "# Other");

    expect(await findRoute(dir)).toBe("/");
  });

  test("prefers index.mdx over index.md", async () => {
    const dir = path.join(tempDir, "both-index");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.mdx"), "# MDX");
    await fs.writeFile(path.join(dir, "index.md"), "# MD");

    expect(await findRoute(dir)).toBe("/");
  });

  test("returns first file alphabetically when no index", async () => {
    const dir = path.join(tempDir, "no-index");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "beta.md"), "# Beta");
    await fs.writeFile(path.join(dir, "alpha.md"), "# Alpha");
    await fs.writeFile(path.join(dir, "gamma.mdx"), "# Gamma");

    expect(await findRoute(dir)).toBe("/alpha");
  });

  test("returns '/' for empty directory", async () => {
    const dir = path.join(tempDir, "empty");
    await fs.mkdir(dir, { recursive: true });

    expect(await findRoute(dir)).toBe("/");
  });

  test("ignores non-markdown files", async () => {
    const dir = path.join(tempDir, "mixed-files");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "readme.txt"), "text");
    await fs.writeFile(path.join(dir, "script.js"), "js");
    await fs.writeFile(path.join(dir, "page.md"), "# Page");

    expect(await findRoute(dir)).toBe("/page");
  });
});
