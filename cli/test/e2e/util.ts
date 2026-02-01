import path from "path";
import { spawnSync } from "child_process";
import { rm } from "fs/promises";
import { mkTempDir } from "../test-util";

// Re-export shared test utility
export { mkTempDir } from "../test-util";

// Path to the compiled scratch executable
export const scratchPath = path.resolve(import.meta.dir, "../../dist/scratch");

/**
 * Helper: sleep for the specified milliseconds.
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper that executes the CLI synchronously and throws if it exits with a
 * non–zero status code.
 */
export function runCliSync(args: string[], cwd: string) {
  const result = spawnSync(scratchPath, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    const output = (result.stdout || "") + (result.stderr || "");
    throw new Error(`scratch CLI ${args.join(" ")} exited with code ${result.status}\n${output}`);
  }
}

/**
 * Helper that finds an available port by binding to port 0 and getting
 * the assigned port from the OS. Useful for parallel test execution.
 */
export async function getAvailablePort(): Promise<number> {
  const net = await import("net");
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Helper that executes the CLI synchronously and returns stdout/stderr
 * without throwing on non-zero exit. Useful for testing error cases.
 */
export function runCliCapture(args: string[], cwd: string) {
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

/**
 * Helper that creates a sandbox project in a temporary directory,
 * runs the test function, and cleans up afterwards.
 *
 * This encapsulates the common pattern:
 * 1. Create temp directory
 * 2. Run 'scratch create sandbox'
 * 3. Execute test with sandboxDir and tempDir
 * 4. Clean up temp directory
 *
 * @param testFn - The test function to run with (sandboxDir, tempDir) args
 * @param prefix - Optional prefix for the temp directory name
 */
export async function withSandboxProject(
  testFn: (sandboxDir: string, tempDir: string) => Promise<void>,
  prefix: string = "test-"
): Promise<void> {
  const tempDir = await mkTempDir(prefix);
  try {
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");
    await testFn(sandboxDir, tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}