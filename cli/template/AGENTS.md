# AGENTS.md

This is a **scratch** project - a static site built from MDX files using the scratch CLI.

## What is scratch?

scratch is a CLI tool that compiles MDX (Markdown + JSX) files into a static website. It uses Bun as the build tool and bundler, React for rendering, and Tailwind CSS for styling.

## CLI Commands

Run `scratch --help` to see all available commands.

### Important Commands

- `scratch dev` - Start development server with hot reload
- `scratch build` - Build the static site to `dist/`
- `scratch preview` - Preview the built site locally
- `scratch clean` - Clean build artifacts

### Common Flags

- `-v, --verbose` - Verbose output for debugging
- `-p, --port <port>` - Custom port for dev/preview servers
- `-n, --no-open` - Don't auto-open browser

## Project Structure

```
project/
├── pages/              # MDX and Markdown content (required)
│   ├── index.mdx       # Homepage (resolves to /)
│   ├── Counter.tsx     # Components can live alongside pages
│   └── posts/
│       └── hello.mdx   # Resolves to /posts/hello/
├── src/                # React components and styles (optional)
│   ├── Button.jsx      # Custom components
│   ├── tailwind.css    # Global styles
│   ├── markdown/       # Custom markdown renderers
│   └── template/       # Page layout components
│       ├── PageWrapper.jsx  # Wraps every page
│       ├── Header.jsx       # Site header
│       ├── Footer.jsx       # Site footer
│       └── ...
├── public/             # Static assets (optional, copied as-is)
│   └── logo.png
└── dist/               # Build output (generated)
```

## Writing Content

### MDX Files

Place `.mdx` or `.md` files in `pages/`. MDX lets you use React components directly in Markdown:

```mdx
---
title: My Page
description: A description for SEO
---

# Hello World

This is markdown with a <Button>React component</Button> inline.
```

### Frontmatter

YAML frontmatter is automatically extracted and injected as HTML meta tags:

- `title` - Page title and og:title
- `description` - Meta description and og:description
- `image` - og:image
- `keywords` - Meta keywords
- `author` - Meta author (also available as `window.__scratch_author__` for the Copyright component)

### URL Path Resolution

- `pages/index.mdx` → `/`
- `pages/about.mdx` → `/about/`
- `pages/posts/hello.mdx` → `/posts/hello/`
- `pages/posts/index.mdx` → `/posts/`

The pattern: `index.mdx` resolves to its parent directory path, other files get their own directory.

## Components

### Auto-Import (No Explicit Imports Needed!)

Components in `src/` or `pages/` are **automatically available** in MDX files without importing them. Just use them:

```mdx
# My Page

<MyComponent prop="value" />

<Button>Click me</Button>
```

The build automatically injects the necessary imports.

**Important:** The component name must match the filename:
- `src/Button.jsx` → `<Button />` works
- `src/ui/Card.tsx` → `<Card />` works (subdirectories are fine)
- `pages/Counter.tsx` → `<Counter />` works (co-located components)
- But a component named `Button` defined inside `helpers.jsx` will NOT auto-import

If two files have the same basename (e.g., `src/Button.jsx` and `pages/Button.jsx`), only one will be available.

### Component Children Patterns

Components can accept children in different ways:

**Self-closing (no children):**
```mdx
<Counter />
<Chart data={myData} />
```

Self-closing components are automatically wrapped in a `<div className="not-prose">` wrapper, so they won't inherit Tailwind Typography styles. This is useful for components that render their own styled content (charts, forms, interactive widgets).

**Inline children** (text on the same line):
```mdx
<Button>Click me</Button>
<Highlight>important text</Highlight>
```

**Block children** (markdown with blank lines):
```mdx
<Callout type="warning">

## Warning Title

This is a **markdown** paragraph inside the component.

- List item one
- List item two

</Callout>
```

The blank lines after the opening tag and before the closing tag are required for block-level markdown to be parsed correctly.

### Styling with Tailwind

Components can use Tailwind CSS utility classes - they're globally available:

```jsx
// src/Card.jsx
export function Card({ children }) {
  return (
    <div className="p-4 rounded-lg shadow-md bg-white hover:shadow-lg transition-shadow">
      {children}
    </div>
  );
}
```

### PageWrapper Component

If you create a `src/template/PageWrapper.jsx`, it will **automatically wrap all page content**. Useful for layouts:

```jsx
// src/template/PageWrapper.jsx
import Header from './Header';
import Footer from './Footer';

export default function PageWrapper({ children }) {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
```

The default template includes Header, Footer, ScratchBadge, and Copyright components in `src/template/`. Customize these to change your site's layout.

### Markdown Components

Components in `src/markdown/` override default Markdown element rendering:

- `Heading.tsx` - Custom heading rendering (h1-h6)
- `CodeBlock.tsx` - Custom code block rendering with syntax highlighting

## Static Assets

Files in `public/` are copied directly to the build output. Reference them with absolute paths:

```mdx
![Logo](/logo.png)
```

### Static Assets in React Components

**IMPORTANT:** When loading static assets from React components, you MUST use `globalThis.__SCRATCH_BASE__` as the URL base. This ensures assets load correctly when the site is deployed to a subdirectory.

```jsx
// src/MyComponent.jsx
export default function MyComponent() {
  const base = globalThis.__SCRATCH_BASE__ || '';
  return <img src={`${base}/my-image.png`} alt="My image" />;
}
```

See `src/template/ScratchBadge.jsx` for a working example.

## Theming

Scratch uses [Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography) for markdown styling. The `prose` class is applied via PageWrapper.

### Customizing Typography

- **Size variants**: Add `prose-sm`, `prose-lg`, `prose-xl` in PageWrapper.jsx
- **Color themes**: Add `prose-slate`, `prose-zinc`, `prose-neutral`, etc.

### Overriding Prose Styling (No Custom Component)

Tailwind Typography supports element modifiers to override styling for specific element types directly in `PageWrapper.jsx`:

```jsx
<div className="prose prose-a:text-blue-600 prose-a:hover:text-blue-800 prose-headings:font-bold">
```

Available element modifiers:
- `prose-headings:` - all headings (h1-h6)
- `prose-h1:`, `prose-h2:`, etc. - specific heading levels
- `prose-a:` - links
- `prose-p:` - paragraphs
- `prose-blockquote:` - blockquotes
- `prose-code:` - inline code
- `prose-pre:` - code blocks
- `prose-ol:`, `prose-ul:`, `prose-li:` - lists
- `prose-table:`, `prose-th:`, `prose-td:` - tables
- `prose-img:`, `prose-figure:`, `prose-figcaption:` - images

You can also add CSS overrides in `src/tailwind.css`:
```css
.prose a {
  @apply text-blue-600 hover:text-blue-800 no-underline;
}
```

### Overriding with Custom Components

For more complex overrides (adding interactivity, conditional logic), create a custom component in `src/markdown/`:

1. Create/edit a component (e.g., `Link.tsx`)
2. Export from `src/markdown/index.ts` and add to `MDXComponents`

Example:
```tsx
// src/markdown/Link.tsx
export default function Link({ href, children, ...props }) {
  const isExternal = href?.startsWith('http');
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      {...props}
    >
      {children}
    </a>
  );
}
```

Use `not-prose` class to exclude elements from typography styling.

## Generated Files

These are generated and should be in `.gitignore`:

- `dist/` - Build output
- `.scratch/` - Build cache and project config
