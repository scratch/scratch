import { describe, expect, test } from "bun:test";
import { rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { runCliSync, mkTempDir, scratchPath } from "./util";

describe("static asset conflict detection", () => {
  describe("Pass 1: source to dist conflicts", () => {
    test("fails when pages/foo.md and pages/foo.mdx both exist", async () => {
      const projectDir = await mkTempDir("conflict-md-mdx-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // Create both foo.md and foo.mdx
      await writeFile(path.join(projectDir, "pages", "foo.md"), "# Foo MD");
      await writeFile(path.join(projectDir, "pages", "foo.mdx"), "# Foo MDX");

      // Build should fail
      const result = spawnSync(scratchPath, ["build", "--no-ssg"], {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify build failed
      expect(result.status).not.toBe(0);

      // Verify error message mentions the conflict
      const output = result.stderr + result.stdout;
      expect(output).toContain("conflict");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("fails when pages/file.png and public/file.png both exist", async () => {
      const projectDir = await mkTempDir("conflict-static-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // Create file.png in both pages/ and public/
      await writeFile(path.join(projectDir, "pages", "logo.png"), "fake png 1");
      await writeFile(path.join(projectDir, "public", "logo.png"), "fake png 2");

      // Build should fail
      const result = spawnSync(scratchPath, ["build", "--no-ssg"], {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify build failed
      expect(result.status).not.toBe(0);

      // Verify error message mentions the conflict
      const output = result.stderr + result.stdout;
      expect(output).toContain("conflict");
      expect(output).toContain("logo.png");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("fails when pages/doc.mdx and public/doc.md both exist", async () => {
      const projectDir = await mkTempDir("conflict-mdx-public-md-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // pages/doc.mdx → dist/doc.md (after rename)
      // public/doc.md → dist/doc.md
      await writeFile(path.join(projectDir, "pages", "doc.mdx"), "# Doc from pages");
      await writeFile(path.join(projectDir, "public", "doc.md"), "# Doc from public");

      // Build should fail
      const result = spawnSync(scratchPath, ["build", "--no-ssg"], {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify build failed
      expect(result.status).not.toBe(0);

      // Verify error message mentions the conflict
      const output = result.stderr + result.stdout;
      expect(output).toContain("conflict");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("fails when pages/about.mdx and pages/about/index.mdx both exist", async () => {
      const projectDir = await mkTempDir("conflict-html-output-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // Both compile to dist/about/index.html
      await writeFile(path.join(projectDir, "pages", "about.mdx"), "# About page");
      await mkdir(path.join(projectDir, "pages", "about"), { recursive: true });
      await writeFile(path.join(projectDir, "pages", "about", "index.mdx"), "# About index");

      // Build should fail
      const result = spawnSync(scratchPath, ["build", "--no-ssg"], {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify build failed
      expect(result.status).not.toBe(0);

      // Verify error message mentions the conflict
      const output = result.stderr + result.stdout;
      expect(output).toContain("conflict");
      expect(output).toContain("about/index.html");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("fails when pages/about.md and pages/about/index.md both exist", async () => {
      const projectDir = await mkTempDir("conflict-html-output-md-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // Both compile to dist/about/index.html
      await writeFile(path.join(projectDir, "pages", "about.md"), "# About page");
      await mkdir(path.join(projectDir, "pages", "about"), { recursive: true });
      await writeFile(path.join(projectDir, "pages", "about", "index.md"), "# About index");

      // Build should fail
      const result = spawnSync(scratchPath, ["build", "--no-ssg"], {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify build failed
      expect(result.status).not.toBe(0);

      // Verify error message mentions the conflict
      const output = result.stderr + result.stdout;
      expect(output).toContain("conflict");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("error message lists all conflicting files", async () => {
      const projectDir = await mkTempDir("conflict-message-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // Create conflict
      await writeFile(path.join(projectDir, "pages", "foo.md"), "# Foo MD");
      await writeFile(path.join(projectDir, "pages", "foo.mdx"), "# Foo MDX");

      // Build should fail
      const result = spawnSync(scratchPath, ["build", "--no-ssg"], {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify error message format
      const output = result.stderr + result.stdout;
      expect(output).toContain("foo.md");
      expect(output).toContain("foo.mdx");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);
  });

  describe("Pass 2: URL routing conflicts", () => {
    test("fails when dist would have both foo/index.html and foo.html", async () => {
      const projectDir = await mkTempDir("conflict-url-html-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // pages/foo.mdx → dist/foo/index.html (HTML compilation)
      // public/foo.html → dist/foo.html
      // Both serve URL /foo
      await writeFile(path.join(projectDir, "pages", "foo.mdx"), "# Foo from pages");
      await writeFile(path.join(projectDir, "public", "foo.html"), "<html><body>Foo from public</body></html>");

      // Build should fail
      const result = spawnSync(scratchPath, ["build", "--no-ssg"], {
        cwd: projectDir,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify build failed
      expect(result.status).not.toBe(0);

      // Verify error message shows URL conflict
      const output = result.stderr + result.stdout;
      expect(output).toContain("conflict");
      expect(output).toContain("/foo");

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);
  });

  describe("non-conflicts (should succeed)", () => {
    test("allows pages/foo.mdx (compiles to HTML) + pages/foo.txt (static copy)", async () => {
      const projectDir = await mkTempDir("no-conflict-txt-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // pages/foo.mdx → dist/foo/index.html + dist/foo.md
      // pages/foo.txt → dist/foo.txt
      // Different paths, no conflict
      await writeFile(path.join(projectDir, "pages", "foo.mdx"), "# Foo MDX");
      await writeFile(path.join(projectDir, "pages", "foo.txt"), "Foo plain text");

      // Build should succeed
      runCliSync(["build", "--no-ssg"], projectDir);

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("allows pages/foo.md + public/bar.md", async () => {
      const projectDir = await mkTempDir("no-conflict-different-names-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // Different names, no conflict
      await writeFile(path.join(projectDir, "pages", "foo.md"), "# Foo");
      await writeFile(path.join(projectDir, "public", "bar.md"), "# Bar");

      // Build should succeed
      runCliSync(["build", "--no-ssg"], projectDir);

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);

    test("allows nested paths that look similar but differ", async () => {
      const projectDir = await mkTempDir("no-conflict-nested-");

      // Create project
      runCliSync(["create", "."], projectDir);

      // pages/a/b.mdx + pages/ab.mdx - different paths
      await mkdir(path.join(projectDir, "pages", "a"), { recursive: true });
      await writeFile(path.join(projectDir, "pages", "a", "b.mdx"), "# A/B");
      await writeFile(path.join(projectDir, "pages", "ab.mdx"), "# AB");

      // Build should succeed
      runCliSync(["build", "--no-ssg"], projectDir);

      await rm(projectDir, { recursive: true, force: true });
    }, 120_000);
  });
});
