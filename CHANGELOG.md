# Changelog

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
