import { describe, expect, test } from "bun:test";
import { rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { mkTempDir, scratchPath } from "./util";

describe("Component conflict detection", () => {
  test("build fails when MDX uses a component with conflicting filenames", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("component-conflict-");

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

    // 3. Create an MDX file that uses Button WITHOUT an explicit import
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Button Test

<Button>Click me</Button>
`
    );

    // 4. Build should fail due to ambiguous component (--no-ssg for speed)
    const result = spawnSync(scratchPath, ["build", "sandbox", "--no-ssg"], {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    // 5. Verify build failed
    expect(result.status).not.toBe(0);

    // 6. Verify error message mentions the ambiguous component
    const output = result.stderr + result.stdout;
    expect(output).toContain("Ambiguous component import");
    expect(output).toContain("Button");

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
