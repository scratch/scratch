# Changelog

## [0.4.7] - 2026-01-14

This release simplifies the CLI authentication flow by replacing the device code polling mechanism with direct browser-based login.

### Improvements

- Simplified login flow: The CLI now opens your browser directly for authentication instead of displaying a code to enter manually. After approving in the browser, authentication completes automatically via localhost callback.
- Styled authentication callback pages to match the Scratch server UI for a consistent experience

## [0.4.6] - 2026-01-14

This release improves Cloudflare Access authentication and reorganizes the build cache location.

### Improvements

- Cloudflare Access login no longer requires a service token - the CLI now automatically detects CF Access and opens your browser to authenticate directly
- Build cache moved from `.scratch-build-cache/` to `.scratch/cache/` for better organization alongside project config

## [0.4.5] - 2026-01-13

This release simplifies the project model by removing namespaces and fixes Cloudflare Access authentication when using service tokens.

### Breaking Changes

- Removed namespace/group concept from the CLI. Projects are now owned directly by users without requiring a namespace prefix.

### Bug Fixes

- Fixed Cloudflare Access authentication failing when using service tokens
- Removed redundant project URL from `cloud config` output

## [0.4.4] - 2026-01-11

This release adds support for connecting to multiple Scratch Cloud servers and improves the project deletion workflow.

### Features

- Added global `--server-url` flag to all cloud commands, allowing you to target different Scratch Cloud servers without changing your configuration
- Server URLs are automatically normalized (adds `https://` and `app.` subdomain when needed)
- Added `--force` flag to `cloud projects delete` to skip the confirmation prompt

### Improvements

- Credentials and Cloudflare Access tokens are now stored per-server, enabling simultaneous authentication with multiple cloud instances
- Unified cloud command context handling with a new `CloudContext` class for consistent server URL resolution

## [0.4.3] - 2026-01-08

This release adds a medium width option to the page width toggle, giving users three layout choices.

### Improvements

- Page width toggle now offers three options: narrow (2xl), medium (4xl), and wide (full-width), replacing the previous two-state toggle

## [0.4.2] - 2026-01-08

This release improves the Cloudflare Access authentication experience by automatically detecting and handling expired or missing credentials.

### Improvements

- Cloud commands now automatically detect when Cloudflare Access authentication is required or has expired, prompting for new credentials and retrying the request
- Added distinct messages for "token expired" vs "server requires authentication" scenarios to help users understand what action is needed

## [0.4.1] - 2026-01-07

This release fixes a security issue with Cloudflare Access credential storage.

### Security

- Cloudflare Access credentials are now stored securely in `~/.scratch/secrets.json` with owner-only permissions (0o600), rather than in the world-readable config file
- Added automatic migration: existing CF Access credentials are moved from the old location to secure storage on first access

### Improvements

- Consolidated configuration handling into a unified `src/config/` library with clear separation between user preferences, secrets, auth credentials, and project config

## [0.4.0] - 2026-01-07

This release introduces Scratch Cloud, a complete deployment platform for hosting your static sites with project management and shareable links.

### Features

- Added `cloud` command suite for deploying and managing projects on Scratch Cloud:
  - `cloud login` / `cloud logout` / `cloud whoami` - Authentication via OAuth device flow
  - `cloud config` - Configure cloud settings including custom server URLs
  - `cloud deploy` - Build and deploy projects with automatic URL generation
  - `cloud projects list` / `info` / `delete` - Manage deployed projects
  - `cloud share` - Create time-limited share tokens for anonymous access
- Added support for Cloudflare Access service tokens for enterprise authentication

### Improvements

- Added progress messages during build (compiling pages, generating HTML, copying assets)
- Build completion now shows file count and total size of output
- Fixed memory leak in Shiki syntax highlighter by properly disposing instances when languages change

## [0.3.15] - 2026-01-07

Minor update with a layout refinement for wide page mode.

### Improvements

- Increased horizontal padding in wide page layout from 8 to 16 units for better readability

## [0.3.14] - 2026-01-07

This release adds a width toggle for switching between narrow and wide page layouts, improves dev server reliability, and introduces a global variables system for build configuration.

### Features

- Added WidthToggle component for switching between narrow (2xl) and wide (full-width) page layouts, with localStorage persistence
- Added global variables system (`__SCRATCH_BASE__`, `__SCRATCH_SSG__`) accessible in both SSR and client-side code

