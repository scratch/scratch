import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { mkTempDir, sleep, scratchPath, getAvailablePort } from "./util";
import { spawn } from "child_process";

describe("scratch view", () => {
  test(
    "continues running when viewed file is deleted and recreated",
    async () => {
      // 1. Create a temp directory with a markdown file
      const tempDir = await mkTempDir("view-recreate-");
      const testFile = path.join(tempDir, "test.md");
      await writeFile(testFile, "# Original Content\n\nHello world");

      // 2. Start the view command
      const port = await getAvailablePort();
      const viewProc = spawn(scratchPath, [
        "view",
        testFile,
        "--port",
        String(port),
        "--no-open",
      ], {
        cwd: tempDir,
        stdio: "pipe",
      });

      // Collect stdout/stderr for debugging
      let output = "";
      viewProc.stdout?.on("data", (data) => {
        output += data.toString();
      });
      viewProc.stderr?.on("data", (data) => {
        output += data.toString();
      });

      // Track if process exits
      let processExited = false;
      let exitCode: number | null = null;
      viewProc.once("exit", (code) => {
        processExited = true;
        exitCode = code;
      });

      const stopView = () => {
        try {
          viewProc.kill("SIGINT");
        } catch {}
      };

      try {
        // 3. Wait for the dev server to become available (look for server running message)
        let serverReady = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          if (processExited) {
            throw new Error(`View process exited unexpectedly with code ${exitCode}\nOutput: ${output}`);
          }
          if (output.includes("Dev server running at")) {
            // Server is running, now wait for the page to be available
            try {
              const res = await fetch(`http://localhost:${port}/test`);
              if (res.ok) {
                serverReady = true;
                break;
              }
            } catch {
              // Server not ready yet
            }
          }
          await sleep(250);
        }

        if (!serverReady) {
          throw new Error(`Server did not become ready\nOutput: ${output}`);
        }

        // 4. Delete the source file
        await rm(testFile);

        // Wait for the watcher to react and log the deletion message
        for (let attempt = 0; attempt < 20; attempt++) {
          if (output.includes("waiting for it to be recreated")) {
            break;
          }
          await sleep(250);
        }

        // 5. Verify the server is still running (not exited)
        expect(processExited).toBe(false);

        // Check that the log message indicates waiting for recreation
        expect(output).toContain("waiting for it to be recreated");

        // 6. Recreate the file with new content
        await writeFile(testFile, "# New Content\n\nRecreated file");

        // Wait for the watcher to react and sync the file
        for (let attempt = 0; attempt < 40; attempt++) {
          if (output.includes("recreated, synced")) {
            break;
          }
          await sleep(250);
        }

        // 7. Verify the server picked up the recreated file
        expect(output).toContain("recreated, synced");
        expect(processExited).toBe(false);

        // Wait for the dev server to rebuild (it needs to detect the change and rebuild)
        // The synced file triggers a rebuild in the temp project
        for (let attempt = 0; attempt < 40; attempt++) {
          if (output.includes("File change detected, rebuilding")) {
            // Wait a bit more for the rebuild to complete
            await sleep(1000);
            break;
          }
          await sleep(250);
        }

        // Verify the page is still accessible
        let pageAccessible = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const res = await fetch(`http://localhost:${port}/test`);
            if (res.ok) {
              pageAccessible = true;
              break;
            }
          } catch {
            // Server might be rebuilding
          }
          await sleep(250);
        }
        expect(pageAccessible).toBe(true);

      } finally {
        stopView();
        await new Promise((resolve) => viewProc.once("exit", resolve));
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    180_000
  );
});
