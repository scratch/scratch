import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("checkout command", () => {
  test("gets a single file from templates", async () => {
    const tempDir = await mkTempDir("checkout-single-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify a template file
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const originalContent = await fs.readFile(tailwindPath, "utf-8");
    await fs.writeFile(tailwindPath, "/* modified */");

    // Verify it was modified
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe("/* modified */");

    // Get the file (--force to skip interactive prompt in non-TTY tests)
    runCliSync(["checkout", "--force", "src/tailwind.css"], sandboxDir);

    // Verify it was restored to template content
    const restoredContent = await fs.readFile(tailwindPath, "utf-8");
    expect(restoredContent).toBe(originalContent);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
