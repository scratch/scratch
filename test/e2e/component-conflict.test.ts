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
    spawnSync(scratchPath, ["init", "sandbox", "--full"], {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create two components with the same name in different directories
    await mkdir(path.join(sandboxDir, "components", "ui"), { recursive: true });
    await mkdir(path.join(sandboxDir, "components", "forms"), { recursive: true });

    await writeFile(
      path.join(sandboxDir, "components", "ui", "Button.jsx"),
      `export default function Button({ children }) {
  return <button className="ui-button">{children}</button>;
}`
    );

    await writeFile(
      path.join(sandboxDir, "components", "forms", "Button.jsx"),
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

    // 4. Build should fail due to ambiguous component
    const result = spawnSync(scratchPath, ["build", "sandbox"], {
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

  test("build succeeds when MDX explicitly imports one of the conflicting components", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("component-conflict-explicit-");

    // Run create
    spawnSync(scratchPath, ["init", "sandbox", "--full"], {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
    });

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create two components with the same name in different directories
    await mkdir(path.join(sandboxDir, "components", "ui"), { recursive: true });
    await mkdir(path.join(sandboxDir, "components", "forms"), { recursive: true });

    await writeFile(
      path.join(sandboxDir, "components", "ui", "Button.jsx"),
      `export default function Button({ children }) {
  return <button className="ui-button">{children}</button>;
}`
    );

    await writeFile(
      path.join(sandboxDir, "components", "forms", "Button.jsx"),
      `export default function Button({ children }) {
  return <button className="forms-button">{children}</button>;
}`
    );

    // 3. Create an MDX file that EXPLICITLY imports one of the Buttons
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `import Button from '../components/ui/Button.jsx';

# Button Test

<Button>Click me</Button>
`
    );

    // 4. Build should succeed because we explicitly imported
    const result = spawnSync(scratchPath, ["build", "sandbox", "--ssg", "--development"], {
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
