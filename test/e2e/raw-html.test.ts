import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Raw HTML in MDX", () => {
  test("preserves raw HTML elements in MDX output", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("raw-html-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with various raw HTML elements
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Raw HTML Test

Some markdown text.

<div class="custom-container">
  <p>This is a paragraph inside a raw HTML div.</p>
  <span data-testid="custom-span">Custom span element</span>
</div>

<details>
  <summary>Click to expand</summary>
  <p>Hidden content revealed!</p>
</details>

<figure>
  <figcaption>A figure caption</figcaption>
</figure>

<aside class="note">
  This is an aside note.
</aside>

More markdown after HTML.
`
    );

    // 3. Build with SSG to get pre-rendered HTML
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify raw HTML elements are preserved
    expect(html).toContain('class="custom-container"');
    expect(html).toContain('data-testid="custom-span"');
    expect(html).toContain("Custom span element");
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>");
    expect(html).toContain("Click to expand");
    expect(html).toContain("<figure>");
    expect(html).toContain("<figcaption>");
    expect(html).toContain("A figure caption");
    expect(html).toContain("<aside");
    expect(html).toContain('class="note"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("preserves inline HTML within markdown paragraphs", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("raw-html-inline-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with inline HTML
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Inline HTML Test

This paragraph has <mark>highlighted text</mark> and <abbr title="HyperText Markup Language">HTML</abbr> abbreviations.

Here is some <kbd>Ctrl</kbd>+<kbd>C</kbd> keyboard input.

And some <sub>subscript</sub> and <sup>superscript</sup> text.
`
    );

    // 3. Build with SSG
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify inline HTML elements are preserved
    expect(html).toContain("<mark>");
    expect(html).toContain("highlighted text");
    expect(html).toContain("<abbr");
    expect(html).toContain('title="HyperText Markup Language"');
    expect(html).toContain("<kbd>");
    expect(html).toContain("<sub>");
    expect(html).toContain("<sup>");

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("preserves HTML tables with attributes", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("raw-html-table-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with an HTML table
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# HTML Table Test

<table class="data-table" border="1">
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Value</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td data-label="Name">Item 1</td>
      <td data-label="Value">100</td>
    </tr>
  </tbody>
</table>
`
    );

    // 3. Build with SSG
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify table structure and attributes are preserved
    expect(html).toContain('class="data-table"');
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain('scope="col"');
    expect(html).toContain('data-label="Name"');
    expect(html).toContain('data-label="Value"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
