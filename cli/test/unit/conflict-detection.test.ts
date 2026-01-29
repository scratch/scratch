import { describe, expect, test, afterEach } from "bun:test";
import { computeUrlPath, detectConflicts } from "../../src/build/steps/02b-check-conflicts";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("computeUrlPath", () => {
  test("foo/index.html → /foo", () => {
    expect(computeUrlPath("foo/index.html")).toBe("/foo");
  });

  test("foo/bar/index.html → /foo/bar", () => {
    expect(computeUrlPath("foo/bar/index.html")).toBe("/foo/bar");
  });

  test("index.html → /", () => {
    expect(computeUrlPath("index.html")).toBe("/");
  });

  test("foo.html → /foo", () => {
    expect(computeUrlPath("foo.html")).toBe("/foo");
  });

  test("foo.txt → /foo.txt", () => {
    expect(computeUrlPath("foo.txt")).toBe("/foo.txt");
  });

  test("foo/bar.css → /foo/bar.css", () => {
    expect(computeUrlPath("foo/bar.css")).toBe("/foo/bar.css");
  });

  test("handles Windows path separators", () => {
    expect(computeUrlPath("foo\\index.html")).toBe("/foo");
    expect(computeUrlPath("foo\\bar\\index.html")).toBe("/foo/bar");
  });

  test("handles nested paths correctly", () => {
    expect(computeUrlPath("a/b/c/index.html")).toBe("/a/b/c");
    expect(computeUrlPath("deeply/nested/path.html")).toBe("/deeply/nested/path");
    expect(computeUrlPath("assets/styles/main.css")).toBe("/assets/styles/main.css");
  });
});

