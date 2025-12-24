import { describe, expect, test } from "bun:test";
import { rm, readdir } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("fresh install", () => {
  test(
    "builds successfully after create in current directory without pre-existing node_modules",
    async () => {
      // Create a fresh temp directory with no node_modules
      const projectDir = await mkTempDir("fresh-install-");

      // Run scratch create in current directory (using ".")
      // This pattern triggers the Bun runtime bug where Bun.build() fails
      // after spawning a child bun process (bun install) in the same execution
      runCliSync(["create", "."], projectDir);

      // Verify node_modules doesn't exist yet (dependencies not installed)
      const filesBefore = await readdir(projectDir);
      expect(filesBefore).not.toContain("node_modules");

      // Run scratch build with SSG (default) - this should:
      // 1. Install dependencies (spawns bun install)
      // 2. Restart build in subprocess (workaround for Bun runtime bug)
      // 3. Complete the build successfully including server-side rendering
      runCliSync(["build", "."], projectDir);

      // Verify build output exists
      const distDir = path.join(projectDir, "dist");
      const distFiles = await readdir(distDir);

      expect(distFiles).toContain("index.html");
      expect(distFiles.some((f) => f.startsWith("tailwind-") && f.endsWith(".css"))).toBe(true);

      // Verify node_modules was created during build
      const filesAfter = await readdir(projectDir);
      expect(filesAfter).toContain("node_modules");

      // Clean up
      await rm(projectDir, { recursive: true, force: true });
    },
    // Allow time for dependency installation and build
    180_000
  );
});
