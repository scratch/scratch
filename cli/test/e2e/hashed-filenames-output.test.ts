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
});
