import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { MDXProvider } from '@mdx-js/react';

// The source .mdx file for this page
import Component from '{{entrySourceMdxImportPath}}';

// Base Markdown components (maps lowercase tag names to styled components)
import { MDXComponents } from '{{markdownComponentsPath}}';

const component = React.createElement(
  MDXProvider,
  { components: MDXComponents },
  React.createElement(Component)
);

// If static site generation was used, hydrate the component container. If not,
// render and insert the component
const mdxElement = document.getElementById('mdx')!;
if ((window as any).__SCRATCH_SSG__) {
  hydrateRoot(mdxElement, component);
} else {
  createRoot(mdxElement).render(component);
}