### Bug Fixes

- Fixed `scratch create` command failing when no path argument provided
- Fixed intermittent "file not created" and "EEXIST" errors during dev rebuilds by improving directory reset reliability
- Fixed port detection in dev server to properly notify when falling back to an alternate port
- Disabled the "Add" button in the TodoList example component when input is empty

### Improvements

- Improved build robustness with filesystem sync verification and retry logic
- Added detailed diagnostics when Tailwind CSS output file is not created
- Updated ScratchBadge to use a subtler gray color
- Improved quick start documentation in the default template
- Fixed TypeScript capitalization in README

## [0.3.13] - 2026-01-04

This release ensures the dev server always uses React development mode for better debugging.

### Bug Fixes

- Fixed `scratch dev` to use React development mode, providing full error messages and warnings instead of minified production code
- Fixed port parsing bug in dev command that caused incorrect fallback port calculation

## [0.3.12] - 2026-01-03

Minor update with template refinements.

### Improvements

- Made the ScratchBadge component smaller for a more subtle appearance

## [0.3.11] - 2026-01-03

This release fixes several routing and template issues.

### Bug Fixes

- Fixed 404 errors for routes with dots in filenames (e.g., `/test.file` now resolves correctly)
- Fixed markdown links with `.md`/`.mdx` extensions not being transformed during build
- Fixed ScratchBadge logo not loading in watch mode

### Changes

- Renamed `--no-example` flag to `--minimal` for clearer semantics
- Watch mode now uses minimal mode for clean, unbranded preview
- Fixed sticky footer layout using flexbox

## [0.3.10] - 2026-01-02

This release introduces new template components for page layouts and reorganizes the template structure for better customization.

### Features

- Added new template components: Header, Footer, Copyright, and ScratchBadge
- PageWrapper now automatically includes Header and Footer components
- Copyright component displays author name from frontmatter (available via `window.__scratch_author__`)

### Improvements

- Moved PageWrapper and layout components to `src/template/` directory for clearer organization
- Updated default page template with improved content and structure
- Added smooth rotation animation to folder toggle icons in Files component
- Refined prose styles: centered h1 headings, links only underline on hover, softer inline code styling

## [0.3.9] - 2026-01-02

This release renames the `view` command to `watch` for clearer semantics.

### Changes

- Renamed the `view` command to `watch` (the `view` alias is still available for backwards compatibility)

## [0.3.8] - 2025-12-31

This release adds expanded social media meta tag support for better sharing on platforms like Twitter/X and Facebook.

### Features

- Added new frontmatter fields for social sharing: `siteName`, `locale`, `twitterSite`, and `twitterCreator`
- Added `siteUrl` frontmatter field to automatically resolve relative image paths to absolute URLs for social sharing

### Improvements

- Template system now properly handles binary files (images, fonts) with base64 encoding

## [0.3.6] - 2025-12-29

This release improves performance for the `view` command and adds the ability to checkout internal build files.

### Improvements

- The `view` command now caches `node_modules` between runs, significantly speeding up subsequent invocations
- `scratch checkout _build` now works to eject internal build infrastructure files (entry-client.tsx, entry-server.jsx) for customization

## [0.3.5] - 2025-12-28

This release fixes a dev server stability issue and improves build error reporting.

### Bug Fixes

- Fixed dev server rebuild loop caused by file watcher timing issues

### Improvements

- Improved error messages when Bun build fails, making it easier to diagnose compilation issues
- Updated scratch logo

## [0.3.4] - 2025-12-28

This release adds support for relative image paths in MDX files and improves raw HTML handling.

### Features

- Added support for relative image paths in MDX files - images are now resolved relative to the MDX file location and transformed to absolute static routes
- Added raw HTML support in markdown content using `rehype-raw`

### Improvements

- Glob search now ignores `node_modules` directories, improving search performance in projects with dependencies
- Preview command now uses route matching for more reliable file serving
- Refactored build plugins into a modular architecture under `src/build/plugins/`

## [0.3.3] - 2025-12-27

This release focuses on internal architecture improvements and test coverage for the build pipeline.

### Improvements

