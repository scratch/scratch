/**
 * Rehype plugin that moves the footnotes section inside the PageWrapper.
 *
 * remark-gfm adds footnotes as a sibling to the PageWrapper, but we want them inside
 * so they're styled correctly and included in the page layout.
 */
import type { Plugin } from 'unified';

/**
 * Create a rehype plugin that moves the footnotes section inside the PageWrapper.
 */
export const createFootnotesPlugin = (): Plugin => {
  return () => {
    return (tree: any) => {
      if (!tree.children || !Array.isArray(tree.children)) return;

      // Find the footnotes section (has data-footnotes attribute)
      let footnotesSection: any = null;
      let footnotesIndex = -1;

      for (let i = 0; i < tree.children.length; i++) {
        const child = tree.children[i];
        if (child.type === 'element' && child.tagName === 'section') {
          const props = child.properties || {};
          if (props.dataFootnotes || props['data-footnotes']) {
            footnotesSection = child;
            footnotesIndex = i;
            break;
          }
        }
      }

      // No footnotes to move
      if (!footnotesSection || footnotesIndex === -1) return;

      // Find the PageWrapper JSX element
      const pageWrapper = tree.children.find(
        (child: any) =>
          child.type === 'mdxJsxFlowElement' && child.name === 'PageWrapper'
      );

      // If no PageWrapper found, leave footnotes where they are
      if (!pageWrapper) return;

      // Move footnotes inside PageWrapper
      tree.children.splice(footnotesIndex, 1);
      if (!pageWrapper.children) pageWrapper.children = [];
      pageWrapper.children.push(footnotesSection);
    };
  };
};
