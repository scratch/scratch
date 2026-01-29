import { describe, expect, test } from "bun:test";
import { readdir, rm, mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("static asset copying", () => {
  describe("default behavior", () => {
    test("copies .md files from pages/ to dist/", async () => {
      const projectDir = await mkTempDir("static-md-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "extra.md"), "# Extra Content");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).toContain("extra.md");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("copies .txt files from pages/ to dist/", async () => {
      const projectDir = await mkTempDir("static-txt-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "notes.txt"), "Plain text notes");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).toContain("notes.txt");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("renames .mdx to .md when copying", async () => {
      const projectDir = await mkTempDir("static-mdx-rename-");

      runCliSync(["create", "."], projectDir);
      // Create a separate mdx file (not index.mdx)
      await writeFile(path.join(projectDir, "pages", "article.mdx"), "# Article\n\nContent here");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      // Should have article.md (renamed from article.mdx)
      expect(distFiles).toContain("article.md");
      // Should NOT have article.mdx
      expect(distFiles).not.toContain("article.mdx");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("excludes .js files from pages/", async () => {
      const projectDir = await mkTempDir("static-no-js-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "helper.js"), "export default () => null");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).not.toContain("helper.js");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("excludes .jsx files from pages/", async () => {
      const projectDir = await mkTempDir("static-no-jsx-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "Component.jsx"), "export default () => null");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).not.toContain("Component.jsx");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("excludes .ts files from pages/", async () => {
      const projectDir = await mkTempDir("static-no-ts-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "util.ts"), "export const x = 1");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).not.toContain("util.ts");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("excludes .tsx files from pages/", async () => {
      const projectDir = await mkTempDir("static-no-tsx-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "Widget.tsx"), "export default () => null");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).not.toContain("Widget.tsx");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("excludes .mjs and .cjs files from pages/", async () => {
      const projectDir = await mkTempDir("static-no-mjs-cjs-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "module.mjs"), "export const x = 1");
      await writeFile(path.join(projectDir, "pages", "require.cjs"), "module.exports = {}");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).not.toContain("module.mjs");
      expect(distFiles).not.toContain("require.cjs");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("copies all files from public/ unchanged", async () => {
      const projectDir = await mkTempDir("static-public-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "public", "data.json"), '{"key": "value"}');
      await writeFile(path.join(projectDir, "public", "robots.txt"), "User-agent: *");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).toContain("data.json");
      expect(distFiles).toContain("robots.txt");

      // Verify content is unchanged
      const content = await readFile(path.join(projectDir, "dist", "data.json"), "utf-8");
      expect(content).toBe('{"key": "value"}');

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("copies images and other assets from pages/", async () => {
      const projectDir = await mkTempDir("static-images-");

      runCliSync(["create", "."], projectDir);
      await mkdir(path.join(projectDir, "pages", "images"), { recursive: true });
      await writeFile(path.join(projectDir, "pages", "images", "photo.png"), "fake png");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).toContain(path.join("images", "photo.png"));

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("preserves directory structure when copying", async () => {
      const projectDir = await mkTempDir("static-structure-");

      runCliSync(["create", "."], projectDir);
      await mkdir(path.join(projectDir, "pages", "docs", "guide"), { recursive: true });
      await writeFile(path.join(projectDir, "pages", "docs", "guide", "intro.md"), "# Intro");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).toContain(path.join("docs", "guide", "intro.md"));

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);
  });

  describe("MDX to MD rename edge cases", () => {
    test("handles deeply nested .mdx files", async () => {
      const projectDir = await mkTempDir("static-deep-mdx-");

      runCliSync(["create", "."], projectDir);
      await mkdir(path.join(projectDir, "pages", "a", "b", "c"), { recursive: true });
      await writeFile(path.join(projectDir, "pages", "a", "b", "c", "deep.mdx"), "# Deep content");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).toContain(path.join("a", "b", "c", "deep.md"));
      expect(distFiles).not.toContain(path.join("a", "b", "c", "deep.mdx"));

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("handles .mdx with special characters in name", async () => {
      const projectDir = await mkTempDir("static-special-mdx-");

      runCliSync(["create", "."], projectDir);
      await writeFile(path.join(projectDir, "pages", "my-article_v2.mdx"), "# My Article v2");

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      expect(distFiles).toContain("my-article_v2.md");
      expect(distFiles).not.toContain("my-article_v2.mdx");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("index.mdx is renamed to index.md", async () => {
      const projectDir = await mkTempDir("static-index-mdx-");

      runCliSync(["create", "."], projectDir);
      // The default template already has index.mdx

      runCliSync(["build"], projectDir);

      const distFiles = await readdir(path.join(projectDir, "dist"), { recursive: true });
      // index.mdx should be renamed to index.md
      expect(distFiles).toContain("index.md");
      expect(distFiles).not.toContain("index.mdx");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);
  });
});
