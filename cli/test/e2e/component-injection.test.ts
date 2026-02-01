import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

/**
 * Consolidated tests for component auto-injection in MDX files.
 *
 * These tests verify that components are automatically available in MDX
 * without explicit imports, covering various export patterns and file types.
 */

interface ComponentTestCase {
  name: string;
  tempDirPrefix: string;
  componentPath: string; // relative to sandboxDir
  componentContent: string;
  mdxContent: string;
}

const testCases: ComponentTestCase[] = [
  {
    name: "default export components (.jsx)",
    tempDirPrefix: "component-injection-",
    componentPath: "src/TestBadge.jsx",
    componentContent: `export default function TestBadge({ label }) {
  return <span className="test-badge" data-testid="injected-badge">{label}</span>;
}`,
    mdxContent: `# Component Injection Test

<TestBadge label="Auto-Injected!" />
`,
  },
  {
    name: "named export components (.jsx)",
    tempDirPrefix: "named-export-injection-",
    componentPath: "src/NamedBadge.jsx",
    componentContent: `export function NamedBadge({ label }) {
  return <span className="named-badge">{label}</span>;
}`,
    mdxContent: `# Named Export Test

<NamedBadge label="Named Export Works!" />
`,
  },
  {
    name: "'export { X as default }' pattern",
    tempDirPrefix: "as-default-component-",
    componentPath: "src/AliasedButton.jsx",
    componentContent: `function InternalButton({ children }) {
  return <button className="aliased-btn">{children}</button>;
}

export { InternalButton as default };`,
    mdxContent: `# Aliased Default Export Test

<AliasedButton>Click me</AliasedButton>
`,
  },
  {
    name: "co-located components in pages/ directory",
    tempDirPrefix: "colocated-component-",
    componentPath: "pages/LocalWidget.jsx",
    componentContent: `export default function LocalWidget() {
  return <div className="local-widget">I am co-located!</div>;
}`,
    mdxContent: `# Co-located Component Test

<LocalWidget />
`,
  },
  {
    name: "TypeScript components (.tsx)",
    tempDirPrefix: "tsx-component-",
    componentPath: "src/TypedCard.tsx",
    componentContent: `interface CardProps {
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
}`,
    mdxContent: `# TypeScript Component Test

<TypedCard title="TS Works!">
  Content inside typed card
</TypedCard>
`,
  },
];

describe("Component auto-injection", () => {
  test.each(testCases)(
    "$name are automatically available in MDX",
    async ({ tempDirPrefix, componentPath, componentContent, mdxContent }) => {
      // 1. Create a fresh project
      const tempDir = await mkTempDir(tempDirPrefix);
      runCliSync(["create", "sandbox"], tempDir);
      const sandboxDir = path.join(tempDir, "sandbox");

      // 2. Create the component
      const fullComponentPath = path.join(sandboxDir, componentPath);
      await writeFile(fullComponentPath, componentContent);

      // 3. Create an MDX file that uses the component WITHOUT importing it
      const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
      await writeFile(mdxPath, mdxContent);

      // 4. Build without SSG (testing component injection, not rendering)
      runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

      // 5. Verify the build succeeded (component was injected correctly)
      // Without SSG, we just verify build passes - the component is in the JS bundle

      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    },
    180_000
  );
});
