import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { mkTempDir, scratchPath } from "./util";

describe("Component error detection", () => {
  test("build fails with helpful message when component is not found", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("component-not-found-");

    spawnSync(scratchPath, ["create", "sandbox"], {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file that uses a component that doesn't exist
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Test Page

<NonExistentComponent />
`
    );

    // 3. Build should fail (SSG required to surface missing component error)
    const result = spawnSync(scratchPath, ["build", "sandbox"], {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    // 4. Verify build failed with helpful error message (MDX's built-in error)
    expect(result.status).not.toBe(0);
    const output = result.stderr + result.stdout;
    expect(output).toContain("NonExistentComponent");
    expect(output).toContain("forgot to import");

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
