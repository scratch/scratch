import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { detectLanguagesFromFiles, POPULAR_LANGUAGES } from '../../src/build/plugins';
import { mkTempDir } from '../test-util';
import fs from 'fs/promises';
import path from 'path';

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkTempDir('test-buncfg-');
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('POPULAR_LANGUAGES', () => {
  test('contains expected common languages', () => {
    expect(POPULAR_LANGUAGES).toContain('javascript');
    expect(POPULAR_LANGUAGES).toContain('typescript');
    expect(POPULAR_LANGUAGES).toContain('python');
    expect(POPULAR_LANGUAGES).toContain('rust');
    expect(POPULAR_LANGUAGES).toContain('go');
    expect(POPULAR_LANGUAGES).toContain('bash');
  });

  test('has 24 languages', () => {
    expect(POPULAR_LANGUAGES.length).toBe(24);
  });

  test('all languages are lowercase', () => {
    for (const lang of POPULAR_LANGUAGES) {
      expect(lang).toBe(lang.toLowerCase());
    }
  });
});

describe('detectLanguagesFromFiles', () => {
  test('detects languages from code fences in files', async () => {
    const testDir = path.join(tempDir, 'detect-test-1');
    await fs.mkdir(testDir, { recursive: true });

    const filePath = path.join(testDir, 'index.mdx');
    await fs.writeFile(
      filePath,
      `# Test

\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`python
print("hello")
\`\`\`

\`\`\`rust
fn main() {}
\`\`\`
`
    );

    const langs = await detectLanguagesFromFiles([filePath]);

    expect(langs).toContain('javascript');
    expect(langs).toContain('python');
    expect(langs).toContain('rust');
    expect(langs.length).toBe(3);
  });

  test('detects languages from .md files', async () => {
    const testDir = path.join(tempDir, 'detect-test-2');
    await fs.mkdir(testDir, { recursive: true });

    const filePath = path.join(testDir, 'doc.md');
    await fs.writeFile(
      filePath,
      `# Markdown Doc

\`\`\`go
package main
\`\`\`
`
    );

    const langs = await detectLanguagesFromFiles([filePath]);
    expect(langs).toContain('go');
  });

  test('ignores invalid language identifiers', async () => {
    const testDir = path.join(tempDir, 'detect-test-3');
    await fs.mkdir(testDir, { recursive: true });

    const filePath = path.join(testDir, 'index.mdx');
    await fs.writeFile(
      filePath,
      `# Test

\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`notareallanguage
some code
\`\`\`

\`\`\`invalidlang123
more code
\`\`\`
`
    );

    const langs = await detectLanguagesFromFiles([filePath]);
    expect(langs).toContain('javascript');
    expect(langs).not.toContain('notareallanguage');
    expect(langs).not.toContain('invalidlang123');
    expect(langs.length).toBe(1);
  });

  test('deduplicates languages across multiple files', async () => {
    const testDir = path.join(tempDir, 'detect-test-4');
    await fs.mkdir(testDir, { recursive: true });

    const file1 = path.join(testDir, 'page1.mdx');
    const file2 = path.join(testDir, 'page2.mdx');

    await fs.writeFile(
      file1,
      `\`\`\`javascript
const x = 1;
\`\`\`
`
    );

    await fs.writeFile(
      file2,
      `\`\`\`javascript
const y = 2;
\`\`\`
`
    );

    const langs = await detectLanguagesFromFiles([file1, file2]);
    expect(langs).toContain('javascript');
    expect(langs.length).toBe(1);
  });

  test('returns empty array when no code fences found', async () => {
    const testDir = path.join(tempDir, 'detect-test-5');
    await fs.mkdir(testDir, { recursive: true });

    const filePath = path.join(testDir, 'index.mdx');
    await fs.writeFile(
      filePath,
      `# Just text

No code blocks here.
`
    );

    const langs = await detectLanguagesFromFiles([filePath]);
    expect(langs.length).toBe(0);
  });

  test('returns empty array when given empty file list', async () => {
    const langs = await detectLanguagesFromFiles([]);
    expect(langs.length).toBe(0);
  });

  test('normalizes language identifiers to lowercase', async () => {
    const testDir = path.join(tempDir, 'detect-test-6');
    await fs.mkdir(testDir, { recursive: true });

    const filePath = path.join(testDir, 'index.mdx');
    await fs.writeFile(
      filePath,
      `\`\`\`JavaScript
const x = 1;
\`\`\`

\`\`\`PYTHON
print("hello")
\`\`\`
`
    );

    const langs = await detectLanguagesFromFiles([filePath]);
    expect(langs).toContain('javascript');
    expect(langs).toContain('python');
    expect(langs).not.toContain('JavaScript');
    expect(langs).not.toContain('PYTHON');
  });
});
