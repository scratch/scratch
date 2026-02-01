/**
 * Shared types for MDX/remark/rehype plugins.
 */
import type { Node } from 'mdast';

/**
 * MDX JSX attribute types used in MDX AST nodes.
 */
export type MdxJsxAttribute =
  | {
      type: 'mdxJsxAttribute';
      name: string;
      value: string | null;
    }
  | {
      type: 'mdxJsxExpressionAttribute';
      value: string;
    };

/**
 * Node types for JSX elements in MDX.
 */
export type JsxElementNode = {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  children?: Node[];
  attributes?: MdxJsxAttribute[];
};
