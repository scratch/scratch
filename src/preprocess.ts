import path from "path";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { is } from "unist-util-is";
import { parse } from "acorn";
import type { Node, Root } from "mdast";
import log from "./logger";

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

        const stmt = `import ${name} from '${relPath}';`;
        log.debug(`  - injecting import from ${relPath}`);
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
