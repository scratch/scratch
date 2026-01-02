import { beforeAll, describe, expect, test } from 'bun:test';
import { BuildContext, Entry } from '../../src/build/context';
import { mkTempDir } from '../test-util';
import path from 'path';
import { materializeProjectTemplates } from '../../src/template';
import fs from 'fs/promises';

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkTempDir('test-context-');
});

describe('BuildContext.constructor', () => {
  test('constructs build context with correct root directory', async () => {
    const projectDir = path.join(tempDir, 'project');
    await materializeProjectTemplates(projectDir);

    // sleep for 1 second to ensure the files are created
    await new Promise((resolve) => setTimeout(resolve, 100));

    const context = new BuildContext({ path: projectDir });
    expect(context.rootDir).toBe(projectDir);

    // entries are not populated in constructor, need to call getEntries
    const entries = await context.getEntries();
    expect(entries).toHaveProperty('index');
  });
});

describe('Entry.constructor', () => {
  test('constructs entry with correct name, relative path, and base directory', () => {
    const entry = new Entry(
      '/project/pages/articles/post1.mdx',
      '/project/pages'
    );
    expect(entry.name).toBe('articles/post1');
    expect(entry.absPath).toBe('/project/pages/articles/post1.mdx');
    expect(entry.relPath).toBe('articles/post1.mdx');
    expect(entry.baseDir).toBe('/project/pages');
    expect(entry.frontmatterData).toBeUndefined();
  });

  test('Behaves correctly when constructed with relative paths', () => {
    const entry = new Entry('pages/articles/post1.mdx', 'pages');
    expect(entry.name).toBe('articles/post1');
    expect(entry.absPath).toBe(path.resolve('pages/articles/post1.mdx'));
    expect(entry.relPath).toBe('articles/post1.mdx');
    expect(entry.baseDir).toBe(path.resolve('pages'));
    expect(entry.frontmatterData).toBeUndefined();
  });

  test('Behaves when source file is not in the base directory', () => {
    const entry = new Entry('/project/post1.mdx', '/project/pages');
    expect(entry.name).toBe('../post1');
    expect(entry.absPath).toBe('/project/post1.mdx');
    expect(entry.relPath).toBe('../post1.mdx');
    expect(entry.baseDir).toBe('/project/pages');
    expect(entry.frontmatterData).toBeUndefined();
  });
});

describe('Entry.getArtifactPath', () => {
  test('returns the correct artifact path', () => {
    const entry = new Entry(
      '/project/pages/articles/post1.mdx',
      '/project/pages'
    );
    expect(entry.getArtifactPath('.html', '/project/build')).toBe(
      '/project/build/articles/post1/index.html'
    );
    expect(entry.getArtifactPath('.js', '/project/build')).toBe(
      '/project/build/articles/post1/index.js'
    );
  });

  test('returns the correct artifact path when the entry name is index', () => {
    const entry = new Entry(
      '/project/pages/articles/index.mdx',
      '/project/pages'
    );
    expect(entry.getArtifactPath('.html', '/project/build')).toBe(
      '/project/build/articles/index.html'
    );
    expect(entry.getArtifactPath('.js', '/project/build')).toBe(
      '/project/build/articles/index.js'
    );
  });
});

