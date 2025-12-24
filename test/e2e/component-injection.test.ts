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

    // 4. Build (SSG is enabled by default) to render the component
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 5. Verify the component rendered in the output HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");
    expect(html).toContain("test-badge");
    expect(html).toContain("Auto-Injected!");

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

    // 4. Build should succeed and use named import syntax
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 5. Verify the component rendered in the output HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");
    expect(html).toContain("named-badge");
    expect(html).toContain("Named Export Works!");

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

    // 4. Build
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 5. Verify the component rendered
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");
    expect(html).toContain("local-widget");
    expect(html).toContain("I am co-located!");

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

    // 4. Build - should detect "as default" as default export
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 5. Verify the component rendered
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");
    expect(html).toContain("aliased-btn");
    expect(html).toContain("Click me");

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

    // 4. Build
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 5. Verify the component rendered
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");
    expect(html).toContain("typed-card");
    expect(html).toContain("TS Works!");
    expect(html).toContain("Content inside typed card");

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
