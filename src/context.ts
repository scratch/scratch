import {
  buildFileMap,
  bunInstall,
  rmWithRetry,
  type FileMapResult,
} from './util';
import path from 'path';
import fs from 'fs/promises';
import { spawnSync } from 'child_process';
import { globSync } from 'fast-glob';
import { templates, materializeTemplate, hasTemplate } from './template';
import log from './logger';

export const BUILD_DEPENDENCIES = [
  'react',
  'react-dom',
  '@mdx-js/react',
  'tailwindcss',
  '@tailwindcss/cli',
  '@tailwindcss/typography',
];

let CONTEXT: BuildContext | undefined;

export function setBuildContext(opts: BuildContextInitOptions) {
  CONTEXT = new BuildContext(opts);
  return CONTEXT;
}

export function getBuildContext(): BuildContext {
  if (CONTEXT === undefined) {
    throw new Error('Build context not initialized');
  }
  return CONTEXT;
}

export type HighlightMode = 'off' | 'popular' | 'auto' | 'all';

export interface BuildContextInitOptions {
  path?: string;
  rootDirName?: string;
  tempDirName?: string;
  outDir?: string;
  srcDirName?: string;
  pagesDirName?: string;
  staticDirName?: string;

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
    this.rootDir = path.resolve(opts.path || opts.rootDirName || '.');
    this.tempDir = path.resolve(
      this.rootDir,
      opts.tempDirName || '.scratch-build-cache'
    );
    this.buildDir = path.resolve(this.rootDir, opts.outDir || 'dist');
    this.srcDir = path.resolve(this.rootDir, opts.srcDirName || 'src');
    this.pagesDir = path.resolve(this.rootDir, opts.pagesDirName || 'pages');
    this.staticDir = path.resolve(
      this.rootDir,
      opts.staticDirName || 'public'
    );
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
   * Ensures build dependencies are installed.
   * - Creates package.json in project root if missing
   * - Runs bun install if node_modules doesn't exist
   *
   * Note: After installing dependencies, we must restart the build in a fresh
   * subprocess due to a Bun runtime bug where Bun.build() fails after spawning
   * a child bun process in the same execution.
   */
  async ensureBuildDependencies(): Promise<void> {
    const packageJsonPath = path.resolve(this.rootDir, 'package.json');
    const nodeModulesPath = path.resolve(this.rootDir, 'node_modules');

    // Create package.json if it doesn't exist
    if (!(await fs.exists(packageJsonPath))) {
      const projectName = path.basename(this.rootDir);
      const packageJson = {
        name: projectName,
        private: true,
        scripts: {
          dev: 'scratch dev',
          build: 'scratch build',
        },
        dependencies: Object.fromEntries(
          BUILD_DEPENDENCIES.map((pkg) => [pkg, 'latest'])
        ),
      };
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
      log.info('Created package.json');
    }

    // Install dependencies if node_modules doesn't exist
    if (!(await fs.exists(nodeModulesPath))) {
      log.info('Installing dependencies...');
      bunInstall(this.rootDir);
      log.info('Dependencies installed');
      this.restartBuildInSubprocess();
    }
  }

