// Server‑side entry for SSG rendering
import { renderToString } from "react-dom/server";
import { MDXProvider } from "@mdx-js/react";
import Component from "{{entrySourceMdxImportPath}}";
import { MDXComponents } from "{{markdownComponentsPath}}";

// Set scratch globals on globalThis for SSR access by components
{{scratchGlobals}}

/**
 * Render the application to an HTML string.
 */
export async function render(url = "/") {
  let rendered = renderToString(
    <MDXProvider components={MDXComponents}>
      <Component />
    </MDXProvider>
  );

  return rendered;
}
