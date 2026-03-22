# Changelog

## [0.5.17] - 2026-03-22

This release makes `scratch` a fully standalone binary with no external Node.js or Bun dependency required on the host system.

### Bug Fixes

- Fixed Tailwind CSS build failing on systems with old or missing Node.js. The Tailwind CLI's `#!/usr/bin/env node` shebang would invoke the system Node, which may lack APIs required by Tailwind v4 (e.g. `structuredClone`). The build step now resolves the Tailwind entry point directly and runs it via the embedded Bun runtime, removing any dependency on a system-installed Node.js or Bun.

## [0.5.16] - 2026-02-05

This release prevents conflicts when running multiple dev servers and fixes a bug with project visibility on first publish.

### Features

- Running `scratch dev` in a project where a dev server is already running now opens the browser to the existing server instead of starting a conflicting second instance. Stale lock files from crashed processes are automatically cleaned up.

### Bug Fixes

- Fixed public project visibility not being applied on first publish when set via interactive setup

## [0.5.15] - 2026-02-01

This release improves the server selection experience when publishing to multiple servers.

### Improvements

- When logged into multiple servers, the `publish` command now always prompts for server selection instead of silently using the global default
- Server selection prompt now pre-selects the global default server when set, making it faster to confirm
- Cleaner server URL display in prompts (e.g., `scratch.dev` instead of `https://app.scratch.dev`)

## [0.5.14] - 2026-02-01

This release fixes the global defaults feature to work correctly with the `publish` command.

### Bug Fixes

- Fixed `publish` command to respect global config defaults for `server_url` and `visibility` set via `scratch set-defaults`
- Fixed server URL resolution to check global config before falling back to the default server
- Fixed visibility prompt to use global default when no project-level visibility is configured

## [0.5.13] - 2026-02-01

This release adds a new command for configuring global defaults and improves cache management.

### Features

- Added `scratch set-defaults` command to configure global defaults (server URL and visibility) stored in `~/.config/scratch/config.toml`. Supports both interactive mode and non-interactive mode with `--server` and `--visibility` flags.

### Improvements

- Moved CLI cached node_modules from `~/.scratch/[version]/` to `~/.scratch/cache/[version]/` to isolate cache from other files like credentials
- Old cache versions are now automatically cleaned up when installing dependencies for a new CLI version, preventing accumulation over time

## [0.5.12] - 2026-02-01

This release fixes routing issues in the `watch` command when viewing index files.

### Bug Fixes

- Fixed `scratch watch` to open the correct route when watching a single file (e.g., watching `about.md` now opens `/about` instead of `/`)
- Fixed `scratch watch` to handle `index.md` files without conflicts from the template's `index.mdx`

## [0.5.11] - 2026-02-01

This release adds support for publishing to naked domains and includes internal code cleanup.

### Features

- Added `--www` flag to `publish` command for deploying to naked domains (e.g., `example.com` instead of `pages.example.com/user/project`). When used, the site is built without path prefixes for root-level hosting.

### Improvements

- Removed ~2,100 lines of dead code and consolidated duplicate utilities across the codebase
- Extracted shared helper functions for browser opening, port fallback, zip creation, and date formatting
- Simplified template components (TodoList, Marquis animation)
- Removed unused dependency patch for estree-util-build-jsx

## [0.5.10] - 2026-01-31

This release standardizes the CLI interface by using a consistent `--server` flag across all server commands.

### Improvements

- Standardized server URL to use `--server <url>` option flag instead of positional `[server-url]` argument for all commands (`login`, `logout`, `whoami`, `projects`, `tokens`, `share`, `cf-access`)
- Added `--server` flag to share commands (`share create`, `share ls`, `share revoke`) which previously had no server parameter
- Simplified default template with streamlined content and improved example components

## [0.5.9] - 2026-01-31

No CLI changes in this release; version bump only.

## [0.5.8] - 2026-01-31

This release adds API tokens for CI/CD automation, improves project management with rename support, and includes various UX improvements.

### Features

- **API tokens for CI/CD**: New `tokens` command group for creating and managing API tokens that work without interactive login
  - `scratch tokens create <name>` - Create a new API token (with optional `--expires <days>`)
  - `scratch tokens ls` - List your API tokens with last-used timestamps
  - `scratch tokens revoke <name>` - Revoke a token
  - `scratch tokens use <token>` - Store a token in your credentials file
  - Tokens can be used via `SCRATCH_TOKEN` environment variable, `.env` file, or credentials file
  - API tokens now work with servers behind Cloudflare Access
