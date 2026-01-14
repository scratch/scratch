import { describe, expect, test } from "bun:test";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Development mode", () => {
  test("--development produces unminified output with source maps", async () => {
    // 1. Create a fresh sandbox project
    const tempDir = await mkTempDir("dev-mode-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Add a page with identifiable content
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Development Mode Test\n\n<div className="bg-blue-500">Test Content</div>`
    );

    // 3. Build with --development flag
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Check that source map files exist
    const distDir = path.join(sandboxDir, "dist");
    const distFiles = await readdir(distDir);
    const mapFiles = distFiles.filter((f) => f.endsWith(".map"));
    expect(mapFiles.length).toBeGreaterThan(0);

    // 5. Check that JS is not minified (contains newlines and readable structure)
    const jsFiles = distFiles.filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);

    const jsContent = await readFile(path.join(distDir, jsFiles[0]), "utf-8");
    // Unminified code has shorter average line length due to formatting
    const lines = jsContent.split("\n").filter(l => l.length > 0);
    const avgLineLength = jsContent.length / lines.length;
    expect(avgLineLength).toBeLessThan(200);

    // 6. Check that CSS is not minified (shorter average line length)
    const cssFiles = distFiles.filter((f) => f.endsWith(".css"));
    expect(cssFiles.length).toBeGreaterThan(0);

    const cssContent = await readFile(path.join(distDir, cssFiles[0]), "utf-8");
    const cssLines = cssContent.split("\n").filter(l => l.length > 0);
    const avgCssLineLength = cssContent.length / cssLines.length;
    expect(avgCssLineLength).toBeLessThan(200);

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
