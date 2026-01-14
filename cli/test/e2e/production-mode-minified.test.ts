import { describe, expect, test } from "bun:test";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Production mode", () => {
  test("production build (no --development) produces minified output without source maps", async () => {
    // 1. Create a fresh sandbox project
    const tempDir = await mkTempDir("prod-mode-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Add a page with identifiable content
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Production Mode Test\n\n<div className="bg-blue-500">Test Content</div>`
    );

    // 3. Build WITHOUT --development flag (production mode)
    runCliSync(["build", "sandbox"], tempDir);

    // 4. Check that NO source map files exist
    const distDir = path.join(sandboxDir, "dist");
    const distFiles = await readdir(distDir);
    const mapFiles = distFiles.filter((f) => f.endsWith(".map"));
    expect(mapFiles.length).toBe(0);

    // 5. Check that JS is minified (fewer lines, more compact)
    const jsFiles = distFiles.filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);

    const jsContent = await readFile(path.join(distDir, jsFiles[0]), "utf-8");
    // Minified code has longer average line length due to whitespace removal
    const lines = jsContent.split("\n").filter(l => l.length > 0);
    const avgLineLength = jsContent.length / lines.length;
    expect(avgLineLength).toBeGreaterThan(200);

    // 6. Check that CSS is minified (longer average line length)
    const cssFiles = distFiles.filter((f) => f.endsWith(".css"));
    expect(cssFiles.length).toBeGreaterThan(0);

    const cssContent = await readFile(path.join(distDir, cssFiles[0]), "utf-8");
    const cssLines = cssContent.split("\n").filter(l => l.length > 0);
    const avgCssLineLength = cssContent.length / cssLines.length;
    expect(avgCssLineLength).toBeGreaterThan(200);

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