describe("detectConflicts", () => {
  let tempDir: string;
  let pagesDir: string;
  let publicDir: string;

  // Helper to create test directories and files
  async function setupTestDir() {
    tempDir = join(tmpdir(), `conflict-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    pagesDir = join(tempDir, "pages");
    publicDir = join(tempDir, "public");
    await mkdir(pagesDir, { recursive: true });
    await mkdir(publicDir, { recursive: true });
  }

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("Pass 1: source to dist path conflicts", () => {
    test("detects pages/foo.md + pages/foo.mdx conflict (both → dist/foo.md)", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "foo.md"), "# Foo MD");
      await writeFile(join(pagesDir, "foo.mdx"), "# Foo MDX");

      const result = detectConflicts(pagesDir, publicDir);

      // Both produce dist/foo.md (static copy) and dist/foo/index.html (HTML)
      expect(result.pathConflicts.length).toBeGreaterThan(0);
      const mdConflict = result.pathConflicts.find(c => c.distPath === "foo.md");
      expect(mdConflict).toBeDefined();
    });

    test("allows pages/foo.mdx + pages/bar.mdx (no conflict)", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "foo.mdx"), "# Foo");
      await writeFile(join(pagesDir, "bar.mdx"), "# Bar");

      const result = detectConflicts(pagesDir, publicDir);

      // No path conflicts - different files
      expect(result.pathConflicts.length).toBe(0);
    });

    test("detects pages/foo.mdx + pages/foo/index.mdx HTML output conflict", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "foo.mdx"), "# Foo");
      await mkdir(join(pagesDir, "foo"), { recursive: true });
      await writeFile(join(pagesDir, "foo", "index.mdx"), "# Foo Index");

      const result = detectConflicts(pagesDir, publicDir);

      // Both produce dist/foo/index.html
      const htmlConflict = result.pathConflicts.find(c =>
        c.distPath === "foo/index.html"
      );
      expect(htmlConflict).toBeDefined();
      expect(htmlConflict!.sources.length).toBe(2);
    });

    test("detects pages/about.md + pages/about/index.md HTML output conflict", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "about.md"), "# About");
      await mkdir(join(pagesDir, "about"), { recursive: true });
      await writeFile(join(pagesDir, "about", "index.md"), "# About Index");

      const result = detectConflicts(pagesDir, publicDir);

      // Both produce dist/about/index.html
      const htmlConflict = result.pathConflicts.find(c =>
        c.distPath === "about/index.html"
      );
      expect(htmlConflict).toBeDefined();
      expect(htmlConflict!.sources.length).toBe(2);
    });

    test("detects pages/logo.png + public/logo.png conflict", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "logo.png"), "fake png 1");
      await writeFile(join(publicDir, "logo.png"), "fake png 2");

      const result = detectConflicts(pagesDir, publicDir);

      const conflict = result.pathConflicts.find(c => c.distPath === "logo.png");
      expect(conflict).toBeDefined();
      expect(conflict!.sources.length).toBe(2);
    });

    test("detects pages/doc.mdx + public/doc.md conflict", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "doc.mdx"), "# Doc from pages");
      await writeFile(join(publicDir, "doc.md"), "# Doc from public");

      const result = detectConflicts(pagesDir, publicDir);

      // pages/doc.mdx → dist/doc.md (after rename)
      // public/doc.md → dist/doc.md
      const conflict = result.pathConflicts.find(c => c.distPath === "doc.md");
      expect(conflict).toBeDefined();
    });
  });

  describe("Pass 2: dist to URL path conflicts", () => {
    test("detects foo/index.html + foo.html conflict (both serve /foo)", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "foo.mdx"), "# Foo from pages");
      await writeFile(join(publicDir, "foo.html"), "<html><body>Foo from public</body></html>");

      const result = detectConflicts(pagesDir, publicDir);

      // pages/foo.mdx → dist/foo/index.html
      // public/foo.html → dist/foo.html
      // Both serve URL /foo
      const urlConflict = result.urlConflicts.find(c => c.urlPath === "/foo");
      expect(urlConflict).toBeDefined();
      expect(urlConflict!.distPaths).toContain("foo/index.html");
      expect(urlConflict!.distPaths).toContain("foo.html");
    });

    test("foo.md and foo/index.html serve different URLs", () => {
      // foo.md serves /foo.md
      // foo/index.html serves /foo
      expect(computeUrlPath("foo.md")).toBe("/foo.md");
      expect(computeUrlPath("foo/index.html")).toBe("/foo");
      // Different URLs, no conflict
    });
  });

  describe("non-conflicts (should succeed)", () => {
    test("allows pages/foo.mdx (compiles to HTML) + pages/foo.txt (static copy)", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "foo.mdx"), "# Foo MDX");
      await writeFile(join(pagesDir, "foo.txt"), "Foo plain text");

      const result = detectConflicts(pagesDir, publicDir);

      // foo.mdx → dist/foo/index.html + dist/foo.md
      // foo.txt → dist/foo.txt (different path)
      expect(result.pathConflicts.length).toBe(0);
    });

    test("allows pages/foo.md + public/bar.md", async () => {
      await setupTestDir();
      await writeFile(join(pagesDir, "foo.md"), "# Foo");
      await writeFile(join(publicDir, "bar.md"), "# Bar");

      const result = detectConflicts(pagesDir, publicDir);

      // Different names, no conflict
      expect(result.pathConflicts.length).toBe(0);
      expect(result.urlConflicts.length).toBe(0);
    });

    test("allows nested paths that look similar but differ", async () => {
      await setupTestDir();
      await mkdir(join(pagesDir, "a"), { recursive: true });
      await writeFile(join(pagesDir, "a", "b.mdx"), "# A/B");
      await writeFile(join(pagesDir, "ab.mdx"), "# AB");

      const result = detectConflicts(pagesDir, publicDir);

      // a/b.mdx → dist/a/b/index.html + dist/a/b.md
      // ab.mdx → dist/ab/index.html + dist/ab.md
      // Different paths
      expect(result.pathConflicts.length).toBe(0);
    });
  });
});
