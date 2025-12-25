import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("checkout command", () => {
  test("normalizes paths with leading ./ and trailing /", async () => {
    const tempDir = await mkTempDir("checkout-normalize-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify a file
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const originalContent = await fs.readFile(tailwindPath, "utf-8");
    await fs.writeFile(tailwindPath, "/* modified */");

    // Get with leading ./ (--force to skip interactive prompt)
    runCliSync(["checkout", "--force", "./src/tailwind.css"], sandboxDir);
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

    // Modify again and get directory with trailing /
    await fs.writeFile(tailwindPath, "/* modified again */");
    runCliSync(["checkout", "--force", "src/"], sandboxDir);
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
