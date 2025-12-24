import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Syntax highlighting", () => {
  test("code blocks are syntax highlighted with Shiki", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("syntax-highlight-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with code blocks in several languages
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Code Examples

## JavaScript

\`\`\`javascript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

## TypeScript

\`\`\`typescript
interface User {
  name: string;
  age: number;
}

const user: User = { name: "Alice", age: 30 };
\`\`\`

## Python

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))
\`\`\`

## Rust

\`\`\`rust
fn main() {
    let message = "Hello, World!";
    println!("{}", message);
}
\`\`\`

## Go

\`\`\`go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
\`\`\`
`
    );

    // 3. Build with SSG (enabled by default)
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify Shiki syntax highlighting is present
    // Shiki wraps code in <pre> with class="shiki" and uses <span style="..."> for tokens
    expect(html).toContain('class="shiki');

    // Check that multiple code blocks are highlighted (one per language)
    const shikiBlocks = html.match(/class="shiki/g);
    expect(shikiBlocks?.length).toBeGreaterThanOrEqual(5);

    // Verify syntax highlighting spans are present (Shiki uses inline styles)
    expect(html).toContain('<span style="');

    // Check for language-specific tokens that should be highlighted
    // JavaScript/TypeScript: const keyword
    expect(html).toMatch(/<span[^>]*>const<\/span>/);

    // Python: def keyword
    expect(html).toMatch(/<span[^>]*>def<\/span>/);

    // Rust: fn keyword
    expect(html).toMatch(/<span[^>]*>fn<\/span>/);

    // Go: func keyword
    expect(html).toMatch(/<span[^>]*>func<\/span>/);

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
