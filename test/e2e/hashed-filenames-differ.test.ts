import { describe, expect, test } from "bun:test";
import { readFile, readdir, rm } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Hashed filenames for cache busting", () => {
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
