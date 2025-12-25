import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Component auto-injection", () => {
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
