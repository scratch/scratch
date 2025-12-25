# AGENTS.md

## Project Overview

scratch is a CLI tool for building static MDX-based websites using Bun. Users create `.md` and `.mdx` files in a `pages/` directory and custom React components in `components/`, and the CLI compiles them into a static site.

## Architecture

### CLI Commands (`src/index.ts`)
- `create [path]` - Create a new Scratch project
  - `--no-src` - Exclude src/ directory
  - `--no-package` - Exclude package.json
  - `--no-example` - Create empty pages/ and public/ directories
- `build [path]` - Build the static site
- `dev [path]` - Development server with hot reload
- `preview [path]` - Preview the built site
- `clean [path]` - Clean build artifacts
- `update` - Update scratch to the latest version
- `checkout [file]` - Clone file/directory from built-in templates
  - Alias: `eject`
  - `-l, --list` - List available template files
  - `-f, --force` - Overwrite existing files without confirmation
- `view <path>` - View markdown file(s) with live reload
  - If path is a file: opens that file's route
  - If path is a directory: opens first markdown file alphabetically
  - `-p, --port <port>` - Port for dev server
  - `-n, --no-open` - Don't auto-open browser

### Build Pipeline (`src/cmd/build.ts`)
1. Ensure build dependencies are installed (react, react-dom, @mdx-js/react, tailwindcss, @tailwindcss/cli)
2. Reset temp directories (preserving node_modules cache)
3. Create TSX entry files from MD and MDX pages
4. Build Tailwind CSS
5. Build server modules for SSG (if enabled)
6. Run Bun.build() for client bundles
7. Generate HTML files
8. Inject frontmatter meta tags
9. Copy to dist/

### Component Resolution
Components can be placed in two locations:
- `components/` - Shared components available to all pages
- `pages/` - Co-located components alongside MDX files (useful for page-specific components)

Components from both directories are auto-imported into MDX files by basename.

**Fallback components**: If not present in user project, these are provided from embedded templates:
- `components/PageWrapper.jsx` - Base layout wrapper
- `components/markdown/CodeBlock.tsx` - Syntax-highlighted code blocks
- `components/markdown/Heading.tsx` - Styled headings with anchor links
- `components/markdown/Link.tsx` - Styled links

### Key Files
- `src/context.ts` - BuildContext class managing paths, entries, dependency resolution, template materialization, and component discovery
- `src/buncfg.ts` - Bun.build() configuration and plugins
- `src/cmd/build.ts` - Main build logic
- `src/cmd/dev.ts` - Development server with live reload
- `src/cmd/create.ts` - Create command handler
- `src/cmd/preview.ts` - Preview server for built sites
- `src/cmd/checkout.ts` - Checkout/revert command handler
- `src/cmd/view.ts` - View single file with live reload
- `src/template.ts` - Template runtime API (materialize, getContent, list templates)
- `src/template.generated.ts` - Compiled template content (generated, not checked in)
- `scripts/compile-templates.ts` - Compiles template/ files into executable

### Template System

Templates are embedded directly into the compiled executable for portability.

**Directory structure** (`template/`):
- `_build/` - Internal build infrastructure (entry-client.tsx, entry-server.jsx) - never copied to user projects
- `pages/` - Default pages (index.mdx) and components (pages/components/)
- `src/` - PageWrapper.jsx, tailwind.css, markdown component overrides (src/markdown/)
- `public/` - Static assets (scratch-logo.svg, favicon.svg)
- Root files: .gitignore, AGENTS.md

**Compilation**: `scripts/compile-templates.ts` reads all template files and generates `src/template.generated.ts` as a flat `{ path: content }` object. This runs automatically during `bun run build`.

**Runtime API** (`src/template.ts`):
- `materializeProjectTemplates(targetDir, options)` - Write project templates to disk (excludes `_build/`)
- `materializeTemplate(templatePath, targetPath)` - Write a single template file
- `getTemplateContent(templatePath)` - Get template content as string
- `hasTemplate(templatePath)` - Check if template exists
- `listTemplateFiles()` - List all template files

**Fallback resolution**: During build, if a required file is missing from the user's project, the embedded template is materialized to `.scratch-build-cache/embedded-templates/` and used instead.

### Build Cache (`.scratch-build-cache/`)
- `node_modules/` - Auto-installed build dependencies (react, react-dom, @mdx-js/react, tailwindcss, @tailwindcss/cli)
- `client-src/` - Generated TSX entry files
- `client-compiled/` - Bun.build() output
- `server-src/` - SSG JSX entries
- `server-compiled/` - SSG compiled modules
- `embedded-templates/` - Materialized embedded templates (fallbacks for missing user files)

### Dependency Resolution
- If user has `node_modules/` in project root, uses their dependencies
- Otherwise, auto-installs build essentials to `.scratch-build-cache/node_modules/`
- Tailwind CSS input is symlinked to cache directory so `@import "tailwindcss"` resolves correctly

### File Search Patterns
The build system searches multiple file names for key files, falling back to embedded templates:
- **CSS input**: `src/tailwind.css` → `src/index.css` → `src/globals.css` → embedded fallback
- **Client entry**: `entry-client.tsx` → `entry.tsx` → `client.tsx` → `build/entry-client.tsx` → `_build/entry-client.tsx` → embedded `_build/entry-client.tsx`
- **Server entry**: `entry-server.jsx` → `index.jsx` → `server.jsx` → `build/entry-server.jsx` → `_build/entry-server.jsx` → embedded `_build/entry-server.jsx`
- **PageWrapper**: `components/PageWrapper.jsx` or `.tsx` → embedded `components/PageWrapper.jsx`

### Development Server
The dev server (`src/cmd/dev.ts`) provides:
- Live reload via WebSocket at `/__live_reload` endpoint
- Port fallback mechanism (tries preferred port, increments if in use)
- File watching with 100ms debouncing to prevent rebuild storms
- Automatic browser opening (platform-aware: darwin/win32/linux)

## Testing

Tests are in `test/` directory. Run with:
```bash
bun test
```

### Testing the Default Template

Do NOT build directly in `template/default/` - this pollutes the template with build artifacts. Instead, create a temp directory and use the CLI:

```bash
# Create a temp project from the template
rm -rf /tmp/test-scratch && mkdir /tmp/test-scratch
bun run src/index.ts create /tmp/test-scratch

# Test the build
bun run src/index.ts build /tmp/test-scratch

# Or test dev server
bun run src/index.ts dev /tmp/test-scratch
```

## Common Patterns

### Adding a new CLI command
1. Create handler in `src/cmd/`
2. Register in `src/index.ts` using Commander

### Modifying build pipeline
1. Update `src/cmd/build.ts`
2. Build config is in `src/buncfg.ts`

### Adding template files
1. Add to `template/` for user-facing files (copied to new projects)
2. Add to `template/_build/` for internal build infrastructure (not copied to user projects)
3. Run `bun run compile-templates` to regenerate `src/template.generated.ts`, or just run `bun run build` which does this automatically
