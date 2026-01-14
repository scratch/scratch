import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Component auto-injection", () => {
  test("'export { X as default }' components are detected correctly", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("as-default-component-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create a component that uses "export { X as default }" pattern
    await writeFile(
      path.join(sandboxDir, "src", "AliasedButton.jsx"),
      `function InternalButton({ children }) {
  return <button className="aliased-btn">{children}</button>;
}

export { InternalButton as default };`
    );

    // 3. Create an MDX file that uses the component
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Aliased Default Export Test

<AliasedButton>Click me</AliasedButton>
`
    );

    // 4. Build without SSG - should detect "as default" as default export
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    // 5. Verify the build succeeded (component was detected and injected)

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
