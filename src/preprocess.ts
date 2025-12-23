import path from "path";
import fs from "fs";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { is } from "unist-util-is";
import { parse } from "acorn";
import type { Node, Root, Code } from "mdast";
import log from "./logger";

// Cache for checking if files have default exports
const defaultExportCache = new Map<string, boolean>();

/**
 * Check if a file has a default export by reading and parsing it.
 * Results are cached for performance.
 */
function hasDefaultExport(filePath: string): boolean {
  if (defaultExportCache.has(filePath)) {
    return defaultExportCache.get(filePath)!;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Simple heuristic: check for common default export patterns
    const hasDefault = /export\s+default\s+/.test(content) ||
                       /export\s*\{\s*\w+\s+as\s+default\s*\}/.test(content);
    defaultExportCache.set(filePath, hasDefault);
    return hasDefault;
  } catch {
    // If we can't read the file, assume named export
    defaultExportCache.set(filePath, false);
    return false;
  }
}

let PREPROCESSING_STARTED = false;

// Collect preprocessing errors since Bun.build() swallows plugin errors
const preprocessingErrors: Error[] = [];

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
export function resetPreprocessingState(): void {
  PREPROCESSING_STARTED = false;
  preprocessingErrors.length = 0;
  defaultExportCache.clear();
}

// MDAST node type representing an import/export block in MDX.  The typings in
// `@types/mdast` don't include MDX extensions, so we fall back to `any` where
// necessary.
interface MdxjsEsmNode {
  type: "mdxjsEsm";
  value: string;
  data?: any;
}

// Node types for JSX elements in MDX
type JsxElementNode = {
  type: "mdxJsxFlowElement" | "mdxJsxTextElement";
  name: string | null;
  children?: Node[];
  attributes?: MdxJsxAttribute[];
};

// MDX JSX attribute types
type MdxJsxAttribute = {
  type: "mdxJsxAttribute";
  name: string;
  value: string | null;
} | {
  type: "mdxJsxExpressionAttribute";
  value: string;
};

export type ComponentMap = Record<string, string>;

const PAGE_WRAPPER = "PageWrapper";

/**
 * Create a remark plugin that injects import statements for locally defined
 * React components discovered in `src/` so authors don't have to import
 * them manually in every MDX file.
 */
