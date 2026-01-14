import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("scratch build", () => {
  test("uses project-local _build/ files instead of embedded templates", async () => {
    const tempDir = await mkTempDir("build-local-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Checkout _build/ to get local copies of entry files
    runCliSync(["checkout", "_build"], sandboxDir);

    // Modify entry-client.tsx with a unique marker
    const entryClientPath = path.join(sandboxDir, "_build/entry-client.tsx");
    const originalContent = await fs.readFile(entryClientPath, "utf-8");
    const modifiedContent = originalContent.replace(
      "Hydrating mdx component",
      "CUSTOM_LOCAL_BUILD_MARKER"
    );
    await fs.writeFile(entryClientPath, modifiedContent);

    // Build the project
    runCliSync(["build"], sandboxDir);

    // Find the built JS file and check for our marker
    const distDir = path.join(sandboxDir, "dist");
    const files = await fs.readdir(distDir);
    const jsFile = files.find((f) => f.endsWith(".js"));
    expect(jsFile).toBeDefined();

    const jsContent = await fs.readFile(path.join(distDir, jsFile!), "utf-8");
    expect(jsContent).toContain("CUSTOM_LOCAL_BUILD_MARKER");
    // Should NOT contain the original template text
    expect(jsContent).not.toContain("Hydrating mdx component");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
