# Release Skill

Release CLI or server versions with proper tagging and versioning.

## CLI Release

```bash
bun ops cli release [patch|minor|major]
```

This:
1. Bumps version in `cli/package.json`
2. Creates git tag `cli-v<version>` (e.g., `cli-v1.2.3`)
3. Pushes tag to trigger release workflow

## Server Release

```bash
bun ops server release [patch|minor|major]
```

This:
1. Bumps version in `server/package.json`
2. Creates git tag `server-v<version>` (e.g., `server-v1.2.3`)
3. Pushes tag to trigger release workflow

## Version Bump Guidelines

- **patch** - Bug fixes, minor improvements (most common)
- **minor** - New features, non-breaking changes
- **major** - Breaking changes to CLI commands or API

## Pre-Release Checklist

Before releasing:

1. **Run integration tests** to verify changes work:
   ```bash
   bun ops server -i staging test
   ```

2. **Check for uncommitted changes**:
   ```bash
   git status
   ```

3. **Review recent commits** to determine bump level:
   ```bash
   git log --oneline -10
   ```

## Git Workflow Commands

These use AI to generate commit messages and PR descriptions:

```bash
bun ops commit    # Commit all changes with AI-generated message
bun ops pr        # Create PR with AI-generated description
```
