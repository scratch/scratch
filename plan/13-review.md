# Code Review Plan for launch-bf Branch

This document organizes all changes in the `launch-bf` branch into logical blocks for thorough code review. Each block should be reviewed for simplicity, clarity, correctness, consistency, and security.

## Review Blocks Overview

| Block | Topic | Risk Level | Estimated Files |
|-------|-------|------------|-----------------|
| 1 | API Tokens & Authentication | **High** | ~15 files |
| 2 | Security: Project Enumeration Prevention | **High** | ~5 files |
| 3 | Content Token URL Cleanup | **Medium** | ~3 files |
| 4 | Static Assets & Conflict Detection | **Medium** | ~10 files |
| 5 | CLI Command Simplification | **Low** | ~8 files |
| 6 | Website Addition | **Low** | ~35 files |
| 7 | Documentation & Skills Refactoring | **Low** | ~15 files |
| 8 | Integration Tests | **Medium** | ~5 files |

## Progress Checklist

- [x] Block 1: API Tokens & Authentication
- [x] Block 2: Security - Project Enumeration Prevention
- [ ] Block 3: Content Token URL Cleanup
- [ ] Block 4: Static Assets & Conflict Detection
- [ ] Block 5: CLI Command Simplification
- [ ] Block 6: Website Addition
- [ ] Block 7: Documentation & Skills Refactoring
- [ ] Block 8: Integration Tests

---

## Block 1: API Tokens & Authentication

**Risk Level: High** — Security-critical authentication code

### Summary
Adds API token support for CI/CD and automation. Includes:
- BetterAuth apiKey plugin integration
- New `scratch tokens` CLI commands (create, ls, revoke, use)
- X-Api-Key header support in request handling
- Cloudflare Access + API token compatibility
- Database migration for apikey table

### Review Focus
- Verify token hashing (tokens stored hashed, only shown once)
- Check API tokens are NOT valid on content domain (security invariant)
- Verify X-Api-Key vs Bearer header handling is correct
- Review token expiration and validation logic
- Check Cloudflare Access service token integration

### Files to Review
```
server/src/auth.ts                           # BetterAuth apiKey plugin config
server/src/db/migrations/002_add_api_key_table.sql  # Schema
server/src/lib/api-helpers.ts                # getAuthenticatedUser changes
cli/src/cmd/cloud/tokens.ts                  # All token commands (NEW)
cli/src/cloud/request.ts                     # Header building logic
cli/src/config/types.ts                      # Credential type changes
cli/src/config/credentials.ts                # Token storage (if changed)
cli/src/cmd/cloud/auth.ts                    # cf-access command changes
cli/src/index.ts                             # tokens subcommand registration
```

### Key Commits
```
0002d05 Support API tokens with Cloudflare Access authentication
7c6ed22 Add API token support for CLI and server
e71e468 Improve API token documentation and add security test
```

### Questions to Answer
1. Can an API token be used to access the content domain?
2. What happens if both SCRATCH_TOKEN env var and stored credentials exist?
3. Are API tokens properly hashed before storage?
4. Is the max expiration (365 days) enforced server-side?

---

## Block 2: Security - Project Enumeration Prevention

**Risk Level: High** — Security-critical behavior change

### Summary
Changes non-existent project handling to prevent enumeration attacks. Previously, non-existent projects returned 404. Now they redirect to auth (same as private projects), so attackers cannot distinguish "doesn't exist" from "private".

### Review Focus
- Verify 404 is never returned for non-existent projects on content domain
- Check synthetic project ID generation is deterministic
- Verify public projects still serve directly (no redirect)
- Review auth flow for non-existent projects (should fail gracefully)

### Files to Review
```
server/src/routes/pages.ts                   # Main logic changes
server/src/lib/content-serving.ts            # buildContentAccessRedirect export
server/src/routes/app/auth.ts                # content-access error handling
ops/commands/server/test.ts                  # Integration test for enumeration
```

### Key Commits
```
8bbce08 Improve security for non-existent project handling
```