describe('BuildContext reset methods', () => {
  test('resetBuildDir removes and recreates build directory', async () => {
    const projectDir = path.join(tempDir, 'reset-build-test');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    // Create a file in build dir
    await fs.mkdir(context.buildDir, { recursive: true });
    await fs.writeFile(path.join(context.buildDir, 'test.txt'), 'test content');

    await context.resetBuildDir();

    expect(await fs.exists(context.buildDir)).toBe(true);
    expect(await fs.exists(path.join(context.buildDir, 'test.txt'))).toBe(false);
  });

  test('resetTempDir removes and recreates temp directory', async () => {
    const projectDir = path.join(tempDir, 'reset-temp-test');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    // Create a file in temp dir
    await fs.mkdir(context.tempDir, { recursive: true });
    await fs.writeFile(path.join(context.tempDir, 'test.txt'), 'test content');

    await context.resetTempDir();

    expect(await fs.exists(context.tempDir)).toBe(true);
    expect(await fs.exists(path.join(context.tempDir, 'test.txt'))).toBe(false);
  });

  test('reset removes and recreates both build and temp directories', async () => {
    const projectDir = path.join(tempDir, 'reset-both-test');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    // Create files in both dirs
    await fs.mkdir(context.buildDir, { recursive: true });
    await fs.mkdir(context.tempDir, { recursive: true });
    await fs.writeFile(path.join(context.buildDir, 'build.txt'), 'build content');
    await fs.writeFile(path.join(context.tempDir, 'temp.txt'), 'temp content');

    await context.reset();

    expect(await fs.exists(context.buildDir)).toBe(true);
    expect(await fs.exists(context.tempDir)).toBe(true);
    expect(await fs.exists(path.join(context.buildDir, 'build.txt'))).toBe(false);
    expect(await fs.exists(path.join(context.tempDir, 'temp.txt'))).toBe(false);
  });
});

describe('BuildContext path finding methods', () => {
  test('markdownComponentsDir finds existing markdown components directory', async () => {
    const projectDir = path.join(tempDir, 'markdown-components-test');
    await fs.mkdir(path.join(projectDir, 'src/markdown'), { recursive: true });
    const context = new BuildContext({ path: projectDir });

    const mdCompDir = await context.markdownComponentsDir();
    expect(mdCompDir).toBe(path.join(projectDir, 'src/markdown'));
  });

  test('markdownComponentsDir returns null when directory not found', async () => {
    const projectDir = path.join(tempDir, 'markdown-components-missing');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    const mdCompDir = await context.markdownComponentsDir();
    expect(mdCompDir).toBeNull();
  });

  test('tailwindCssSrcPath finds existing tailwind.css in src/', async () => {
    const projectDir = path.join(tempDir, 'tailwind-test');
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'tailwind.css'), '/* tailwind */');
    const context = new BuildContext({ path: projectDir });

    const tailwindPath = await context.tailwindCssSrcPath();
    expect(tailwindPath).toBe(path.join(projectDir, 'src', 'tailwind.css'));
  });

  test('tailwindCssSrcPath finds index.css in src/ when tailwind.css not found', async () => {
    const projectDir = path.join(tempDir, 'index-css-test');
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'index.css'), '/* index css */');
    const context = new BuildContext({ path: projectDir });

    const tailwindPath = await context.tailwindCssSrcPath();
    expect(tailwindPath).toBe(path.join(projectDir, 'src', 'index.css'));
  });

  test('tailwindCssSrcPath returns null when no CSS file found', async () => {
    const projectDir = path.join(tempDir, 'tailwind-missing-test');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    const tailwindPath = await context.tailwindCssSrcPath();
    expect(tailwindPath).toBeNull();
  });

  test('clientTsxSrcPath finds existing entry template', async () => {
    const projectDir = path.join(tempDir, 'client-tsx-test');
    await fs.mkdir(path.join(projectDir, '_build'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '_build', 'entry-client.tsx'), '// client');
    const context = new BuildContext({ path: projectDir });

    const clientPath = await context.clientTsxSrcPath();
    expect(clientPath).toBe(path.join(projectDir, '_build', 'entry-client.tsx'));
  });

  test('clientTsxSrcPath falls back to embedded template when not found', async () => {
    const projectDir = path.join(tempDir, 'client-tsx-fallback');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    const clientPath = await context.clientTsxSrcPath();
    expect(clientPath).toContain('embedded-templates');
    expect(clientPath).toContain('entry-client.tsx');
  });

  test('serverJsxSrcPath finds existing entry template', async () => {
    const projectDir = path.join(tempDir, 'server-jsx-test');
    await fs.mkdir(path.join(projectDir, '_build'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '_build', 'entry-server.jsx'), '// server');
    const context = new BuildContext({ path: projectDir });

    const serverPath = await context.serverJsxSrcPath();
    expect(serverPath).toBe(path.join(projectDir, '_build', 'entry-server.jsx'));
  });

  test('serverJsxSrcPath falls back to embedded template when not found', async () => {
    const projectDir = path.join(tempDir, 'server-jsx-fallback');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    const serverPath = await context.serverJsxSrcPath();
    expect(serverPath).toContain('embedded-templates');
    expect(serverPath).toContain('entry-server.jsx');
  });

  test('pageWrapperPath finds PageWrapper.jsx', async () => {
    const projectDir = path.join(tempDir, 'pagewrapper-jsx-test');
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'PageWrapper.jsx'), '// wrapper');
    const context = new BuildContext({ path: projectDir });

    const wrapperPath = await context.pageWrapperPath();
    expect(wrapperPath).toBe(path.join(projectDir, 'src', 'PageWrapper.jsx'));
  });

  test('pageWrapperPath finds PageWrapper.tsx', async () => {
    const projectDir = path.join(tempDir, 'pagewrapper-tsx-test');
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'PageWrapper.tsx'), '// wrapper');
    const context = new BuildContext({ path: projectDir });

    const wrapperPath = await context.pageWrapperPath();
    expect(wrapperPath).toBe(path.join(projectDir, 'src', 'PageWrapper.tsx'));
  });

  test('pageWrapperPath returns null when not found', async () => {
    const projectDir = path.join(tempDir, 'pagewrapper-missing');
    await fs.mkdir(projectDir, { recursive: true });
    const context = new BuildContext({ path: projectDir });

    const wrapperPath = await context.pageWrapperPath();
    expect(wrapperPath).toBeNull();
  });
});

