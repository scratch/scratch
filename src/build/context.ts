import { buildFileMap, rmWithRetry, type FileMapResult } from '../util';
import path from 'path';
import fs from 'fs/promises';
import { globSync } from 'fast-glob';
import { materializeTemplate } from '../template';

export type HighlightMode = 'off' | 'popular' | 'auto' | 'all';

export interface BuildContextInitOptions {
  path?: string;
  tempDir?: string;
  outDir?: string;
  srcDir?: string;
  pagesDir?: string;
  staticDir?: string;

  development?: boolean;
  open?: boolean;
  port?: number;
  strict?: boolean;
  highlight?: HighlightMode;
}

export class BuildContext {
  rootDir: string;
  tempDir: string;
  buildDir: string;
  srcDir: string;
  pagesDir: string;
  staticDir: string;

  options: BuildContextInitOptions;

  private entries: Record<string, Entry> | undefined;
  private componentMap: Record<string, string> | undefined;
  private componentConflicts: Set<string> | undefined;

  // Cache for materialized template paths
  private materializedPaths: Map<string, string> = new Map();

  constructor(opts: BuildContextInitOptions) {
    this.options = opts;
    this.rootDir = path.resolve(opts.path || '.');
    this.tempDir = path.resolve(this.rootDir, opts.tempDir || '.scratch-build-cache');
    this.buildDir = path.resolve(this.rootDir, opts.outDir || 'dist');
    this.srcDir = path.resolve(this.rootDir, opts.srcDir || 'src');
    this.pagesDir = path.resolve(this.rootDir, opts.pagesDir || 'pages');
    this.staticDir = path.resolve(this.rootDir, opts.staticDir || 'public');
  }

  get clientSrcDir(): string {
    return path.resolve(this.tempDir, 'client-src');
  }

  get clientCompiledDir(): string {
    return path.resolve(this.tempDir, 'client-compiled');
  }

  get serverSrcDir(): string {
    return path.resolve(this.tempDir, 'server-src');
  }

  get serverCompiledDir(): string {
    return path.resolve(this.tempDir, 'server-compiled');
  }

  get embeddedTemplatesDir(): string {
    return path.resolve(this.tempDir, 'embedded-templates');
  }

  /**
   * Returns the node_modules directory (always in project root).
   */
  async nodeModulesDir(): Promise<string> {
    return path.resolve(this.rootDir, 'node_modules');
  }

  /**
   * Clear caches so new files are detected on rebuild.
   * Called by the reset directories step.
   */
  clearCaches(): void {
    this.materializedPaths.clear();
    this.entries = undefined;
    this.componentMap = undefined;
    this.componentConflicts = undefined;
  }

  /**
   * Reset both build and temp directories.
   */
  async reset(): Promise<void> {
    await this.resetBuildDir();
    await this.resetTempDir();
  }

  /**
   * Reset the build directory.
   */
  async resetBuildDir(): Promise<void> {
    await rmWithRetry(this.buildDir, { recursive: true, force: true });
    await fs.mkdir(this.buildDir, { recursive: true });
  }

  /**
   * Reset the temp directory and clear caches.
   */
  async resetTempDir(): Promise<void> {
    await rmWithRetry(this.tempDir, { recursive: true, force: true });
    await fs.mkdir(this.tempDir, { recursive: true });
    this.clearCaches();
  }

  /**
   * Get the path to the markdown components directory.
   * Returns null if not found in project.
   */
  async markdownComponentsDir(): Promise<string | null> {
    const markdownDir = path.resolve(this.srcDir, 'markdown');
    return (await fs.exists(markdownDir)) ? markdownDir : null;
  }

  /**
   * Get the path to the empty MDX components file.
   * Used as fallback when src/markdown/ doesn't exist.
   */
  async emptyMdxComponentsPath(): Promise<string> {
    return this.materializeEmbeddedFile('_build/empty-mdx-components.ts');
  }

  /**
   * Get the path to the Tailwind CSS source file.
   * Checks src/tailwind.css, src/index.css, and src/globals.css.
   * Returns null if none found.
   */
  async tailwindCssSrcPath(): Promise<string | null> {
    const candidates = ['src/tailwind.css', 'src/index.css', 'src/globals.css'];
    for (const candidate of candidates) {
      const p = path.resolve(this.rootDir, candidate);
      if (await fs.exists(p)) return p;
    }
    return null;
  }

