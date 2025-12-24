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

    // 3. Build without SSG (syntax highlighting is compiled into JS bundle)
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    // 4. Read the generated JS bundle to verify Shiki syntax highlighting was applied
    const distDir = path.join(sandboxDir, "dist");
    const { readdir } = await import("fs/promises");
    const files = await readdir(distDir);
    const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    expect(jsFile).toBeDefined();
    const js = await readFile(path.join(distDir, jsFile!), "utf-8");

    // 5. Verify Shiki syntax highlighting is present in the JS bundle
    // In JSX, it uses className="shiki" not class="shiki"
    expect(js).toContain('className: "shiki');

    // Verify syntax highlighting styles are present (Shiki uses inline styles)
    expect(js).toContain('style:');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