describe('BuildContext.getEntries', () => {
  test('finds and creates entries for all mdx files', async () => {
    const projectDir = path.join(tempDir, 'get-entries-test');
    await materializeProjectTemplates(projectDir);

    // Add a short delay to ensure files are written
    await new Promise((resolve) => setTimeout(resolve, 100));

    const context = new BuildContext({ path: projectDir });

    const entries = await context.getEntries();

    expect(entries).toHaveProperty('index');
    expect(entries['index']).toBeInstanceOf(Entry);
  });

  test('caches entries on subsequent calls', async () => {
    const projectDir = path.join(tempDir, 'entries-cache-test');
    await materializeProjectTemplates(projectDir);
    const context = new BuildContext({ path: projectDir });

    const entries1 = await context.getEntries();
    const entries2 = await context.getEntries();

    expect(entries1).toBe(entries2); // Same reference
  });
});

describe('BuildContext.getComponentMap', () => {
  test('finds all component files', async () => {
    const projectDir = path.join(tempDir, 'component-map-test');
    const srcDir = path.join(projectDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // Create test component files
    await fs.writeFile(path.join(srcDir, 'Button.jsx'), 'export default () => {}');
    await fs.writeFile(path.join(srcDir, 'Card.tsx'), 'export default () => {}');
    await fs.writeFile(path.join(srcDir, 'Header.js'), 'export default () => {}');

    const context = new BuildContext({ path: projectDir });
    const componentMap = await context.getComponentMap();

    expect(componentMap).toHaveProperty('Button');
    expect(componentMap).toHaveProperty('Card');
    expect(componentMap).toHaveProperty('Header');
    expect(componentMap['Button']).toContain('Button.jsx');
  });
});

describe('BuildContext directory getter methods', () => {
  test('returns correct directory paths', () => {
    const projectDir = '/test/project';
    const context = new BuildContext({ path: projectDir });

    expect(context.clientSrcDir).toBe(path.resolve(projectDir, '.scratch/cache/client-src'));
    expect(context.clientCompiledDir).toBe(path.resolve(projectDir, '.scratch/cache/client-compiled'));
    expect(context.serverSrcDir).toBe(path.resolve(projectDir, '.scratch/cache/server-src'));
    expect(context.serverCompiledDir).toBe(path.resolve(projectDir, '.scratch/cache/server-compiled'));
  });
});