- Refactored build pipeline to use explicit context passing instead of global state, improving testability
- Made parallel build step execution declarative (tailwind + server build now defined as a group in the step list)
- Simplified build step interface by removing trivial `shouldRun()` methods and the unused `BuildPhase` enum
- Steps now store their own outputs directly to pipeline state instead of returning values
- Consolidated static file copy steps (pages/ and public/) into a single step
- Extracted shared Bun.build error handling into a reusable utility

### Documentation

- Updated AGENTS.md with accurate build pipeline documentation

## [0.2.2] - 2025-12-25

This release simplifies the template structure and improves documentation.

### Improvements

- Reorganized template structure: components now live in `pages/components/` for better organization
- Added new example components (BouncingDvdLogo, Files) to showcase interactive React capabilities
- Simplified `scratch create` by removing the `--examples` flag (examples are now integrated into the default template)
- Updated README with clearer documentation on project structure and available commands
- Improved AGENTS.md with updated command documentation

### Removed

- Removed `--examples` flag from `scratch create` command
- Removed `examples` shortcut from `scratch get` command (use `scratch get pages/components` instead)

## [0.2.1] - 2025-12-25

This release improves test execution speed by enabling parallel test runs.

### Improvements

- Split e2e tests into separate files to enable parallel execution
- Added `bun run test:parallel` command to run tests concurrently (configurable via `-j` flag or `TEST_CONCURRENCY` env var)

## [0.2.0] - 2025-12-24

This release improves the CLI experience with better output formatting and sensible defaults for project creation.

### Features

- Added `scratch get` command (replaces `revert`) to clone files from built-in templates, with `revert` and `eject` as aliases
- Added `examples` shortcut: `scratch get examples` now works as an alias for `scratch get pages/examples`

### Improvements

- `scratch create` now excludes example pages by default (use `--examples` to include them)
- `scratch create` no longer overwrites an existing `package.json`
- File lists in CLI output now display as a formatted directory tree
- Simplified dependency management: builds now always use a `package.json` in the project root (auto-created if missing)

## [0.1.0] - 2025-12-24

This release includes internal refactoring for better maintainability, improved developer experience, and security hardening for HTML output.

### Improvements

- Dev server now watches the `public/` directory for changes, triggering rebuilds when static assets are modified
- Syntax highlighting now supports all languages bundled with Shiki (previously limited to a small subset)
- Confirmation prompts in `bun run pr` and `bun run release` now default to "yes" for faster workflows

### Bug Fixes

- Fixed potential XSS vulnerability by properly escaping frontmatter values when injecting meta tags into HTML
- Improved error messages when components referenced in MDX files are not found

## [0.0.9] - 2025-12-24

This release simplifies project creation with better defaults and fixes a critical build issue when dependencies need to be installed.

### Improvements

- `scratch create` now includes `src/`, examples, and `package.json` by default (use `--no-src`, `--no-examples`, `--no-package` to exclude)
- `scratch create` no longer auto-installs dependencies after project creation
- Removed interactive prompts from `scratch create` - now purely flag-based for scripting
- Removed `--minimal` and `--full` shorthand flags from create command
- `scratch revert` now prompts for confirmation before overwriting existing files
- Added `--force` flag to `scratch revert` to skip confirmation prompts
- `scratch revert package.json` now works (generates a fresh package.json)
- Improved error messages when builds fail

### Bug Fixes

- Fixed build failures that occurred when dependencies were auto-installed during the same build process
- Fixed `scratch revert` to work correctly in non-interactive environments (scripts, CI)

## [0.0.8] - 2025-12-23

This release adds a new pull request creation script and improves the reliability of the release workflow.

### Features

- Added `bun run pr` command to create GitHub pull requests with AI-generated titles and descriptions

### Improvements

- Release and PR scripts now use `--print` mode with Claude Code for cleaner output
- Added resume mode for both release and PR scripts - if interrupted, re-running the command continues from where it left off
- Improved confirmation prompts when resuming release or PR creation
- Release workflow now extracts release notes from CHANGELOG.md instead of auto-generating them

### Bug Fixes

- Fixed git status parsing in release and PR scripts to correctly handle the porcelain format
- PR script now always pushes the branch to ensure remote is up-to-date before creating PR
- PR script now explicitly specifies the repository when creating pull requests
- Fixed prompt passing to Claude Code CLI (using `-p` flag)
