import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";


describe("Tailwind integration", () => {
  test("build succeeds and rendered HTML contains Tailwind class", async () => {
    // 1. Create a fresh sandbox project inside a temporary directory.
    const tempDir = await mkTempDir("tailwind-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Replace the default index.mdx with one that uses a Tailwind class.
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Tailwind Test\n\n<div className=\"text-red-500\">Hello Tailwind</div>`
    );

    // 3. Build the project without SSG
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    // 4. Read the generated CSS and verify it contains the Tailwind class
    const distDir = path.join(sandboxDir, "dist");
    // Find the CSS file (has hash in name)
    const { readdir } = await import("fs/promises");
    const files = await readdir(distDir);
    const cssFile = files.find((f) => f.endsWith(".css"));
    expect(cssFile).toBeDefined();
    const css = await readFile(path.join(distDir, cssFile!), "utf-8");
    expect(css).toMatch(/text-red-500/);

    // Cleanup temporary files.
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