export const createPreprocessMdxPlugin = (
  componentMap: ComponentMap,
  componentConflicts: Set<string> = new Set(),
): Plugin => {
  const plugin: Plugin = () => {
    return (tree: Node, file: any) => {
      let root = tree as Root;
      const { invoked, imported } = findComponents(tree);

      if (!PREPROCESSING_STARTED) {
        log.debug("=== MDX PREPROCESSING ===");
        PREPROCESSING_STARTED = true;
      }

      log.debug(`Processing: ${file?.path ? path.relative(process.cwd(), file.path) : 'unknown'}`);

      // wrap mdx content in PageWrapper component if it is found in the
      // src directory and not already invoked in the MDX file
      if (PAGE_WRAPPER in componentMap && !invoked.has(PAGE_WRAPPER)) {
        log.debug(`  - Wrapping content in PageWrapper`);
        const wrapperNode = {
          type: "mdxJsxFlowElement",
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
        const filePath = file.path ? path.relative(process.cwd(), file.path) : 'unknown';
        const err = new Error(
          `Ambiguous component import in ${filePath}: "${ambiguous.join('", "')}" ` +
          `exists in multiple files in src/. ` +
          `Add an explicit import to specify which one to use.`
        );
        // Collect error since Bun.build() swallows thrown errors from remark plugins
        preprocessingErrors.push(err);
        // Still remove ambiguous components from injection to avoid further errors
        toInject.splice(0, toInject.length, ...toInject.filter((c) => !ambiguous.includes(c)));
      }

      let mdxFileDir: string;
      if (file && typeof file.path === "string") {
        mdxFileDir = path.dirname(file.path as string);
      } else {
        mdxFileDir = process.cwd();
      }

      // create import statements for missing components
      const newImportNodes: MdxjsEsmNode[] = toInject.map((name) => {
        const absPath = componentMap[name]!; // non-null assertion – guarded above
        let relPath = path.relative(mdxFileDir, absPath).replace(/\\/g, "/");
        if (!relPath.startsWith(".")) {
          relPath = "./" + relPath;
        }

        // Use default import if file has default export, otherwise use named import
        const isDefault = hasDefaultExport(absPath);
        const stmt = isDefault
          ? `import ${name} from '${relPath}';`
          : `import { ${name} } from '${relPath}';`;
        log.debug(`  - injecting ${isDefault ? 'default' : 'named'} import from ${relPath}`);
        const estree = parse(stmt, {
          ecmaVersion: "latest",
          sourceType: "module",
        });
        return {
          type: "mdxjsEsm",
          value: stmt,
          data: { estree },
        };
      });

      // inject missing import statements
      root.children! = [...newImportNodes, ...root.children];
    };
  };

  return plugin;
};

/**
 * Create a rehype plugin that moves the footnotes section inside the PageWrapper.
 * remark-gfm adds footnotes as a sibling to the PageWrapper, but we want them inside.
 */
export const createRehypeFootnotesPlugin = (): Plugin => {
  return () => {
    return (tree: any) => {
      // Find the footnotes section and the PageWrapper div
      let footnotesSection: any = null;
      let footnotesIndex = -1;
      let pageWrapperDiv: any = null;

      // The structure is: root > [PageWrapper div, footnotes section]
      // We need to move footnotes inside the PageWrapper div
      if (!tree.children || !Array.isArray(tree.children)) return;

      for (let i = 0; i < tree.children.length; i++) {
        const child = tree.children[i];
        if (child.type === 'element' && child.tagName === 'section') {
          const props = child.properties || {};
          if (props.dataFootnotes || props['data-footnotes']) {
            footnotesSection = child;
            footnotesIndex = i;
          }
        }
        // PageWrapper renders as a div - find it by checking if it contains content
        if (child.type === 'element' && child.tagName === 'div' && !pageWrapperDiv) {
          pageWrapperDiv = child;
        }
        // Also check for mdxJsxFlowElement (JSX in hast)
        if (child.type === 'mdxJsxFlowElement' && child.name === 'PageWrapper') {
          pageWrapperDiv = child;
        }
      }

      // If we found both, move footnotes inside PageWrapper
      if (footnotesSection && pageWrapperDiv && footnotesIndex > -1) {
        // Remove footnotes from root
        tree.children.splice(footnotesIndex, 1);
        // Add to end of PageWrapper's children
        if (!pageWrapperDiv.children) pageWrapperDiv.children = [];
        pageWrapperDiv.children.push(footnotesSection);
      }
    };
  };
};

/**
 * Create a remark plugin that wraps self-closing components in a div with `not-prose` class.
 * This prevents Tailwind Typography prose styles from affecting component output.
 *
 * Self-closing components like `<Chart />` or `<Counter />` typically render their
 * own styled content and shouldn't inherit prose typography styles.
 *
 * We wrap instead of adding className because components may not accept/use className prop.
 */
export const createNotProsePlugin = (): Plugin => {
  return () => {
    return (tree: Node) => {
      const root = tree as Root;

      // We need to collect nodes to wrap first, then wrap them
      // (can't modify tree while visiting)
      const nodesToWrap: { node: JsxElementNode; parent: any; index: number }[] = [];

      visit(
        tree,
        ["mdxJsxFlowElement"],
        (node: Node, index: number | undefined, parent: any) => {
          const jsxNode = node as JsxElementNode;

          // Only target user components (start with uppercase), not HTML elements
          if (!jsxNode.name || !/^[A-Z]/.test(jsxNode.name)) return;

          // Skip PageWrapper - it's a layout component, not a content component
          if (jsxNode.name === PAGE_WRAPPER) return;

          // Self-closing components have no children or empty children array
          const isSelfClosing = !jsxNode.children || jsxNode.children.length === 0;
          if (!isSelfClosing) return;

          // Skip if already wrapped in a not-prose div
          if (parent && parent.type === "mdxJsxFlowElement" && parent.name === "div") {
            const parentAttrs = parent.attributes || [];
            const hasNotProse = parentAttrs.some(
              (attr: any) =>
                attr.type === "mdxJsxAttribute" &&
                attr.name === "className" &&
                typeof attr.value === "string" &&
                attr.value.includes("not-prose")
            );
            if (hasNotProse) return;
          }

          if (index !== undefined && parent) {
            nodesToWrap.push({ node: jsxNode, parent, index });
          }
        },
      );

      // Wrap nodes in reverse order to preserve indices
      for (let i = nodesToWrap.length - 1; i >= 0; i--) {
        const { node, parent, index } = nodesToWrap[i];

        // Create wrapper div with not-prose class
        const wrapper = {
          type: "mdxJsxFlowElement",
          name: "div",
          attributes: [
            {
              type: "mdxJsxAttribute",
              name: "className",
              value: "not-prose",
            },
          ],
          children: [node],
        };

        // Replace the node with the wrapper
        parent.children[index] = wrapper;
        log.debug(`  - Wrapped <${node.name} /> in not-prose div`);
      }
    };
  };
};

/**
 * Find all JSX element names that look like React components
 * (theystart with an uppercase letter).
 * @param tree
 * @returns
 */
function findComponents(tree: Node) {
  const invoked = new Set<string>();
  const imported = new Set<string>();

  // Very small regexp-based extraction – enough for simple imports.
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;

  visit(
    tree,
    ["mdxJsxFlowElement", "mdxJsxTextElement", "mdxjsEsm"],
    (node: Node) => {
      // Find all react components used in an MDX document
      if (is(node, "mdxJsxFlowElement") || is(node, "mdxJsxTextElement")) {
        const name = (node as JsxElementNode).name;
        if (!name) return;

        // Grab the first part before a dot (e.g. `Foo.Bar` -> `Foo`)
        const primaryName = name.split(".")[0] as string; // Type assertion to assure TypeScript this is a string

        if (/^[A-Z]/.test(primaryName)) {
          invoked.add(primaryName);
        }

        // Collect already-imported identifiers from existing ESM blocks so we
        // don't add duplicates
      } else if (is(node, "mdxjsEsm")) {
        const value = (node as MdxjsEsmNode).value;

        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(value)) !== null) {
          const importClause = match[1] || "";

          importClause
            .replace(/[{}]/g, "") // Remove curly braces
            .split(",") // Split by comma
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
    },
  );

  return { invoked, imported };
}
