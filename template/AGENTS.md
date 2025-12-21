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
├── pages/           # MDX and Markdown content (required)
│   ├── index.mdx    # Homepage (resolves to /)
│   └── posts/
│       └── hello.mdx  # Resolves to /posts/hello/
├── components/      # React components (optional)
│   └── Button.jsx
├── public/          # Static assets (optional, copied as-is)
│   └── logo.png
├── tailwind.css     # Tailwind theme customization (optional)
└── dist/            # Build output (generated)
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
- `author` - Meta author

### URL Path Resolution

- `pages/index.mdx` → `/`
- `pages/about.mdx` → `/about/`
- `pages/posts/hello.mdx` → `/posts/hello/`
- `pages/posts/index.mdx` → `/posts/`

The pattern: `index.mdx` resolves to its parent directory path, other files get their own directory.

## Components

### Auto-Import (No Explicit Imports Needed!)

Components in `components/` or `pages/` are **automatically available** in MDX files without importing them. Just use them:

```mdx
# My Page

<MyComponent prop="value" />

<Button>Click me</Button>
```

The build automatically injects the necessary imports.

**Important:** The component name must match the filename:
- `components/Button.jsx` → `<Button />` works
- `components/ui/Card.tsx` → `<Card />` works (subdirectories are fine)
- `pages/Counter.jsx` → `<Counter />` works (co-located components)
- But a component named `Button` defined inside `helpers.jsx` will NOT auto-import

If two files have the same basename (e.g., `components/Button.jsx` and `pages/Button.jsx`), only one will be available.

### Styling with Tailwind

Components can use Tailwind CSS utility classes - they're globally available:

```jsx
// components/Card.jsx
export function Card({ children }) {
  return (
    <div className="p-4 rounded-lg shadow-md bg-white hover:shadow-lg transition-shadow">
      {children}
    </div>
  );
}
```

### PageWrapper Component

If you create a `components/PageWrapper.jsx`, it will **automatically wrap all page content**. Useful for layouts:

```jsx
// components/PageWrapper.jsx
export default function PageWrapper({ children }) {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <nav>...</nav>
      <main>{children}</main>
      <footer>...</footer>
    </div>
  );
}
```

### Markdown Components

Components in `components/markdown/` override default Markdown element rendering:

- `Heading.tsx` - Custom heading rendering (h1-h6)
- `CodeBlock.tsx` - Custom code block rendering with syntax highlighting

## Static Assets

Files in `public/` are copied directly to the build output. Reference them with absolute paths:

```mdx
![Logo](/logo.png)
```

## Theming

Scratch uses custom prose styling defined in `tailwind.css` for markdown content. The default template includes:

- `scratch-prose` class for typography styling
- Dark mode support (follows system preference via `.dark` class)

### Customizing the Theme

The `tailwind.css` file contains all prose styling for markdown elements. You can customize:

- Headings (h1-h4), paragraphs, links, lists
- Code blocks and inline code
- Blockquotes, tables, images
- Light and dark mode colors

Simply edit the `.scratch-prose` rules in `tailwind.css` to match your design.

### Dark Mode

Dark mode is enabled by default and follows system preferences. The `PageWrapper` component uses the `scratch-prose` class, and dark mode styles are automatically applied when the `.dark` class is present on a parent element.

## Generated Files

These are generated and should be in `.gitignore`:

- `dist/` - Build output
- `.scratch-build-cache/` - Build cache and auto-installed dependencies
