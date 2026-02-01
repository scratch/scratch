import { describe, expect, test } from "bun:test";
import { rm, writeFile, readFile } from "fs/promises";
import path from "path";
import { mkTempDir, sleep, scratchPath, getAvailablePort } from "./util";
import { spawn } from "child_process";

describe("scratch watch index files", () => {
  test(
    "watches index.md and serves at root route without conflict",
    async () => {
      const tempDir = await mkTempDir("watch-index-md-");
      const testFile = path.join(tempDir, "index.md");
      // Use a unique marker we can verify in the compiled JS bundle
      await writeFile(testFile, "# Unique Index MD Marker 12345\n\nThis is index.md content");

      const port = await getAvailablePort();
      const watchProc = spawn(scratchPath, [
        "watch",
        testFile,
        "--port",
        String(port),
        "--no-open",
      ], {
        cwd: tempDir,
        stdio: "pipe",
      });

      let output = "";
      watchProc.stdout?.on("data", (data) => {
        output += data.toString();
      });
      watchProc.stderr?.on("data", (data) => {
        output += data.toString();
      });

      let processExited = false;
      let exitCode: number | null = null;
      watchProc.once("exit", (code) => {
        processExited = true;
        exitCode = code;
      });

      const stopWatch = () => {
        try {
          watchProc.kill("SIGINT");
        } catch {}
      };

      try {
        // Wait for server to be ready and serve root without errors
        let serverReady = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          if (processExited) {
            throw new Error(`Watch process exited unexpectedly with code ${exitCode}\nOutput: ${output}`);
          }
          if (output.includes("Dev server running at")) {
            try {
              // index.md should be served at root /
              const res = await fetch(`http://localhost:${port}/`);
              if (res.ok) {
                // Also fetch the JS bundle to verify our content is there
                const html = await res.text();
                const jsMatch = html.match(/src="\/([^"]+\.js)"/);
                if (jsMatch) {
                  const jsRes = await fetch(`http://localhost:${port}/${jsMatch[1]}`);
                  if (jsRes.ok) {
                    const js = await jsRes.text();
                    // Verify our unique marker is in the compiled bundle
                    if (js.includes("Unique Index MD Marker 12345")) {
                      serverReady = true;
                      break;
                    }
                  }
                }
              }
            } catch {
              // Server not ready yet
            }
          }
          await sleep(250);
        }

        // Should not have conflict errors in output
        expect(output).not.toContain("conflict");
        expect(serverReady).toBe(true);
        expect(processExited).toBe(false);

      } finally {
        stopWatch();
        await new Promise((resolve) => watchProc.once("exit", resolve));
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    180_000
  );

  test(
    "watches index.mdx and serves at root route",
    async () => {
      const tempDir = await mkTempDir("watch-index-mdx-");
      const testFile = path.join(tempDir, "index.mdx");
      // Use a unique marker we can verify in the compiled JS bundle
      await writeFile(testFile, "# Unique Index MDX Marker 67890\n\nThis is index.mdx content");

      const port = await getAvailablePort();
      const watchProc = spawn(scratchPath, [
        "watch",
        testFile,
        "--port",
        String(port),
        "--no-open",
      ], {
        cwd: tempDir,
        stdio: "pipe",
      });

      let output = "";
      watchProc.stdout?.on("data", (data) => {
        output += data.toString();
      });
      watchProc.stderr?.on("data", (data) => {
        output += data.toString();
      });

      let processExited = false;
      let exitCode: number | null = null;
      watchProc.once("exit", (code) => {
        processExited = true;
        exitCode = code;
      });

      const stopWatch = () => {
        try {
          watchProc.kill("SIGINT");
        } catch {}
      };

      try {
        // Wait for server to be ready
        let serverReady = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          if (processExited) {
            throw new Error(`Watch process exited unexpectedly with code ${exitCode}\nOutput: ${output}`);
          }
          if (output.includes("Dev server running at")) {
            try {
              // index.mdx should be served at root /
              const res = await fetch(`http://localhost:${port}/`);
              if (res.ok) {
                // Also fetch the JS bundle to verify our content is there
                const html = await res.text();
                const jsMatch = html.match(/src="\/([^"]+\.js)"/);
                if (jsMatch) {
                  const jsRes = await fetch(`http://localhost:${port}/${jsMatch[1]}`);
                  if (jsRes.ok) {
                    const js = await jsRes.text();
                    // Verify our unique marker is in the compiled bundle
                    if (js.includes("Unique Index MDX Marker 67890")) {
                      serverReady = true;
                      break;
                    }
                  }
                }
              }
            } catch {
              // Server not ready yet
            }
          }
          await sleep(250);
        }

        expect(serverReady).toBe(true);
        expect(processExited).toBe(false);

      } finally {
        stopWatch();
        await new Promise((resolve) => watchProc.once("exit", resolve));
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    180_000
  );
});