  /**
   * Re-run the build in a fresh subprocess to work around Bun runtime issue.
   * Bun.build() fails after spawning a child bun process in the same execution.
   */
  private restartBuildInSubprocess(): never {
    log.debug('Re-running build in subprocess to work around Bun runtime issue');

    // Detect if running as compiled binary vs `bun run script.ts`
    // Compiled binary: argv = ["bun", "/$bunfs/root/scratch", ...args]
    //                  execPath = "/path/to/scratch" (actual binary)
    // bun run:         argv = ["/path/to/bun", "/path/to/script.ts", ...args]
    //                  execPath = "/path/to/bun"
    const isCompiledBinary = process.argv[0] === 'bun' && process.argv[1]?.startsWith('/$bunfs/');

    const executable = isCompiledBinary ? process.execPath : process.argv[0]!;
    const args = isCompiledBinary ? process.argv.slice(2) : process.argv.slice(1);

    const result = spawnSync(executable, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(result.status ?? 1);
  }

  async reset() {
    await this.resetBuildDir();
    await this.resetTempDir();
  }

  async resetBuildDir() {
    await rmWithRetry(this.buildDir, { recursive: true, force: true });
    await fs.mkdir(this.buildDir, { recursive: true });
  }

  async resetTempDir() {
    await rmWithRetry(this.tempDir, { recursive: true, force: true });
    await fs.mkdir(this.tempDir, { recursive: true });

    // Clear materialized paths cache
    this.materializedPaths.clear();

    // Clear component and entry caches so new files are detected on rebuild
    this.entries = undefined;
    this.componentMap = undefined;
    this.componentConflicts = undefined;
  }

  /**
   * Resolve a path by checking candidates in the project, falling back to embedded template.
   */
  private async resolvePathWithFallback(
    candidates: string[],
    fallbackTemplatePath: string
  ): Promise<string> {
    for (const candidate of candidates) {
      const userPath = path.resolve(this.rootDir, candidate);
      if (await fs.exists(userPath)) {
        return userPath;
      }
    }
    return this.materializeEmbeddedFile(fallbackTemplatePath);
  }

  /**
   * Get the path to the markdown components directory.
   * Falls back to embedded templates if not in project.
   */
  async markdownComponentsDir(): Promise<string> {
    const userMarkdownDir = path.resolve(this.srcDir, 'markdown');
    if (await fs.exists(userMarkdownDir)) {
      return userMarkdownDir;
    }
    return this.materializeEmbeddedDir('src/markdown');
  }

  /**
   * Get the path to the Tailwind CSS source file.
   * Falls back to embedded template if not in project.
   */
  async tailwindCssSrcPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['src/tailwind.css', 'src/index.css', 'src/globals.css'],
      'src/tailwind.css'
    );
  }

  /**
   * Get the path to the client entry template.
   * Falls back to embedded template if not in project.
   */
  async clientTsxSrcPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['_build/entry-client.tsx'],
      '_build/entry-client.tsx'
    );
  }

  /**
   * Get the path to the server entry template.
   * Falls back to embedded template if not in project.
   */
  async serverJsxSrcPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['_build/entry-server.jsx'],
      '_build/entry-server.jsx'
    );
  }

  /**
   * Get the path to the PageWrapper component.
   * Falls back to embedded template if not in project.
   */
  async pageWrapperPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['src/PageWrapper.jsx', 'src/PageWrapper.tsx'],
      'src/PageWrapper.jsx'
    );
  }

  /**
   * Materialize a single embedded template file to the temp directory.
   * Returns the path to the materialized file.
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
   * Materialize all files in an embedded template subdirectory.
   * Returns the path to the materialized directory.
   */
  private async materializeEmbeddedDir(dirname: string): Promise<string> {
    const cacheKey = `${dirname}/`;
    if (this.materializedPaths.has(cacheKey)) {
      return this.materializedPaths.get(cacheKey)!;
    }

    const targetDir = path.resolve(this.embeddedTemplatesDir, dirname);

    // Find all files that start with this dirname
    const prefix = dirname + '/';
    for (const [filename, content] of Object.entries(templates)) {
      if (filename.startsWith(prefix)) {
        const relativePath = filename.slice(prefix.length);
        const targetPath = path.resolve(targetDir, relativePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, content);
      }
    }

    this.materializedPaths.set(cacheKey, targetDir);
    return targetDir;
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
   * Falls back to template components for PageWrapper and markdown components
   * if they are not found in the project.
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

      // Fallback: Add PageWrapper from embedded template if not in project
      if (!('PageWrapper' in result.map)) {
        const pageWrapperPath = await this.materializeEmbeddedFile(
          'src/PageWrapper.jsx'
        );
        result.map['PageWrapper'] = pageWrapperPath;
      }

      // Fallback: Add markdown components from embedded template if not in project
      const markdownComponents = ['CodeBlock', 'Heading'];
      for (const comp of markdownComponents) {
        if (!(comp in result.map)) {
          // Check for .tsx variant first
          const templatePath = `src/markdown/${comp}.tsx`;
          if (hasTemplate(templatePath)) {
            const componentPath =
              await this.materializeEmbeddedFile(templatePath);
            result.map[comp] = componentPath;
          }
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
