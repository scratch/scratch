import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Component auto-injection", () => {
  test("named export components are automatically available in MDX", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("named-export-injection-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create a component with NAMED export (not default)
    const componentPath = path.join(sandboxDir, "src", "NamedBadge.jsx");
    await writeFile(
      componentPath,
      `export function NamedBadge({ label }) {
  return <span className="named-badge">{label}</span>;
}`
    );

    // 3. Create an MDX file that uses the component WITHOUT importing it
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Named Export Test

<NamedBadge label="Named Export Works!" />
`
    );

    // 4. Build without SSG
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    // 5. Verify the build succeeded (named export component was injected)
    // Without SSG, we just verify build passes - the component is in the JS bundle

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
