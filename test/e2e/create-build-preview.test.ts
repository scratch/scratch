import { describe, expect, test } from "bun:test";
import { readFile, rm } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir, sleep, scratchPath } from "./util";
import { spawn } from "child_process";



describe("scratch create → build → preview", () => {
  // Allow plenty of time for Vite to compile on the first run.
  test(
    "serves the built index page via the preview server",
    async () => {

      // 1. Create a fresh sandbox project inside a temporary directory.
      //    Using the repository directory avoids permission issues that can
      //    arise in some restricted CI environments when writing to the OS
      //    tmp directory.
      const tempDir = await mkTempDir("e2e-");
      runCliSync(["init", "sandbox", "--full"], tempDir);

      const sandboxDir = path.join(tempDir, "sandbox");

      // 2. Build the project. We intentionally avoid the `--ssg` flag here
      //    because the Vite stub used during testing does not implement the
      //    server-side rendering pipeline that the real build command relies
      //    on when SSG is enabled.
      runCliSync(["build", "sandbox"], tempDir);

      // 3. Start the preview server on an unusual port to avoid clashes.
      const port = 51234;
      const previewProc = spawn(scratchPath, [
        "preview",
        "sandbox",
        "--port",
        String(port),
        "--no-open",
      ], {
        cwd: tempDir,
        stdio: "pipe",
      });

      // Ensure we clean up the preview server even if the test fails.
      const stopPreview = () => {
        try {
          previewProc.kill("SIGINT");
        } catch {}
      };

      // Wait for the server to become available.
      let html = "";
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          const res = await fetch(`http://localhost:${port}/`);
          if (res.ok) {
            html = await res.text();
            break;
          }
        } catch {
          // Server not ready yet.
        }
        await sleep(250);
      }

      // Grab the on-disk build output so we can compare.
      const expected = await readFile(
        path.join(sandboxDir, "dist", "index.html"),
        "utf-8"
      );

      // Perform the assertion before shutting down the server to capture logs
      // in case of a failure.
      expect(html.trim()).toBe(expected.trim());

      // Shut down the preview server and clean up.
      stopPreview();
      await new Promise((resolve) => previewProc.once("exit", resolve));

      // Remove temporary files so as not to clutter the file-system.
      await rm(tempDir, { recursive: true, force: true });
    },
    // Generous timeout – initial Vite build can take a while in CI.
    180_000
  );
});
