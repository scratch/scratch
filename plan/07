# Documentation Review: website/pages/docs.mdx

## Summary

Reviewed the documentation against the actual codebase. Found 1 typo, 1 incorrect documentation, and several areas where the docs are accurate but incomplete.

---

## Issues Found

### 1. TYPO - Line 535: "oogle OAuth" → "Google OAuth"

```
*BetterAuth (default)* — Users sign in with oogle OAuth to authenticate...
```

Should be "Google OAuth".

---

### 2. INACCURATE - `--static` flag documented but not implemented

**Location:** Lines 222 and 233

The docs say `scratch dev` and `scratch build` support:
```
--static <mode>` — `public`, `assets` (default), or `all`
```

However, this flag is **not exposed in the CLI** (`cli/src/index.ts`). The option exists internally but users cannot actually use it.

**Recommendation:** Remove the `--static` option from the docs, or add it to the CLI.

---

### 3. INCOMPLETE - Build pipeline steps

**Location:** Lines 392-399

Documentation lists 8 steps:
1. Dependencies
2. MDX Compilation
3. Tailwind
4. Server Build
5. Client Build
6. HTML Generation
7. Static Assets
8. Output

Actual implementation (`cli/src/build/orchestrator.ts`) has additional steps:
- `reset-directories` - cleans output directories
- `check-conflicts` - checks for component name conflicts
- `create-tsx-entries` - creates MDX entry points
- `render-server` - renders server modules to HTML
- `inject-frontmatter` - injects frontmatter as meta tags

**Recommendation:** The current docs are a reasonable simplification for users. Consider adding a note that these are the high-level steps.

---

### 4. INCOMPLETE - Missing rehype plugin

**Location:** Lines 407-411

Documentation lists 4 rehype plugins but omits `rehype-link-paths` which transforms internal link paths to include the base path.

**Recommendation:** Add `rehype-link-paths — Transform relative link paths` to the list.

---

### 5. INCOMPLETE - Error codes

**Location:** Lines 663-676

Documentation lists 10 error codes. The API actually returns 20 error codes.

Missing error codes:
- `INVALID_PARAMS` - Invalid query parameters
- `SYMLINK_NOT_ALLOWED` - Symbolic links in zip
- `INVALID_PATH` - Invalid file path in archive
- `EXTRACTED_TOO_LARGE` - Possible zip bomb detected
- `EMPTY_DEPLOY` - Empty zip file
- `INVALID_REQUEST` - Generic invalid request
- `SHARE_TOKENS_DISABLED` - Feature disabled on server
- `SHARE_TOKEN_NAME_INVALID` - Invalid token name
- `SHARE_TOKEN_DURATION_INVALID` - Invalid duration
- `SHARE_TOKEN_ALREADY_REVOKED` - Token already revoked

**Recommendation:** Add these error codes to the table for completeness.

---

### 6. POTENTIAL ISSUE - GitHub repository URL

**Location:** Lines 680-681

```
point your favorite coding agent at [our repo](https://github.com/scratch/scratch)
```

The URL `https://github.com/scratch/scratch` appears to be a placeholder. Verify this is the correct repository URL before launch.

---

## Verified as Accurate

The following were verified as correct:

- All CLI commands exist and are correctly named
- Global flags (`-v`, `-q`, `--show-bun-errors`, `--version`, `--help`)
- Default port 5173 for dev server
- `--highlight` options: `off`, `popular`, `auto`, `all`
- Reserved project names list
- Project name validation (3-63 chars, lowercase, letters/numbers/hyphens)
- Login timeout default (10 minutes)
- All API endpoints match implementation
- All documented error codes are correct (just incomplete)
- Share token durations: `1d`, `1w`, `1m`
- `scratch projects` subcommands: `ls`, `info`, `rm`
- All remark plugins are correct

---

## Note: README.md vs docs.mdx discrepancy

README.md uses `scratch checkout` but the CLI and docs.mdx use `scratch eject`. The README appears outdated.
