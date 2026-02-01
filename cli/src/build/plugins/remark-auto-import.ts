/**
 * Remark plugin that auto-imports React components and wraps MDX content in PageWrapper.
 *
 * This plugin:
 * - Scans MDX for JSX components (uppercase names)
 * - Automatically injects import statements for components found in the component map
 * - Wraps content in PageWrapper if available
 * - Detects default vs named exports to generate correct import syntax
 */
import path from 'path';
import fs from 'fs';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { is } from 'unist-util-is';
import { parse } from 'acorn';
import type { Node, Root } from 'mdast';
import log from '../../logger';
import type { JsxElementNode } from './types';

// MDAST node type representing an import/export block in MDX
interface MdxjsEsmNode {
  type: 'mdxjsEsm';
  value: string;
  data?: any;
}

export type ComponentMap = Record<string, string>;

const PAGE_WRAPPER = 'PageWrapper';

// Cache for checking if files have default exports
const defaultExportCache = new Map<string, boolean>();

let PREPROCESSING_STARTED = false;

// Collect preprocessing errors since Bun.build() swallows plugin errors
const preprocessingErrors: Error[] = [];

/**
 * Strip comments from source code to avoid false positives in regex matching.
 */
function stripComments(content: string): string {
  return content
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
}

/**
 * Check if content has a default export using regex.
 * Exported for testing.
 */
export function checkDefaultExport(content: string): boolean {
  const stripped = stripComments(content);
  return (
    /export\s+default\s+/.test(stripped) ||
    /export\s*\{[^}]*\bas\s+default\b/.test(stripped) ||
    /export\s*\{\s*default\s*\}\s*from/.test(stripped)
  );
}

/**
 * Check if a file has a default export.
 * Results are cached for performance.
 */
function hasDefaultExport(filePath: string): boolean {
  if (defaultExportCache.has(filePath)) {
    return defaultExportCache.get(filePath)!;
  }

  let hasDefault = false;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    hasDefault = checkDefaultExport(content);
  } catch {
    // Can't read file - assume named export
    hasDefault = false;
  }

  defaultExportCache.set(filePath, hasDefault);
  return hasDefault;
}

/**
 * Find all JSX element names that look like React components
 * (they start with an uppercase letter).
 */
function findComponents(tree: Node) {
  const invoked = new Set<string>();
  const imported = new Set<string>();

  // Very small regexp-based extraction – enough for simple imports.
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;

  visit(
    tree,
    ['mdxJsxFlowElement', 'mdxJsxTextElement', 'mdxjsEsm'],
    (node: Node) => {
      // Find all react components used in an MDX document
      if (is(node, 'mdxJsxFlowElement') || is(node, 'mdxJsxTextElement')) {
        const name = (node as JsxElementNode).name;
        if (!name) return;

        // Grab the first part before a dot (e.g. `Foo.Bar` -> `Foo`)
        const primaryName = name.split('.')[0] as string;

        if (/^[A-Z]/.test(primaryName)) {
          invoked.add(primaryName);
        }

        // Collect already-imported identifiers from existing ESM blocks so we
        // don't add duplicates
      } else if (is(node, 'mdxjsEsm')) {
        const value = (node as MdxjsEsmNode).value;

        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(value)) !== null) {
          const importClause = match[1] || '';

          importClause
            .replace(/[{}]/g, '') // Remove curly braces
            .split(',') // Split by comma
            .forEach((part) => {
              const name = part.trim();
              if (!name) return;
              const bits = name.split(/\s+as\s+/i); // Split by "as" keyword
              const importName = bits.length > 1 ? bits[1] : bits[0]; // Get the import name
              if (importName) {
                imported.add(importName);
              }
            });
        }
      }
    }
  );

  return { invoked, imported };
}

/**
 * Get and clear any preprocessing errors that occurred during MDX compilation.
 * Bun.build() swallows errors thrown from remark plugins, so we collect them here.
 */
export function getPreprocessingErrors(): Error[] {
  const errors = [...preprocessingErrors];
  preprocessingErrors.length = 0;
  return errors;
}