  /**
   * Get the path to the client entry template.
   * Falls back to embedded template if not in project.
   */
  async clientTsxSrcPath(): Promise<string> {
    const userPath = path.resolve(this.rootDir, '_build/entry-client.tsx');
    if (await fs.exists(userPath)) return userPath;
    return this.materializeEmbeddedFile('_build/entry-client.tsx');
  }

  /**
   * Get the path to the server entry template.
   * Falls back to embedded template if not in project.
   */
  async serverJsxSrcPath(): Promise<string> {
    const userPath = path.resolve(this.rootDir, '_build/entry-server.jsx');
    if (await fs.exists(userPath)) return userPath;
    return this.materializeEmbeddedFile('_build/entry-server.jsx');
  }

  /**
   * Materialize an embedded template file to the temp directory.
   * Used for internal build templates like entry-client.tsx.
   */
  private async materializeEmbeddedFile(templatePath: string): Promise<string> {
    if (this.materializedPaths.has(templatePath)) {
      return this.materializedPaths.get(templatePath)!;
    }

    const targetPath = path.resolve(this.embeddedTemplatesDir, templatePath);
    await materializeTemplate(templatePath, targetPath);
    this.materializedPaths.set(templatePath, targetPath);
    return targetPath;
  }

  /**
   * Get the path to the PageWrapper component.
   * Returns null if not found in project.
   */
  async pageWrapperPath(): Promise<string | null> {
    for (const name of ['src/PageWrapper.jsx', 'src/PageWrapper.tsx']) {
      const p = path.resolve(this.rootDir, name);
      if (await fs.exists(p)) return p;
    }
    return null;
  }

  /**
   * Map the source mdx files in the pages directory and create Entry objects
   * for each one.
   */
  async getEntries() {
    if (!this.entries) {
      const mdxFiles = globSync('**/*.{mdx,md}', {
        cwd: this.pagesDir,
        absolute: true,
      });
      this.entries = {};
      for (const mdxFile of mdxFiles) {
        const entry = new Entry(mdxFile, this.pagesDir);
        this.entries[entry.name] = entry;
      }
    }
    return this.entries;
  }

  /**
   * Catalogue all of the component files in the src directory and pages directory.
   */
  async getComponentMap() {
    if (!this.componentMap) {
      const pattern = '**/*.{js,jsx,ts,tsx}';

      // Start with project components (if directory exists)
      let result: FileMapResult = { map: {}, conflicts: new Set() };
      if (await fs.exists(this.srcDir)) {
        result = await buildFileMap(this.srcDir, pattern, true);
      }

      // Also scan pages directory for co-located components
      if (await fs.exists(this.pagesDir)) {
        const pagesResult = await buildFileMap(this.pagesDir, pattern, true);
        for (const [name, filePath] of Object.entries(pagesResult.map)) {
          if (name in result.map) {
            result.conflicts.add(name);
          } else {
            result.map[name] = filePath;
          }
        }
        for (const conflict of pagesResult.conflicts) {
          result.conflicts.add(conflict);
        }
      }

      this.componentMap = result.map;
      this.componentConflicts = result.conflicts;
    }
    return this.componentMap;
  }

  /**
   * Get the set of component names that have conflicts (multiple files with same name).
   * Must call getComponentMap() first.
   */
  getComponentConflicts(): Set<string> {
    return this.componentConflicts || new Set();
  }
}

export class Entry {
  // A unique name for this entry, e.g. "articles/post1"
  name: string;

  // The absolute path to the source file, e.g. "/project/pages/articles/post1.mdx"
  absPath: string;

  // Path to the source file relative to the base directory, e.g. "articles/post1.mdx"
  relPath: string;

  // The absolute path to the base directory of the source file, e.g. "/project/pages"
  baseDir: string;

  // Frontmatter data extracted from the source file
  frontmatterData?: Record<string, any>;

  constructor(sourceFile: string, baseDir: string) {
    this.absPath = path.resolve(sourceFile);
    this.baseDir = path.resolve(baseDir);

    this.relPath = path.relative(this.baseDir, this.absPath);

    // The entry name is the relative path to the source file without the extension
    this.name = this.relPath.replace(/\.[^/.]+$/, '');
  }

  /**
   * Construct the appropriate artifact path for this entry
   */
  getArtifactPath(extension: string, baseDir: string): string {
    // check if the basename of the entry name is "index"
    const basename = path.basename(this.name);
    if (basename === 'index') {
      return path.resolve(baseDir, this.name + extension);
    }
    return path.resolve(baseDir, this.name + '/index' + extension);
  }
}
