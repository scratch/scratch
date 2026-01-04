import { describe, expect, test } from "bun:test";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { scratchPath, mkTempDir, sleep, getAvailablePort } from "./util";

describe("Dev command", () => {
  test("scratch dev automatically uses React development mode", async () => {
    // 1. Create a fresh sandbox project
    const tempDir = await mkTempDir("dev-cmd-");
    const sandboxDir = path.join(tempDir, "sandbox");

    // Create project using the CLI
    const createResult = Bun.spawnSync([scratchPath, "create", "sandbox"], {
      cwd: tempDir,
    });
    if (createResult.exitCode !== 0) {
      throw new Error(`Failed to create project: ${createResult.stderr.toString()}`);
    }

    // 2. Add a simple page
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Dev Command Test\n\nHello from dev server!`
    );

    // 3. Start the dev server (with --no-open to prevent browser opening)
    const port = await getAvailablePort();
    const devProcess = spawn(scratchPath, ["dev", ".", "--no-open", "-p", String(port)], {
      cwd: sandboxDir,
      stdio: "pipe",
    });

    // 4. Wait for the build to complete
    // The dev server logs "Dev server running at" when ready
    let serverReady = false;
    let stdoutData = "";
    let stderrData = "";

    const timeout = setTimeout(() => {
      if (!serverReady) {
        devProcess.kill();
        throw new Error("Dev server timed out waiting for ready signal");
      }
    }, 60_000);

    await new Promise<void>((resolve, reject) => {
      devProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        stdoutData += output;
        if (output.includes("Dev server running at")) {
          serverReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });
      devProcess.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderrData += output;
        // Also check stderr since logs might go there
        if (output.includes("Dev server running at")) {
          serverReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });
      devProcess.on("error", reject);
      devProcess.on("close", (code) => {
        if (!serverReady) {
          reject(new Error(`Dev server exited early with code ${code}\nstdout: ${stdoutData}\nstderr: ${stderrData}`));
        }
      });
    });

    // 5. Check the build output for development mode characteristics
    const distDir = path.join(sandboxDir, "dist");
    const distFiles = await readdir(distDir);

    // 5a. Source maps should exist in dev mode
    const mapFiles = distFiles.filter((f) => f.endsWith(".map"));
    expect(mapFiles.length).toBeGreaterThan(0);

    // 5b. JS should be unminified (shorter average line length)
    const jsFiles = distFiles.filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);

    const jsContent = await readFile(path.join(distDir, jsFiles[0]), "utf-8");
    const lines = jsContent.split("\n").filter((l) => l.length > 0);
    const avgLineLength = jsContent.length / lines.length;
    expect(avgLineLength).toBeLessThan(200);

    // 5c. React should be in development mode (no minified error messages)
    // In production mode, React uses "Minified React error" messages
    // In development mode, full error messages are included
    const hasMinifiedErrors = jsContent.includes("Minified React error");
    expect(hasMinifiedErrors).toBe(false);

    // 6. Clean up - kill the dev server
    devProcess.kill();
    await sleep(100);

    // 7. Cleanup temp directory
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