- **Project rename support**: Projects can now be renamed by changing the name in `.scratch/project.toml` - the CLI tracks project IDs to enable this
- **Build conflict detection**: The build now detects and reports path/URL conflicts early, before other build errors occur

### Improvements

- Commands renamed to Unix-style conventions: `projects list` → `projects ls`, `projects delete` → `projects rm`, `share list` → `share ls`
- Added `--no-open` flag to `publish` command to skip opening the browser after deploy
- Login now shows hints for creating API tokens for CI/CD use
- Token list shows when each token was last used
- Better error messages when publishing with an invalid project ID or name conflict
- Static file handling improvements: `.mdx` files are now renamed to `.md` when copied to the build output
- Removed rarely-used `--no-src`, `--no-package`, and `--minimal` flags from `scratch create`
- Removed `--static` flag from build/dev commands (static files are now always copied)

### Bug Fixes

- Fixed publish failing silently when the stored project ID no longer exists on the server

## [0.5.7] - 2026-01-21

This release fixes a conflict between the dev and build commands by using separate output directories.

### Bug Fixes

- Fixed `scratch dev` overwriting `scratch build` output: the dev server now outputs to `.scratch/dev/` instead of `dist/`, so running dev no longer clobbers your production build
- The `clean` command now also removes `.scratch/dev/`

## [0.5.6] - 2026-01-21

This release improves build error messages and ensures the server URL is always explicitly selected during publish.

### Improvements

- Improved MDX build error messages: errors now include file paths and actionable suggestions when component imports fail or server-side rendering encounters issues
- The `publish` command now always prompts for server selection when no server URL is stored in project config, making it clearer which server you're deploying to
- Updated `.gitignore` template to allow `.scratch/project.toml` to be committed to version control, so project settings can be shared with collaborators

## [0.5.5] - 2026-01-20

This release fixes the checksum file format for release artifacts.

### Bug Fixes

- Fixed checksum JSON keys to use platform names (e.g., `darwin-arm64`) instead of full filenames, making verification easier

## [0.5.4] - 2026-01-20

This release adds checksum files to CLI releases for download verification.

### Improvements

- Release artifacts now include SHA256 checksums for verifying download integrity

## [0.5.3] - 2026-01-19

This release fixes project configuration to always store the server URL.

### Bug Fixes

- Fixed `publish` command to always save the server URL in project config (`.scratch/project.toml`), ensuring projects remember which server they were published to

## [0.5.2] - 2026-01-18

This release simplifies the CLI command structure by removing the `cloud` prefix from server commands and renaming several commands for clarity.

### Breaking Changes

- Removed `cloud` command prefix: `cloud login`, `cloud logout`, `cloud whoami`, `cloud deploy`, `cloud projects`, and `cloud share` are now top-level commands
- Renamed `cloud deploy` to `publish` for clearer semantics
- Renamed `checkout` command to `eject` (the `checkout` alias has been removed)
- Removed command aliases: `view` is no longer an alias for `watch`
- Removed global config file (`~/.config/scratch/config.toml`) - server selection is now automatic

### Improvements

- Smart server URL resolution: if logged into exactly one server, it's used automatically; if logged into multiple, you're prompted to choose
- Grouped help output: commands are now organized into Local, Server, and Other categories for easier discovery
- `projects info` now displays the project ID
- `watch` command path argument is now optional (defaults to current directory)
- Better error handling when Cloudflare Access credentials are stale or invalid

## [0.5.1] - 2026-01-16

This release fixes the CLI login flow when connecting to servers protected by Cloudflare Access.

### Bug Fixes

- Fixed authentication for servers behind Cloudflare Access: the CLI now properly proceeds to browser-based login instead of failing. The browser handles CF Access authentication, then redirects back with the token.
- When existing service tokens are expired or invalid, the CLI now prompts to either update the token or use browser login instead of failing silently.

## [0.5.0] - 2026-01-14

This release migrates Scratch to a monorepo structure, laying the groundwork for tighter integration between the CLI and Scratch Cloud server.

### Improvements

- Reorganized repository into a monorepo with dedicated `cli/`, `server/`, and `shared/` packages
- Shared TypeScript types between CLI and server for better consistency
- Installation URL simplified to `https://scratch.dev/install.sh`

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
