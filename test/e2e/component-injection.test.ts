import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Component auto-injection", () => {
  test("components are automatically available in MDX without explicit imports", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("component-injection-");
    runCliSync(["init", "sandbox", "--full"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create a custom component
    const componentPath = path.join(sandboxDir, "components", "TestBadge.jsx");
    await writeFile(
      componentPath,
      `export default function TestBadge({ label }) {
  return <span className="test-badge" data-testid="injected-badge">{label}</span>;
}`
    );

    // 3. Create an MDX file that uses the component WITHOUT importing it
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Component Injection Test

<TestBadge label="Auto-Injected!" />
`
    );

    // 4. Build with SSG to render the component
    runCliSync(["build", "sandbox", "--ssg", "--development"], tempDir);

    // 5. Verify the component rendered in the output HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");
    expect(html).toContain("test-badge");
    expect(html).toContain("Auto-Injected!");

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
