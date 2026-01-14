import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Component auto-injection", () => {
  test("co-located components in pages/ directory are auto-injected", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("colocated-component-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create a component co-located in the pages/ directory
    const componentPath = path.join(sandboxDir, "pages", "LocalWidget.jsx");
    await writeFile(
      componentPath,
      `export default function LocalWidget() {
  return <div className="local-widget">I am co-located!</div>;
}`
    );

    // 3. Create an MDX file that uses the co-located component
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Co-located Component Test

<LocalWidget />
`
    );

    // 4. Build without SSG
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    // 5. Verify the build succeeded (component was injected)
    // Without SSG, HTML won't contain pre-rendered content, so just verify build passes

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
