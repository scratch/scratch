import { buildFileMap, type FileMapResult } from './util';
import _path from 'path';
import fs from 'fs/promises';
import { spawnSync, execSync } from 'child_process';
import { globSync } from 'fast-glob';
import { templates, materializeTemplate, hasTemplate } from './template';
import log from './logger';

export const BUILD_DEPENDENCIES = ['react', 'react-dom', '@mdx-js/react', 'tailwindcss', '@tailwindcss/cli', '@tailwindcss/typography'];

/**
 * Spawn bun commands synchronously using Node's child_process.
 * Uses the current executable with BUN_BE_BUN=1 so scratch can run bun commands
 * without requiring bun to be installed separately.
 *
 * Note: We use Node's spawnSync instead of Bun.spawn to avoid a Bun runtime issue
 * where Bun.build() fails after spawning a child bun process in the same execution.
 */
export function spawnBunSync(
  args: string[],
  options: { cwd?: string; stdio?: 'pipe' | 'inherit' } = {}
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd,
    encoding: 'utf-8',
    stdio: options.stdio === 'inherit' ? 'inherit' : 'pipe',
    env: {
      ...process.env,
      BUN_BE_BUN: '1',
    },
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Remove a file or directory with retry logic for transient errors (EACCES, EBUSY).
 * This handles cases where files are temporarily locked by other processes.
 */
async function rmWithRetry(
  path: string,
  options: { recursive?: boolean; force?: boolean } = {},
  maxRetries = 3,
  delayMs = 100
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fs.rm(path, options);
      return;
    } catch (error: any) {
      const isRetryable = error?.code === 'EACCES' || error?.code === 'EBUSY';
      if (isRetryable && attempt < maxRetries) {
        log.debug(`Retry ${attempt}/${maxRetries} for rm ${path}: ${error.code}`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
}

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

export interface BuildContextInitOptions {
  path?: string;
  rootDirName?: string;
  tempDirName?: string;
  buildDirName?: string;
  srcDirName?: string;
  pagesDirName?: string;
  staticDirName?: string;

  development?: boolean;
  open?: boolean;
  port?: number;
  strict?: boolean;
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
    this.rootDir = _path.resolve(opts.path || opts.rootDirName || '.');
    this.tempDir = _path.resolve(this.rootDir, opts.tempDirName || '.scratch-build-cache');
    this.buildDir = _path.resolve(this.rootDir, opts.buildDirName || 'dist');
    this.srcDir = _path.resolve(
      this.rootDir,
      opts.srcDirName || 'src'
    );
    this.pagesDir = _path.resolve(this.rootDir, opts.pagesDirName || 'pages');
    this.staticDir = _path.resolve(this.rootDir, opts.staticDirName || 'public');
  }

  clientSrcDir = () => _path.resolve(this.tempDir, 'client-src');
  clientCompiledDir = () => _path.resolve(this.tempDir, 'client-compiled');
  serverSrcDir = () => _path.resolve(this.tempDir, 'server-src');
  serverCompiledDir = () => _path.resolve(this.tempDir, 'server-compiled');

  /**
   * Directory where embedded templates are materialized
   */
  embeddedTemplatesDir = () => _path.resolve(this.tempDir, 'embedded-templates');

  /**
   * Returns the node_modules directory to use for build dependencies.
   * If user has package.json, uses project root. Otherwise uses cache.
   */
  async nodeModulesDir(): Promise<string> {
    const userPackageJson = _path.resolve(this.rootDir, 'package.json');
    if (await fs.exists(userPackageJson)) {
      return _path.resolve(this.rootDir, 'node_modules');
    }
    return _path.resolve(this.tempDir, 'node_modules');
  }

  /**
   * Ensures build dependencies are installed.
   * - If user has package.json: runs bun install in project root
   * - Otherwise: installs required packages to .scratch-build-cache/node_modules
   */
  async ensureBuildDependencies(): Promise<void> {
    const userPackageJson = _path.resolve(this.rootDir, 'package.json');
    const userNodeModules = _path.resolve(this.rootDir, 'node_modules');

    // If user has package.json, install deps in project root
    if (await fs.exists(userPackageJson)) {
      if (await fs.exists(userNodeModules)) {
        log.debug('Using existing project node_modules');
        return;
      }

      log.info('Installing dependencies...');
      try {
        execSync(`"${process.execPath}" install`, {
          cwd: this.rootDir,
          stdio: 'pipe',
          env: { ...process.env, BUN_BE_BUN: '1' },
        });
      } catch (error: any) {
        throw new Error(
          `Failed to install dependencies.\n\n` +
          `This can happen if:\n` +
          `  - No network connection\n` +
          `  - Bun is not installed correctly\n` +
          `  - Disk space is low\n\n` +
          `Details: ${error.stderr?.toString() || error.message}`
        );
      }
      log.info('Dependencies installed');

      // Work around a Bun runtime issue: Bun.build() with target='bun' fails
      // after spawning a child bun process in the same execution.
      // Re-run the build in a fresh subprocess.
      log.debug('Re-running build in subprocess to work around Bun runtime issue');
      // In compiled Bun binaries, argv is ["bun", "/$bunfs/root/...", ...args]
      // so we skip the first two elements and use execPath as the executable
      const args = process.argv.slice(2);
      const buildResult = spawnSync(process.execPath, args, {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
      });
      process.exit(buildResult.status ?? 1);
    }

    // No package.json - use build cache
    const cacheNodeModules = _path.resolve(this.tempDir, 'node_modules');

    // Check if all required packages exist
    let needsInstall = !(await fs.exists(cacheNodeModules));
    if (!needsInstall) {
      for (const pkg of BUILD_DEPENDENCIES) {
        const pkgPath = _path.resolve(cacheNodeModules, pkg);
        if (!(await fs.exists(pkgPath))) {
          needsInstall = true;
          break;
        }
      }
    }

    if (needsInstall) {
      log.info('Installing build dependencies...');
      await fs.mkdir(this.tempDir, { recursive: true });

      // Create minimal package.json
      const packageJson = {
        name: 'scratch-build-cache',
        private: true,
        dependencies: Object.fromEntries(
          BUILD_DEPENDENCIES.map(pkg => [pkg, 'latest'])
        ),
      };
      await fs.writeFile(
        _path.resolve(this.tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Run bun install
      try {
        execSync(`"${process.execPath}" install`, {
          cwd: this.tempDir,
          stdio: 'pipe',
          env: { ...process.env, BUN_BE_BUN: '1' },
        });
      } catch (error: any) {
        throw new Error(
          `Failed to install build dependencies.\n\n` +
          `This can happen if:\n` +
          `  - No network connection\n` +
          `  - Bun is not installed correctly\n` +
          `  - Disk space is low\n\n` +
          `Details: ${error.stderr?.toString() || error.message}`
        );
      }

      log.info('Build dependencies installed');

      // Work around a Bun runtime issue: Bun.build() with target='bun' fails
      // after spawning a child bun process in the same execution.
      // Re-run the build in a fresh subprocess.
      log.debug('Re-running build in subprocess to work around Bun runtime issue');
      const args = process.argv.slice(2);
      const buildResult = spawnSync(process.execPath, args, {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
      });
      process.exit(buildResult.status ?? 1);
    }
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
    // Preserve node_modules if it exists to avoid reinstalling every build
    const nodeModulesPath = _path.resolve(this.tempDir, 'node_modules');
    const packageJsonPath = _path.resolve(this.tempDir, 'package.json');
    const hasNodeModules = await fs.exists(nodeModulesPath);

    if (hasNodeModules) {
      // Delete everything except node_modules and package.json
      const entries = await fs.readdir(this.tempDir);
      for (const entry of entries) {
        if (entry !== 'node_modules' && entry !== 'package.json') {
          await rmWithRetry(_path.resolve(this.tempDir, entry), { recursive: true, force: true });
        }
      }
    } else {
      await rmWithRetry(this.tempDir, { recursive: true, force: true });
      await fs.mkdir(this.tempDir, { recursive: true });
    }

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
      const userPath = _path.resolve(this.rootDir, candidate);
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
    const userMarkdownDir = _path.resolve(this.srcDir, 'markdown');
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
      ['entry-client.tsx', 'entry.tsx', 'client.tsx', 'build/entry-client.tsx', '_build/entry-client.tsx'],
      '_build/entry-client.tsx'
    );
  }

  /**
   * Get the path to the server entry template.
   * Falls back to embedded template if not in project.
   */
  async serverJsxSrcPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['entry-server.jsx', 'index.jsx', 'server.jsx', 'build/entry-server.jsx', '_build/entry-server.jsx'],
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

    const targetPath = _path.resolve(this.embeddedTemplatesDir(), templatePath);
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

    const targetDir = _path.resolve(this.embeddedTemplatesDir(), dirname);

    // Find all files that start with this dirname
    const prefix = dirname + '/';
    for (const [filename, content] of Object.entries(templates)) {
      if (filename.startsWith(prefix)) {
        const relativePath = filename.slice(prefix.length);
        const targetPath = _path.resolve(targetDir, relativePath);
        await fs.mkdir(_path.dirname(targetPath), { recursive: true });
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
            const componentPath = await this.materializeEmbeddedFile(templatePath);
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
    this.absPath = _path.resolve(sourceFile);
    this.baseDir = _path.resolve(baseDir);

    this.relPath = _path.relative(this.baseDir, this.absPath);

    // The entry name is the relative path to the source file without the extension
    this.name = this.relPath.replace(/\.[^/.]+$/, '');
  }

  /**
   * Construct the appropriate artifact path for this entry
   */
  getArtifactPath(extension: string, baseDir: string): string {
    // check if the basename of the entry name is "index"
    const basename = _path.basename(this.name);
    if (basename === 'index') {
      return _path.resolve(baseDir, this.name + extension);
    }
    return _path.resolve(baseDir, this.name + '/index' + extension);
  }
}
