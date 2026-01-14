import { describe, expect, test } from "bun:test";
import { rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { mkTempDir, scratchPath } from "./util";

describe("Component conflict detection", () => {
  test("build succeeds when MDX explicitly imports one of the conflicting src", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("component-conflict-explicit-");

    // Run create
    spawnSync(scratchPath, ["create", "sandbox"], {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create two src with the same name in different directories
    await mkdir(path.join(sandboxDir, "src", "ui"), { recursive: true });
    await mkdir(path.join(sandboxDir, "src", "forms"), { recursive: true });

    await writeFile(
      path.join(sandboxDir, "src", "ui", "Button.jsx"),
      `export default function Button({ children }) {
  return <button className="ui-button">{children}</button>;
}`
    );

    await writeFile(
      path.join(sandboxDir, "src", "forms", "Button.jsx"),
      `export default function Button({ children }) {
  return <button className="forms-button">{children}</button>;
}`
    );

    // 3. Create an MDX file that EXPLICITLY imports one of the Buttons
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `import Button from '../src/ui/Button.jsx';

# Button Test

<Button>Click me</Button>
`
    );

    // 4. Build should succeed because we explicitly imported (--no-ssg for speed)
    const result = spawnSync(scratchPath, ["build", "sandbox", "--development", "--no-ssg"], {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    // 5. Verify build succeeded
    expect(result.status).toBe(0);

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
