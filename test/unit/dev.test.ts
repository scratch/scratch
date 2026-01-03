import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { findRoute, hasStaticFileExtension } from "../../src/cmd/dev";
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
