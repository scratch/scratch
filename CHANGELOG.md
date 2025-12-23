# Changelog

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
