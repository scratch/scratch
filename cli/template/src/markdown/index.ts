export { CodeBlock } from './CodeBlock';
export { H2, H3 } from './Heading';
export { default as Link } from './Link';

import { CodeBlock } from './CodeBlock';
import { H2, H3 } from './Heading';
import Link from './Link';

// Only override elements that need interactivity
// All other styling is handled by Tailwind Typography 'prose' class
export const MDXComponents = {
  pre: CodeBlock,
  h2: H2,
  h3: H3,
  a: Link,
};