/**
 * Reset preprocessing state for a new build
 */
export function resetAutoImportState(): void {
  PREPROCESSING_STARTED = false;
  preprocessingErrors.length = 0;
  defaultExportCache.clear();
}

/**
 * Create a remark plugin that injects import statements for locally defined
 * React components discovered in `src/` so authors don't have to import
 * them manually in every MDX file.
 */
export const createAutoImportPlugin = (
  componentMap: ComponentMap,
  componentConflicts: Set<string> = new Set()
): Plugin => {
  const plugin: Plugin = () => {
    return (tree: Node, file: any) => {
      let root = tree as Root;
      const { invoked, imported } = findComponents(tree);

      if (!PREPROCESSING_STARTED) {
        log.debug('=== MDX PREPROCESSING ===');
        PREPROCESSING_STARTED = true;
      }

      log.debug(
        `Processing: ${file?.path ? path.relative(process.cwd(), file.path) : 'unknown'}`
      );

      // wrap mdx content in PageWrapper component if it is found in the
      // src directory and not already invoked in the MDX file
      if (PAGE_WRAPPER in componentMap && !invoked.has(PAGE_WRAPPER)) {
        log.debug(`  - Wrapping content in PageWrapper`);
        const wrapperNode = {
          type: 'mdxJsxFlowElement',
          name: PAGE_WRAPPER,
          attributes: [],
          children: root.children,
        } as any;
        root.children = [wrapperNode];
        invoked.add(PAGE_WRAPPER);
      }

      // identify missing component imports
      const missing = Array.from(invoked.difference(imported));
      const toInject = missing.filter((comp) => comp in componentMap);

      // Check for ambiguous components (multiple files with same name)
      const ambiguous = toInject.filter((comp) => componentConflicts.has(comp));
      if (ambiguous.length > 0) {
        const filePath = file.path
          ? path.relative(process.cwd(), file.path)
          : 'unknown';
        const err = new Error(
          `Ambiguous component import in ${filePath}: "${ambiguous.join('", "')}" ` +
            `exists in multiple files in src/. ` +
            `Add an explicit import to specify which one to use.`
        );
        // Collect error since Bun.build() swallows thrown errors from remark plugins
        preprocessingErrors.push(err);
      }

      // Remove ambiguous components from injection to avoid further errors
      const safeToInject = toInject.filter((c) => !ambiguous.includes(c));

      let mdxFileDir: string;
      if (file && typeof file.path === 'string') {
        mdxFileDir = path.dirname(file.path as string);
      } else {
        mdxFileDir = process.cwd();
      }

      // create import statements for missing components
      const newImportNodes: MdxjsEsmNode[] = [];
      for (const name of safeToInject) {
        const absPath = componentMap[name]!; // non-null assertion – guarded above
        let relPath = path.relative(mdxFileDir, absPath).replace(/\\/g, '/');
        if (!relPath.startsWith('.')) {
          relPath = './' + relPath;
        }

        // Use default import if file has default export, otherwise use named import
        const isDefault = hasDefaultExport(absPath);
        const stmt = isDefault
          ? `import ${name} from '${relPath}';`
          : `import { ${name} } from '${relPath}';`;
        log.debug(
          `  - injecting ${isDefault ? 'default' : 'named'} import from ${relPath}`
        );

        try {
          const estree = parse(stmt, {
            ecmaVersion: 'latest',
            sourceType: 'module',
          });
          newImportNodes.push({
            type: 'mdxjsEsm',
            value: stmt,
            data: { estree },
          });
        } catch (parseErr: any) {
          const filePath = file?.path
            ? path.relative(process.cwd(), file.path)
            : 'unknown';
          const err = new Error(
            `Failed to generate import for component "${name}" in ${filePath}: ${parseErr.message}\n` +
              `  Generated statement: ${stmt}\n` +
              `  This may indicate an invalid component name.`
          );
          preprocessingErrors.push(err);
        }
      }

      // inject missing import statements
      root.children = [...newImportNodes, ...root.children];
    };
  };

  return plugin;
};
