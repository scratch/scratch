# CLI Agent Notes

## Project Overview

scratch is a CLI tool for building static MDX-based websites using Bun. Users create `.md` and `.mdx` files in a `pages/` directory and custom React components in `components/`, and the CLI compiles them into a static site.

## Architecture

### CLI Commands (`src/index.ts`)

Commands are organized into four groups:

**Local Commands:**
- `create [path]` - Create a new Scratch project
  - `--no-src` - Exclude src/ directory
  - `--no-package` - Exclude package.json
  - `--minimal` - Minimal mode: skip example content
- `build [path]` - Build the static site
- `dev [path]` - Development server with hot reload
- `preview [path]` - Preview the built site
- `watch [path]` - Watch markdown file(s) with live reload
- `clean [path]` - Clean build artifacts
- `update` - Update scratch to the latest version
- `eject [file]` - Eject file/directory from built-in templates for customization
  - `-l, --list` - List available template files
  - `-f, --force` - Overwrite existing files without confirmation
- `config [path]` - Configure local project settings (.scratch/project.toml)

**Server Commands:**
- `login [server-url]` - Log in via OAuth device flow
- `logout [server-url]` - Log out and clear credentials
- `whoami [server-url]` - Show current user info
- `cf-access [server-url]` - Configure Cloudflare Access service token

**Project Commands:**
- `publish [path]` - Build and publish project to server
  - `--name <name>` - Override project name
  - `--visibility <visibility>` - Override visibility
  - `--no-build` - Skip build step
  - `--dry-run` - Show what would be deployed without uploading
  - If `.scratch/project.toml` doesn't exist, runs config flow first
- `projects list [server-url]` - List all user's projects
- `projects info [name] [server-url]` - Show project details
- `projects delete [name] [server-url]` - Delete project (requires confirmation)
  - `-f, --force` - Skip confirmation prompt

**Share Commands:**
- `share create [project]` - Create a time-limited share token
  - `--name <name>` - Token name
  - `--duration <duration>` - Token duration (1d, 1w, 1m)
- `share list [project]` - List share tokens for a project
- `share revoke <tokenId> [project]` - Revoke a share token

**Server URL Resolution:**
When `[server-url]` is not provided:
1. If logged into exactly one server, use it automatically
2. If logged into multiple servers, prompt user to choose
3. If not logged in anywhere, use default server

### Build Pipeline (`src/build/`)
The build system uses a modular step-based architecture orchestrated by `src/build/orchestrator.ts`:

1. **01-ensure-dependencies** - Install build dependencies (react, react-dom, @mdx-js/react, tailwindcss, @tailwindcss/cli, @tailwindcss/typography)
2. **02-reset-directories** - Reset temp directories (preserving node_modules)
3. **03-create-tsx-entries** - Create TSX entry files from MD/MDX pages
4. **04-tailwind-css** - Build Tailwind CSS (runs in parallel with step 5)
5. **05-server-build** - Build server modules for SSG
6. **05b-render-server** - Render server modules to HTML
7. **06-client-build** - Run Bun.build() for client bundles
8. **07-generate-html** - Generate HTML files
9. **08-inject-frontmatter** - Inject frontmatter meta tags
10. **09-copy-pages-static** - Copy static assets from pages/
11. **10-copy-public-static** - Copy public/ directory assets
12. **11-copy-to-dist** - Copy final output to dist/

### Component Resolution
Components can be placed in two locations:
- `src/` - Shared components available to all pages
- `pages/` - Co-located components alongside MDX files (useful for page-specific components)

Components from both directories are auto-imported into MDX files by basename.

**Key components**:
- `src/PageWrapper.jsx` - Base layout wrapper (optional, pages render unwrapped if not present)
- `src/markdown/CodeBlock.tsx` - Syntax-highlighted code blocks
- `src/markdown/Heading.tsx` - Styled headings with anchor links
- `src/markdown/Link.tsx` - Styled links

These can be ejected from embedded templates using `scratch eject`.

### Key Files

**Build system** (`src/build/`):
- `src/build/orchestrator.ts` - Step-based build orchestrator
- `src/build/context.ts` - BuildContext class managing paths, entries, dependency resolution, template materialization, and component discovery
- `src/build/buncfg.ts` - Bun.build() configuration and plugins
- `src/build/types.ts` - Type definitions for pipeline state and steps
- `src/build/preprocess.ts` - MDX preprocessing logic
- `src/build/errors.ts` - Build error formatting
- `src/build/steps/*.ts` - Individual build step implementations

**CLI commands** (`src/cmd/`):
- `src/cmd/build.ts` - Build command handler (thin wrapper calling orchestrator)
- `src/cmd/dev.ts` - Development server with live reload
- `src/cmd/create.ts` - Create command handler
- `src/cmd/preview.ts` - Preview server for built sites
- `src/cmd/checkout.ts` - Eject command handler
- `src/cmd/watch.ts` - Watch single file with live reload

**Server/Project commands** (`src/cmd/cloud/`):
- `src/cmd/cloud/context.ts` - CloudContext for server URL resolution and auth
- `src/cmd/cloud/auth.ts` - login, logout, whoami, cf-access commands
- `src/cmd/cloud/config.ts` - Local project config command
- `src/cmd/cloud/publish.ts` - Publish/deploy command with build integration
- `src/cmd/cloud/projects.ts` - Project list, info, delete commands
- `src/cmd/cloud/share.ts` - Share token create, list, revoke commands

**Templates**:
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

**Fallback resolution**: During build, if a required file is missing from the user's project, the embedded template is materialized to `.scratch/cache/embedded-templates/` and used instead.

### Build Cache (`.scratch/cache/`)
- `client-src/` - Generated TSX entry files
- `client-compiled/` - Bun.build() output
- `server-src/` - SSG JSX entries
- `server-compiled/` - SSG compiled modules
- `embedded-templates/` - Materialized embedded templates (fallbacks for missing user files)

### Dependency Resolution
- Dependencies are installed to `node_modules/` in the project root
- Build dependencies: react, react-dom, @mdx-js/react, tailwindcss, @tailwindcss/cli, @tailwindcss/typography
- If no package.json exists, one is auto-generated with the required dependencies

### File Search Patterns
The build system searches for key files with the following fallback behavior:
- **CSS input**: `src/tailwind.css` → `src/index.css` → `src/globals.css` (no embedded fallback)
- **Client entry**: `_build/entry-client.tsx` → embedded template
- **Server entry**: `_build/entry-server.jsx` → embedded template
- **PageWrapper**: `src/PageWrapper.jsx` or `.tsx` (no embedded fallback, pages render unwrapped if not present)

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
1. Add/modify steps in `src/build/steps/`
2. Update step ordering in `src/build/orchestrator.ts`
3. Build config is in `src/build/buncfg.ts`

### Adding template files
1. Add to `template/` for user-facing files (copied to new projects)
2. Add to `template/_build/` for internal build infrastructure (not copied to user projects)
3. Run `bun run compile-templates` to regenerate `src/template.generated.ts`, or just run `bun run build` which does this automatically
