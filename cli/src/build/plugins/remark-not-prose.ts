/**
 * Remark plugin that wraps self-closing components in a div with `not-prose` class.
 *
 * This prevents Tailwind Typography prose styles from affecting component output.
 * Self-closing components like `<Chart />` or `<Counter />` typically render their
 * own styled content and shouldn't inherit prose typography styles.
 *
 * We wrap instead of adding className because components may not accept/use className prop.
 */
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import type { Node, Root } from 'mdast';
import log from '../../logger';

const PAGE_WRAPPER = 'PageWrapper';

// MDX JSX attribute types
type MdxJsxAttribute =
  | {
      type: 'mdxJsxAttribute';
      name: string;
      value: string | null;
    }
  | {
      type: 'mdxJsxExpressionAttribute';
      value: string;
    };

// Node types for JSX elements in MDX
type JsxElementNode = {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  children?: Node[];
  attributes?: MdxJsxAttribute[];
};

/**
 * Create a remark plugin that wraps self-closing components in a div with `not-prose` class.
 */
export const createNotProsePlugin = (): Plugin => {
  return () => {
    return (tree: Node) => {
      const root = tree as Root;

      // We need to collect nodes to wrap first, then wrap them
      // (can't modify tree while visiting)
      const nodesToWrap: {
        node: JsxElementNode;
        parent: any;
        index: number;
      }[] = [];

      visit(
        tree,
        ['mdxJsxFlowElement'],
        (node: Node, index: number | undefined, parent: any) => {
          const jsxNode = node as JsxElementNode;

          // Only target user components (start with uppercase), not HTML elements
          if (!jsxNode.name || !/^[A-Z]/.test(jsxNode.name)) return;

          // Skip PageWrapper - it's a layout component, not a content component
          if (jsxNode.name === PAGE_WRAPPER) return;

          // Self-closing components have no children or empty children array
          const isSelfClosing =
            !jsxNode.children || jsxNode.children.length === 0;
          if (!isSelfClosing) return;

          // Skip if already wrapped in a not-prose div
          if (
            parent &&
            parent.type === 'mdxJsxFlowElement' &&
            parent.name === 'div'
          ) {
            const parentAttrs = parent.attributes || [];
            const hasNotProse = parentAttrs.some(
              (attr: any) =>
                attr.type === 'mdxJsxAttribute' &&
                attr.name === 'className' &&
                typeof attr.value === 'string' &&
                attr.value.includes('not-prose')
            );
            if (hasNotProse) return;
          }

          if (index !== undefined && parent) {
            nodesToWrap.push({ node: jsxNode, parent, index });
          }
        }
      );

      // Wrap nodes in reverse order to preserve indices
      for (let i = nodesToWrap.length - 1; i >= 0; i--) {
        const { node, parent, index } = nodesToWrap[i];

        // Create wrapper div with not-prose class
        const wrapper = {
          type: 'mdxJsxFlowElement',
          name: 'div',
          attributes: [
            {
              type: 'mdxJsxAttribute',
              name: 'className',
              value: 'not-prose',
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
