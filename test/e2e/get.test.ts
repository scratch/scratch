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

describe("get command", () => {
  test("gets a single file from templates", async () => {
    const tempDir = await mkTempDir("get-single-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify a template file
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const originalContent = await fs.readFile(tailwindPath, "utf-8");
    await fs.writeFile(tailwindPath, "/* modified */");

    // Verify it was modified
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe("/* modified */");

    // Get the file (--force to skip interactive prompt in non-TTY tests)
    runCliSync(["get", "--force", "src/tailwind.css"], sandboxDir);

    // Verify it was restored to template content
    const restoredContent = await fs.readFile(tailwindPath, "utf-8");
    expect(restoredContent).toBe(originalContent);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("gets all files in a directory", async () => {
    const tempDir = await mkTempDir("get-dir-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify multiple files in src/
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const pageWrapperPath = path.join(sandboxDir, "src/PageWrapper.jsx");

    const originalTailwind = await fs.readFile(tailwindPath, "utf-8");
    const originalPageWrapper = await fs.readFile(pageWrapperPath, "utf-8");

    await fs.writeFile(tailwindPath, "/* modified tailwind */");
    await fs.writeFile(pageWrapperPath, "// modified wrapper");

    // Get the entire src/ directory (--force to skip interactive prompt)
    runCliSync(["get", "--force", "src"], sandboxDir);

    // Verify both files were restored
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalTailwind);
    expect(await fs.readFile(pageWrapperPath, "utf-8")).toBe(originalPageWrapper);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("lists available template files with --list", async () => {
    const tempDir = await mkTempDir("get-list-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["get", "--list"], sandboxDir);

    expect(result.status).toBe(0);
    // Should include common template files (shown in tree format)
    expect(result.stdout).toContain("tailwind.css");
    expect(result.stdout).toContain("index.mdx");
    expect(result.stdout).toContain("src/");
    expect(result.stdout).toContain("pages/");
    // Should NOT include _build/ files
    expect(result.stdout).not.toContain("_build/");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("exits with error for non-existent template", async () => {
    const tempDir = await mkTempDir("get-notfound-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["get", "nonexistent.txt"], sandboxDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No template found for: nonexistent.txt");
    expect(result.stdout).toContain("project root");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("normalizes paths with leading ./ and trailing /", async () => {
    const tempDir = await mkTempDir("get-normalize-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Modify a file
    const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
    const originalContent = await fs.readFile(tailwindPath, "utf-8");
    await fs.writeFile(tailwindPath, "/* modified */");

    // Get with leading ./ (--force to skip interactive prompt)
    runCliSync(["get", "--force", "./src/tailwind.css"], sandboxDir);
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

    // Modify again and get directory with trailing /
    await fs.writeFile(tailwindPath, "/* modified again */");
    runCliSync(["get", "--force", "src/"], sandboxDir);
    expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);

  test("exits with error when no path provided", async () => {
    const tempDir = await mkTempDir("get-nopath-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["get"], sandboxDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Please provide a file or directory path");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
