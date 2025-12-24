import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { runCliSync, mkTempDir, scratchPath } from "./util";

/**
 * Run CLI and return stdout/stderr without throwing on non-zero exit
 */
function runCliCapture(args: string[], cwd: string) {
  const result = spawnSync(scratchPath, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("revert command", () => {
  test("reverts a single file to template version", async () => {
    const tempDir = await mkTempDir("revert-single-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify a template file
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const originalContent = await fs.readFile(tailwindPath, "utf-8");
    await fs.writeFile(tailwindPath, "/* modified */");

    // Verify it was modified
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe("/* modified */");

    // Revert the file (--force to skip interactive prompt in non-TTY tests)
    runCliSync(["revert", "--force", "src/tailwind.css"], sandboxDir);

    // Verify it was reverted to template content
    const revertedContent = await fs.readFile(tailwindPath, "utf-8");
    expect(revertedContent).toBe(originalContent);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("reverts all files in a directory", async () => {
    const tempDir = await mkTempDir("revert-dir-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify multiple files in src/
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const pageWrapperPath = path.join(sandboxDir, "src/PageWrapper.jsx");

    const originalTailwind = await fs.readFile(tailwindPath, "utf-8");
    const originalPageWrapper = await fs.readFile(pageWrapperPath, "utf-8");

    await fs.writeFile(tailwindPath, "/* modified tailwind */");
    await fs.writeFile(pageWrapperPath, "// modified wrapper");

    // Revert the entire src/ directory (--force to skip interactive prompt)
    runCliSync(["revert", "--force", "src"], sandboxDir);

    // Verify both files were reverted
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalTailwind);
    expect(await fs.readFile(pageWrapperPath, "utf-8")).toBe(originalPageWrapper);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("lists available template files with --list", async () => {
    const tempDir = await mkTempDir("revert-list-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["revert", "--list"], sandboxDir);

    expect(result.status).toBe(0);
    // Should include common template files
    expect(result.stdout).toContain("src/tailwind.css");
    expect(result.stdout).toContain("pages/index.mdx");
    // Should NOT include _build/ files
    expect(result.stdout).not.toContain("_build/");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("exits with error for non-existent template", async () => {
    const tempDir = await mkTempDir("revert-notfound-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["revert", "nonexistent.txt"], sandboxDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No template found for: nonexistent.txt");
    expect(result.stdout).toContain("project root");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("normalizes paths with leading ./ and trailing /", async () => {
    const tempDir = await mkTempDir("revert-normalize-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify a file
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const originalContent = await fs.readFile(tailwindPath, "utf-8");
    await fs.writeFile(tailwindPath, "/* modified */");

    // Revert with leading ./ (--force to skip interactive prompt)
    runCliSync(["revert", "--force", "./src/tailwind.css"], sandboxDir);
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

    // Modify again and revert directory with trailing /
    await fs.writeFile(tailwindPath, "/* modified again */");
    runCliSync(["revert", "--force", "src/"], sandboxDir);
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("exits with error when no path provided", async () => {
    const tempDir = await mkTempDir("revert-nopath-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["revert"], sandboxDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Please provide a file or directory path");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
