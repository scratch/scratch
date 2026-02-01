import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, runCliCapture, mkTempDir, withSandboxProject } from "./util";

/**
 * Consolidated tests for the eject command.
 *
 * The eject command allows users to extract template files from the embedded
 * templates for customization.
 */

describe("eject command", () => {
  describe("single file operations", () => {
    test("ejects a single file from templates", async () => {
      const tempDir = await mkTempDir("eject-single-");
      runCliSync(["create", "sandbox"], tempDir);
      const sandboxDir = path.join(tempDir, "sandbox");

      // Modify a template file
      const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
      const originalContent = await fs.readFile(tailwindPath, "utf-8");
      await fs.writeFile(tailwindPath, "/* modified */");

      // Verify it was modified
      expect(await fs.readFile(tailwindPath, "utf-8")).toBe("/* modified */");

      // Eject the file (--force to skip interactive prompt in non-TTY tests)
      runCliSync(["eject", "--force", "src/tailwind.css"], sandboxDir);

      // Verify it was restored to template content
      const restoredContent = await fs.readFile(tailwindPath, "utf-8");
      expect(restoredContent).toBe(originalContent);

      await rm(tempDir, { recursive: true, force: true });
    }, 60_000);
  });

  describe("directory operations", () => {
    test("ejects all files in a directory", async () => {
      const tempDir = await mkTempDir("eject-dir-");
      runCliSync(["create", "sandbox"], tempDir);
      const sandboxDir = path.join(tempDir, "sandbox");

      // Modify multiple files in src/
      const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
      const pageWrapperPath = path.join(sandboxDir, "src/template/PageWrapper.jsx");

      const originalTailwind = await fs.readFile(tailwindPath, "utf-8");
      const originalPageWrapper = await fs.readFile(pageWrapperPath, "utf-8");

      await fs.writeFile(tailwindPath, "/* modified tailwind */");
      await fs.writeFile(pageWrapperPath, "// modified wrapper");

      // Eject the entire src/ directory (--force to skip interactive prompt)
      runCliSync(["eject", "--force", "src"], sandboxDir);

      // Verify both files were restored
      expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalTailwind);
      expect(await fs.readFile(pageWrapperPath, "utf-8")).toBe(originalPageWrapper);

      await rm(tempDir, { recursive: true, force: true });
    }, 60_000);

    test("ejects _build directory (hidden from --list)", async () => {
      const tempDir = await mkTempDir("eject-build-");
      runCliSync(["create", "sandbox"], tempDir);
      const sandboxDir = path.join(tempDir, "sandbox");

      // Verify _build doesn't exist after create
      const buildDir = path.join(sandboxDir, "_build");
      expect(await fs.exists(buildDir)).toBe(false);

      // Eject _build explicitly
      runCliSync(["eject", "_build"], sandboxDir);

      // Verify _build files were created
      expect(await fs.exists(buildDir)).toBe(true);
      expect(await fs.exists(path.join(buildDir, "entry-client.tsx"))).toBe(true);
      expect(await fs.exists(path.join(buildDir, "entry-server.jsx"))).toBe(true);

      await rm(tempDir, { recursive: true, force: true });
    }, 60_000);
  });

  describe("path normalization", () => {
    test("normalizes paths with leading ./ and trailing /", async () => {
      const tempDir = await mkTempDir("eject-normalize-");
      runCliSync(["create", "sandbox"], tempDir);
      const sandboxDir = path.join(tempDir, "sandbox");

      // Modify a file
      const tailwindPath = path.join(sandboxDir, "src/tailwind.css");
      const originalContent = await fs.readFile(tailwindPath, "utf-8");
      await fs.writeFile(tailwindPath, "/* modified */");

      // Eject with leading ./ (--force to skip interactive prompt)
      runCliSync(["eject", "--force", "./src/tailwind.css"], sandboxDir);
      expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

      // Modify again and eject directory with trailing /
      await fs.writeFile(tailwindPath, "/* modified again */");
      runCliSync(["eject", "--force", "src/"], sandboxDir);
      expect(await fs.readFile(tailwindPath, "utf-8")).toBe(originalContent);

      await rm(tempDir, { recursive: true, force: true });
    }, 60_000);
  });

  describe("--list option", () => {
    test("lists available template files", async () => {
      await withSandboxProject(async (sandboxDir) => {
        const result = runCliCapture(["eject", "--list"], sandboxDir);

        expect(result.status).toBe(0);
        // Should include common template files (shown in tree format)
        expect(result.stdout).toContain("tailwind.css");
        expect(result.stdout).toContain("index.mdx");
        expect(result.stdout).toContain("src/");
        expect(result.stdout).toContain("pages/");
        // Should NOT include _build/ files
        expect(result.stdout).not.toContain("_build/");
      }, "eject-list-");
    }, 60_000);
  });

  describe("error handling", () => {
    test("exits with error when no path provided", async () => {
      await withSandboxProject(async (sandboxDir) => {
        const result = runCliCapture(["eject"], sandboxDir);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Please provide a file or directory path");
      }, "eject-nopath-");
    }, 60_000);

    test("exits with error for non-existent template", async () => {
      await withSandboxProject(async (sandboxDir) => {
        const result = runCliCapture(["eject", "nonexistent.txt"], sandboxDir);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("No template found for: nonexistent.txt");
        expect(result.stdout).toContain("project root");
      }, "eject-notfound-");
    }, 60_000);
  });
});
