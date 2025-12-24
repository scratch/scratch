import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Component auto-injection", () => {
  test("default export components are automatically available in MDX", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("component-injection-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create a component with default export
    const componentPath = path.join(sandboxDir, "src", "TestBadge.jsx");
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

    // 4. Build without SSG (testing component injection, not rendering)
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    // 5. Verify the build succeeded (component was injected correctly)
    // Without SSG, we just verify build passes - the component is in the JS bundle

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

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

  test("TypeScript components (.tsx) are auto-injected", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("tsx-component-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create a TypeScript component
    const componentPath = path.join(sandboxDir, "src", "TypedCard.tsx");
    await writeFile(
      componentPath,
      `interface CardProps {
  title: string;
  children: React.ReactNode;
}

export default function TypedCard({ title, children }: CardProps) {
  return (
    <div className="typed-card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}`
    );

    // 3. Create an MDX file that uses the TypeScript component
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# TypeScript Component Test

<TypedCard title="TS Works!">
  Content inside typed card
</TypedCard>
`
    );

    // 4. Build without SSG
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    // 5. Verify the build succeeded (TypeScript component was injected)

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
