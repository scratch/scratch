import { buildFileMap, type FileMapResult } from './util';
import _path from 'path';
import fs from 'fs/promises';
import { globSync } from 'fast-glob';
import {
  templates,
  materializeTemplate,
  getTemplateContent,
  hasTemplate,
  type TemplateCategory,
} from './template';
import log from './logger';

const BUILD_DEPENDENCIES = ['react', 'react-dom', '@mdx-js/react', 'tailwindcss', '@tailwindcss/cli'];

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
  componentsDirName?: string;
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
  componentsDir: string;
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
    this.componentsDir = _path.resolve(
      this.rootDir,
      opts.componentsDirName || 'components'
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
   * Prefers user's node_modules if it exists, otherwise uses cache.
   */
  async nodeModulesDir(): Promise<string> {
    const userNodeModules = _path.resolve(this.rootDir, 'node_modules');
    if (await fs.exists(userNodeModules)) {
      return userNodeModules;
    }
    return _path.resolve(this.tempDir, 'node_modules');
  }

  /**
   * Ensures build dependencies are installed. If the user has their own
   * node_modules, assumes they manage deps. Otherwise, installs required
   * packages to .scratch-build-cache/node_modules.
   */
  async ensureBuildDependencies(): Promise<void> {
    const userNodeModules = _path.resolve(this.rootDir, 'node_modules');
    if (await fs.exists(userNodeModules)) {
      log.debug('Using user node_modules for build dependencies');
      return;
    }

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
      const proc = Bun.spawn(['bun', 'install'], {
        cwd: this.tempDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(
          `Failed to install build dependencies.\n\n` +
          `This can happen if:\n` +
          `  - No network connection\n` +
          `  - Bun is not installed correctly\n` +
          `  - Disk space is low\n\n` +
          `Details: ${stderr}`
        );
      }

      log.info('Build dependencies installed');
    }
  }

  async reset() {
    await this.resetBuildDir();
    await this.resetTempDir();
  }

  async resetBuildDir() {
    await fs.rm(this.buildDir, { recursive: true, force: true });
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
          await fs.rm(_path.resolve(this.tempDir, entry), { recursive: true, force: true });
        }
      }
    } else {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      await fs.mkdir(this.tempDir, { recursive: true });
    }

    // Clear materialized paths cache
    this.materializedPaths.clear();
  }

  /**
   * Resolve a path by checking candidates in the project, falling back to embedded template.
   */
  private async resolvePathWithFallback(
    candidates: string[],
    fallback: { category: TemplateCategory; filename: string }
  ): Promise<string> {
    for (const candidate of candidates) {
      const userPath = _path.resolve(this.rootDir, candidate);
      if (await fs.exists(userPath)) {
        return userPath;
      }
    }
    return this.materializeEmbeddedFile(fallback.category, fallback.filename);
  }

  /**
   * Get the path to the markdown components directory.
   * Falls back to embedded templates if not in project.
   */
  async markdownComponentsDir(): Promise<string> {
    const userMarkdownDir = _path.resolve(this.componentsDir, 'markdown');
    if (await fs.exists(userMarkdownDir)) {
      return userMarkdownDir;
    }
    return this.materializeEmbeddedDir('default', 'components/markdown');
  }

  /**
   * Get the path to the Tailwind CSS source file.
   * Falls back to embedded template if not in project.
   */
  async tailwindCssSrcPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['theme.css', 'tailwind.css', 'index.css', 'globals.css'],
      { category: 'default', filename: 'theme.css' }
    );
  }

  /**
   * Get the path to the client entry template.
   * Falls back to embedded template if not in project.
   */
  async clientTsxSrcPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['entry-client.tsx', 'entry.tsx', 'client.tsx'],
      { category: 'internal', filename: 'entry-client.tsx' }
    );
  }

  /**
   * Get the path to the server entry template.
   * Falls back to embedded template if not in project.
   */
  async serverJsxSrcPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['entry-server.jsx', 'index.jsx', 'server.jsx'],
      { category: 'internal', filename: 'entry-server.jsx' }
    );
  }

  /**
   * Get the path to the PageWrapper component.
   * Falls back to embedded template if not in project.
   */
  async pageWrapperPath(): Promise<string> {
    return this.resolvePathWithFallback(
      ['components/PageWrapper.jsx', 'components/PageWrapper.tsx'],
      { category: 'default', filename: 'components/PageWrapper.jsx' }
    );
  }

  /**
   * Materialize a single embedded template file to the temp directory.
   * Returns the path to the materialized file.
   */
  private async materializeEmbeddedFile(
    category: TemplateCategory,
    filename: string
  ): Promise<string> {
    const cacheKey = `${category}/${filename}`;
    if (this.materializedPaths.has(cacheKey)) {
      return this.materializedPaths.get(cacheKey)!;
    }

    const targetPath = _path.resolve(this.embeddedTemplatesDir(), category, filename);
    await materializeTemplate(category, filename, targetPath);
    this.materializedPaths.set(cacheKey, targetPath);
    return targetPath;
  }

  /**
   * Materialize all files in an embedded template subdirectory.
   * Returns the path to the materialized directory.
   */
  private async materializeEmbeddedDir(
    category: TemplateCategory,
    dirname: string
  ): Promise<string> {
    const cacheKey = `${category}/${dirname}/`;
    if (this.materializedPaths.has(cacheKey)) {
      return this.materializedPaths.get(cacheKey)!;
    }

    const targetDir = _path.resolve(this.embeddedTemplatesDir(), category, dirname);
    const templateFiles = templates[category] as Record<string, string>;

    // Find all files that start with this dirname
    const prefix = dirname + '/';
    for (const [filename, content] of Object.entries(templateFiles)) {
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
   * Catalogue all of the component files in the components directory and pages directory.
   * Falls back to template components for PageWrapper and markdown components
   * if they are not found in the project.
   */
  async getComponentMap() {
    if (!this.componentMap) {
      const pattern = '**/*.{js,jsx,ts,tsx}';

      // Start with project components (if directory exists)
      let result: FileMapResult = { map: {}, conflicts: new Set() };
      if (await fs.exists(this.componentsDir)) {
        result = await buildFileMap(this.componentsDir, pattern, true);
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
          'default',
          'components/PageWrapper.jsx'
        );
        result.map['PageWrapper'] = pageWrapperPath;
      }

      // Fallback: Add markdown components from embedded template if not in project
      const markdownComponents = ['CodeBlock', 'Heading'];
      for (const comp of markdownComponents) {
        if (!(comp in result.map)) {
          // Check for .tsx variant first
          const filename = `components/markdown/${comp}.tsx`;
          if (hasTemplate('default', filename)) {
            const componentPath = await this.materializeEmbeddedFile('default', filename);
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
