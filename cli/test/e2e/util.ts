import path from "path";
import { spawnSync } from "child_process";

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