import { describe, expect, test } from "bun:test";
import { readFile, readdir, rm } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Hashed filenames for cache busting", () => {
  test("build outputs JS and CSS files with content hashes", async () => {
    // 1. Create a fresh sandbox project
    const tempDir = await mkTempDir("hashed-filenames-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Build the project without SSG (only testing filename hashing)
    runCliSync(["build", "sandbox", "--no-ssg"], tempDir);

    // 3. Read the dist directory
    const distDir = path.join(sandboxDir, "dist");
    const distFiles = await readdir(distDir);

    // 4. Verify JS file has hash in filename (pattern: index-[hash].js)
    const jsFiles = distFiles.filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);
    const jsFile = jsFiles.find((f) => f.startsWith("index-"));
    expect(jsFile).toBeDefined();
    expect(jsFile).toMatch(/^index-[a-z0-9]+\.js$/);

    // 5. Verify CSS file has hash in filename (pattern: tailwind-[hash].css)
    const cssFiles = distFiles.filter((f) => f.endsWith(".css"));
    expect(cssFiles.length).toBe(1);
    expect(cssFiles[0]).toMatch(/^tailwind-[a-z0-9]+\.css$/);

    // 6. Read HTML and verify it references the correct hashed files
    const html = await readFile(path.join(distDir, "index.html"), "utf-8");

    // HTML should reference the hashed JS file
    expect(html).toContain(`src="/${jsFile}"`);

    // HTML should reference the hashed CSS file
    expect(html).toContain(`href="/${cssFiles[0]}"`);

    // 7. Verify HTML does NOT reference non-hashed filenames
    expect(html).not.toContain('src="/index.js"');
    expect(html).not.toContain('href="/tailwind.css"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("different content produces different hashes", async () => {
    // 1. Create first project
    const tempDir1 = await mkTempDir("hash-diff-1-");
    runCliSync(["create", "sandbox"], tempDir1);
    const sandboxDir1 = path.join(tempDir1, "sandbox");
    runCliSync(["build", "sandbox", "--no-ssg"], tempDir1);

    // 2. Create second project with different content
    const tempDir2 = await mkTempDir("hash-diff-2-");
    runCliSync(["create", "sandbox"], tempDir2);
    const sandboxDir2 = path.join(tempDir2, "sandbox");

    // Modify the MDX content
    const mdxPath = path.join(sandboxDir2, "pages", "index.mdx");
    const originalContent = await readFile(mdxPath, "utf-8");
    await Bun.write(mdxPath, originalContent + "\n\nExtra content to change the hash.");

    runCliSync(["build", "sandbox", "--no-ssg"], tempDir2);

    // 3. Get JS filenames from both builds
    const dist1Files = await readdir(path.join(sandboxDir1, "dist"));
    const dist2Files = await readdir(path.join(sandboxDir2, "dist"));

    const js1 = dist1Files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    const js2 = dist2Files.find((f) => f.startsWith("index-") && f.endsWith(".js"));

    // 4. Hashes should be different since content differs
    expect(js1).toBeDefined();
    expect(js2).toBeDefined();
    expect(js1).not.toBe(js2);

    // Cleanup
    await rm(tempDir1, { recursive: true, force: true });
    await rm(tempDir2, { recursive: true, force: true });
  }, 180_000);
});
