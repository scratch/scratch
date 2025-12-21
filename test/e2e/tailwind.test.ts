import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";


describe("Tailwind integration", () => {
  test("build succeeds and rendered HTML contains Tailwind class", async () => {
    // 1. Create a fresh sandbox project inside a temporary directory.
    const tempDir = await mkTempDir("tailwind-");
    runCliSync(["init", "sandbox", "--full"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Replace the default index.mdx with one that uses a Tailwind class.
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Tailwind Test\n\n<div className=\"text-red-500\">Hello Tailwind</div>`
    );

    // 3. Build the project with SSG so that the component gets pre–rendered
    //    into the HTML output. This allows us to assert on the markup.
    runCliSync(["build", "sandbox", "--ssg", "--development"], tempDir);

    // 4. Read the generated HTML and assert it contains the expected class.
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");
    expect(html).toMatch(/text-red-500/);

    // Cleanup temporary files.
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
