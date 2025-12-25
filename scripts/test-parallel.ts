import { spawn } from "child_process";
import { cpus } from "os";
import { glob } from "fast-glob";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    concurrency: { type: "string", short: "j" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (values.help) {
  console.log(`Usage: bun scripts/test-parallel.ts [options]

Options:
  -j, --concurrency <n>  Max number of concurrent test processes (default: CPU count)
  -h, --help             Show this help message`);
  process.exit(0);
}

const maxConcurrency = parseInt(
  values.concurrency || process.env.TEST_CONCURRENCY || String(cpus().length)
);

async function main() {
  const testFiles = await glob("test/e2e/*.test.ts");
  console.log(
    `Running ${testFiles.length} test files with ${maxConcurrency} concurrent processes\n`
  );

  const results: { file: string; passed: boolean; duration: number }[] = [];
  const queue = [...testFiles];
  const running: Promise<void>[] = [];

  async function runTest(file: string) {
    const start = Date.now();
    return new Promise<void>((resolve) => {
      const proc = spawn("bun", ["test", file], { stdio: "inherit" });
      proc.on("close", (code) => {
        results.push({
          file,
          passed: code === 0,
          duration: Date.now() - start,
        });
        resolve();
      });
    });
  }

  // Process queue with concurrency limit
  while (queue.length > 0 || running.length > 0) {
    while (running.length < maxConcurrency && queue.length > 0) {
      const file = queue.shift()!;
      const promise = runTest(file).then(() => {
        running.splice(running.indexOf(promise), 1);
      });
      running.push(promise);
    }
    if (running.length > 0) await Promise.race(running);
  }

  // Report results
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(
    `\n${passed} passed, ${failed} failed (${(totalTime / 1000).toFixed(1)}s total)`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main();
