import { describe, expect, test } from "bun:test";
import { readdir, rm } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("scratch create --no-example", () => {
  test("creates empty pages/ and public/ directories", async () => {
    const projectDir = await mkTempDir("create-no-example-");

    // Run scratch create with --no-example flag
    runCliSync(["create", ".", "--no-example"], projectDir);

    // Verify pages/ directory exists but is empty
    const pagesDir = path.join(projectDir, "pages");
    const pagesFiles = await readdir(pagesDir);
    expect(pagesFiles).toEqual([]);

    // Verify public/ directory exists but is empty
    const publicDir = path.join(projectDir, "public");
    const publicFiles = await readdir(publicDir);
    expect(publicFiles).toEqual([]);

    // Verify src/ directory exists and has content
    const srcDir = path.join(projectDir, "src");
    const srcFiles = await readdir(srcDir);
    expect(srcFiles).toContain("PageWrapper.jsx");
    expect(srcFiles).toContain("tailwind.css");
    expect(srcFiles).toContain("markdown");

    // Verify root files exist
    const rootFiles = await readdir(projectDir);
    expect(rootFiles).toContain(".gitignore");
    expect(rootFiles).toContain("AGENTS.md");
    expect(rootFiles).toContain("package.json");

    // Clean up
    await rm(projectDir, { recursive: true, force: true });
  }, 60_000);
});
