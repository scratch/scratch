import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("checkout command", () => {
  test("gets all files in a directory", async () => {
    const tempDir = await mkTempDir("checkout-dir-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify multiple files in src/
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const pageWrapperPath = path.join(sandboxDir, "src/template/PageWrapper.jsx");

    const originalTailwind = await fs.readFile(tailwindPath, "utf-8");
    const originalPageWrapper = await fs.readFile(pageWrapperPath, "utf-8");

    await fs.writeFile(tailwindPath, "/* modified tailwind */");
    await fs.writeFile(pageWrapperPath, "// modified wrapper");

    // Get the entire src/ directory (--force to skip interactive prompt)
    runCliSync(["checkout", "--force", "src"], sandboxDir);

    // Verify both files were restored
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalTailwind);
    expect(await fs.readFile(pageWrapperPath, "utf-8")).toBe(originalPageWrapper);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