### Questions to Answer
1. Does the synthetic ID leak any information about the project path?
2. What error does the user see after auth for a non-existent project?
3. Could an attacker use timing differences to enumerate?

---

## Block 3: Content Token URL Cleanup

**Risk Level: Medium** — Defense-in-depth security measure

### Summary
Cleans content tokens and share tokens from URLs via server-side redirect. After validating a token and setting a cookie, the server redirects to the same URL without the token parameter.

### Review Focus
- Verify redirect preserves all other URL components (path, hash, other params)
- Check cookie is set before redirect
- Verify both `_ctoken` and `token` params are cleaned

### Files to Review
```
server/src/routes/pages.ts                   # Redirect logic
server/src/lib/content-serving.ts            # Token handling changes
```

### Key Commits
```
5096fb5 Add content token URL cleanup via server-side redirect
```

### Questions to Answer
1. Does the redirect work correctly with fragment identifiers (#)?
2. Are there any edge cases where the token might not be cleaned?

---

## Block 4: Static Assets & Conflict Detection

**Risk Level: Medium** — Build system changes

### Summary
Improves static asset handling and adds conflict detection:
- New build step `02b-check-conflicts.ts` to detect URL conflicts between MDX pages and static files
- Improved static file copying from pages/ directory
- .mdx to .md redirect on server
- MIME type handling for .md, .txt, .sh files

### Review Focus
- Verify conflict detection catches all cases (path conflicts, URL conflicts)
- Check .mdx → .md rename logic in CLI and redirect on server
- Verify static files don't overwrite compiled HTML

### Files to Review
```
cli/src/build/steps/02b-check-conflicts.ts   # Conflict detection (NEW)
cli/src/build/steps/09-copy-static.ts        # Static copy changes
cli/src/build/steps/index.ts                 # Step registration
cli/src/build/orchestrator.ts                # Pipeline changes
server/src/routes/pages.ts                   # .mdx redirect
server/src/lib/files.ts                      # MIME type changes
cli/test/unit/conflict-detection.test.ts     # Unit tests
cli/test/e2e/static-assets.test.ts           # E2E tests
cli/test/e2e/static-conflicts.test.ts        # Conflict tests
```

### Key Commits
```
7736fbc Improve static assets handling and add conflict detection
```

### Questions to Answer
1. Does conflict detection handle all file extension combinations?
2. What's the user experience when a conflict is detected?
3. Are the error messages clear and actionable?

---

## Block 5: CLI Command Simplification

**Risk Level: Low** — User-facing API changes

### Summary
Two sets of changes:
1. Rename commands to Unix-style: `list` → `ls`, `delete` → `rm`
2. Remove flags from `scratch create`: `--no-src`, `--no-package`, `--minimal`

### Review Focus
- Verify old command names don't silently fail
- Check help text is updated
- Verify create command still works correctly

### Files to Review
```
cli/src/index.ts                             # Command definitions
cli/src/cmd/create.ts                        # Simplified create
cli/src/template.ts                          # Template changes
cli/template/src/template/PageWrapper.jsx    # Simplified wrapper
cli/template/src/template/WidthToggle.jsx    # Removed
cli/test/e2e/create-minimal.test.ts          # Removed test
```

### Key Commits
```
04f754c Rename CLI commands to Unix-style ls and rm
69df3e5 Remove --no-src, --no-package, and --minimal flags from scratch create
174ecad Remove width toggle from default template
```

### Questions to Answer
1. Are there any docs or tutorials that reference old command names?
2. Is the default template still useful without the options?

---

## Block 6: Website Addition

**Risk Level: Low** — New content, dogfooding

### Summary
Adds the Scratch documentation website as a Scratch project in the monorepo (`website/` directory). This is dogfooding - the website is built using Scratch itself.

### Review Focus
- Verify website builds correctly
- Check documentation accuracy
- Review any custom components

### Files to Review
```
website/CLAUDE.md                            # Website instructions
website/pages/docs.mdx                       # Main documentation
website/pages/index.mdx                      # Landing page
website/pages/install.md                     # Installation docs
website/pages/components/*.tsx               # Custom components
website/src/template/PageWrapper.jsx         # Layout
ops/commands/website.ts                      # Publish command
```

### Key Commits
```
e84a4a8 Add website to monorepo
fa7803a Add example inline components and fix website content
6c7955f Add install.md for Claude Code installation
```

### Questions to Answer
1. Is the documentation accurate and up-to-date?
2. Are there any broken links or examples?
3. Does the website demonstrate Scratch capabilities well?

---

## Block 7: Documentation & Skills Refactoring

**Risk Level: Low** — Documentation restructuring

### Summary
- Moves CLAUDE.md content into `.claude/skills/` directories
- Updates README with landing page content
- Various documentation fixes

### Review Focus
- Verify skills are complete and accurate
- Check CLAUDE.md is still useful
- Review server/CLAUDE.md security documentation

### Files to Review
```
CLAUDE.md                                    # Updated root instructions
README.md                                    # New content
.claude/skills/cli-dev/SKILL.md              # CLI dev skill
.claude/skills/ops/SKILL.md                  # Ops skill
.claude/skills/release/SKILL.md              # Release skill
cli/CLAUDE.md                                # CLI documentation
server/CLAUDE.md                             # Server + security docs
```

### Key Commits
```
10d393d Refactor CLAUDE.md content into skills
9e0f5cc Update README with content from website landing page
6d203ea Fix documentation inaccuracies in docs.mdx
```

### Questions to Answer
1. Are the skills correctly invokable?
2. Is any important information missing from the new structure?

---

## Block 8: Integration Tests

**Risk Level: Medium** — Test infrastructure

### Summary
Significantly expands integration test coverage:
- Tests for static file serving (MIME types, .mdx redirect)
- Tests for project enumeration prevention
- Tests for API token authentication
- Project ID persistence tests
- Conditional auth variable tests

### Review Focus
- Verify tests actually test what they claim
- Check for false positives (tests that pass when they shouldn't)
- Review test isolation and cleanup

### Files to Review
```
ops/commands/server/test.ts                  # Main integration tests
ops/commands/server/setup.ts                 # Setup flow changes
ops/lib/config.ts                            # Config parsing
ops/test/config.test.ts                      # Config tests
cli/test/e2e/static-assets.test.ts           # Static file tests
cli/test/e2e/static-conflicts.test.ts        # Conflict tests
server/test/validate-env.test.ts             # Env validation tests
```

### Key Commits
```
3c1f2b0 Fix integration tests and add --no-open flag to publish command
eedd0e4 Add integration tests for project ID persistence
a1dbefc Optimize integration test to use config push instead of redeploy
a7f7197 Add conditional auth variable prompts in setup flow
```

### Questions to Answer
1. Do the tests run reliably (no flaky tests)?
2. Is there adequate coverage for security-critical paths?
3. Are API token tests testing the right things?

---

## Review Order Recommendation

1. **Block 1: API Tokens** — Start with highest-risk security code
2. **Block 2: Project Enumeration** — Second security-critical area
3. **Block 3: Content Token URL Cleanup** — Completes security review
4. **Block 8: Integration Tests** — Review test coverage for above
5. **Block 4: Static Assets** — Medium complexity build changes
6. **Block 5: CLI Simplification** — Low risk, quick review
7. **Block 6: Website** — Review documentation accuracy
8. **Block 7: Docs & Skills** — Final documentation check

---

## How to Review Each Block

For each block, a future Claude Code session should:

1. Read all listed files completely
2. Run relevant tests: `bun ops server -i staging test`
3. Answer the "Questions to Answer" section
4. Check for:
   - **Simplicity**: Is this the simplest solution?
   - **Clarity**: Is the code easy to understand?
   - **Correctness**: Does it handle edge cases?
   - **Consistency**: Does it match existing patterns?
   - **Security**: Are there any vulnerabilities?
5. Document any concerns or suggested changes
