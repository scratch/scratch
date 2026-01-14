import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile, readdir } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

const CODE_BLOCK_MDX = `# Code Examples

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
`;

describe("Syntax highlighting", () => {
  test("code blocks are syntax highlighted with Shiki (default: auto)", async () => {
    const tempDir = await mkTempDir("syntax-highlight-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(mdxPath, CODE_BLOCK_MDX);

    // Build without SSG (syntax highlighting is compiled into JS bundle)
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    const distDir = path.join(sandboxDir, "dist");
    const files = await readdir(distDir);
    const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    expect(jsFile).toBeDefined();
    const js = await readFile(path.join(distDir, jsFile!), "utf-8");

    // Verify Shiki syntax highlighting is present
    expect(js).toContain('className: "shiki');
    expect(js).toContain('style:');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("--highlight=auto detects languages from code fences", async () => {
    const tempDir = await mkTempDir("syntax-highlight-auto-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(mdxPath, CODE_BLOCK_MDX);

    runCliSync(["build", "sandbox", "--development", "--no-ssg", "--highlight=auto"], tempDir);

    const distDir = path.join(sandboxDir, "dist");
    const files = await readdir(distDir);
    const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    expect(jsFile).toBeDefined();
    const js = await readFile(path.join(distDir, jsFile!), "utf-8");

    // Verify Shiki highlighting is present
    expect(js).toContain('className: "shiki');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("--highlight=popular loads popular languages", async () => {
    const tempDir = await mkTempDir("syntax-highlight-popular-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(mdxPath, CODE_BLOCK_MDX);

    runCliSync(["build", "sandbox", "--development", "--no-ssg", "--highlight=popular"], tempDir);

    const distDir = path.join(sandboxDir, "dist");
    const files = await readdir(distDir);
    const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    expect(jsFile).toBeDefined();
    const js = await readFile(path.join(distDir, jsFile!), "utf-8");

    // Verify Shiki highlighting is present
    expect(js).toContain('className: "shiki');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("--highlight=all loads all bundled languages", async () => {
    const tempDir = await mkTempDir("syntax-highlight-all-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(mdxPath, CODE_BLOCK_MDX);

    runCliSync(["build", "sandbox", "--development", "--no-ssg", "--highlight=all"], tempDir);

    const distDir = path.join(sandboxDir, "dist");
    const files = await readdir(distDir);
    const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    expect(jsFile).toBeDefined();
    const js = await readFile(path.join(distDir, jsFile!), "utf-8");

    // Verify Shiki highlighting is present
    expect(js).toContain('className: "shiki');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("--highlight=off disables syntax highlighting", async () => {
    const tempDir = await mkTempDir("syntax-highlight-off-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(mdxPath, CODE_BLOCK_MDX);

    runCliSync(["build", "sandbox", "--development", "--no-ssg", "--highlight=off"], tempDir);

    const distDir = path.join(sandboxDir, "dist");
    const files = await readdir(distDir);
    const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
    expect(jsFile).toBeDefined();
    const js = await readFile(path.join(distDir, jsFile!), "utf-8");

    // Verify Shiki highlighting is NOT present when disabled
    expect(js).not.toContain('className: "shiki');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("SSG build with --highlight=auto pre-renders highlighted code", async () => {
    const tempDir = await mkTempDir("syntax-highlight-ssg-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(mdxPath, CODE_BLOCK_MDX);

    // Build WITH SSG (default)
    runCliSync(["build", "sandbox", "--highlight=auto"], tempDir);

    const distDir = path.join(sandboxDir, "dist");
    const htmlPath = path.join(distDir, "index.html");
    const html = await readFile(htmlPath, "utf-8");

    // Verify Shiki highlighting is present in pre-rendered HTML
    expect(html).toContain('class="shiki');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("SSG build with --highlight=off does not include Shiki classes", async () => {
    const tempDir = await mkTempDir("syntax-highlight-ssg-off-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(mdxPath, CODE_BLOCK_MDX);

    // Build WITH SSG but highlighting disabled
    runCliSync(["build", "sandbox", "--highlight=off"], tempDir);

    const distDir = path.join(sandboxDir, "dist");
    const htmlPath = path.join(distDir, "index.html");
    const html = await readFile(htmlPath, "utf-8");

    // Verify Shiki highlighting is NOT present
    expect(html).not.toContain('class="shiki');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
