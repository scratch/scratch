# Block 7 Review: Documentation & Skills Refactoring

**Reviewer:** Claude Opus 4.5
**Date:** 2026-01-31
**Risk Level:** Low

## 1. Summary

This block refactors documentation by moving procedural knowledge from `CLAUDE.md` files into dedicated skills under `.claude/skills/`, updates the README with website landing page content, and creates a new `server/CLAUDE.md` with a prominent security model section. The changes improve discoverability of operational knowledge by organizing it into invokable skills while keeping the root `CLAUDE.md` focused on architecture and concepts.

**Key Changes:**
- Created three skills: `cli-dev`, `ops`, and `release`
- Simplified root `CLAUDE.md` by moving command listings to skills
- Created `server/CLAUDE.md` with security model documentation
- Updated README with Scratch capabilities and quick start guide
- Synced `website/CLAUDE.md` with `cli/template/AGENTS.md`

**Current State Note:** The skills have been moved from `.claude/skills/*.md` to `.claude/skills/*/SKILL.md` (subdirectory format) but this change is not yet committed. The working directory shows deleted `.md` files and new subdirectories as untracked.

## 2. Files Reviewed

| File | Purpose | Lines |
|------|---------|-------|
| `CLAUDE.md` | Root agent instructions, architecture overview | 207 |
| `README.md` | Project overview and quick start for users | 147 |
| `.claude/skills/cli-dev/SKILL.md` | CLI development patterns and workflows | 71 |
| `.claude/skills/ops/SKILL.md` | Server deployment and ops commands | 101 |
| `.claude/skills/release/SKILL.md` | Version bumping and release process | 60 |
| `cli/CLAUDE.md` | Detailed CLI architecture documentation | 182 |
| `server/CLAUDE.md` | Server architecture and security model | 123 |
| `website/CLAUDE.md` | Website-specific Scratch project docs | 280 |
| `cli/template/AGENTS.md` | Template for new Scratch projects | 278 |

## 3. Answers to Review Questions

### Question 1: Are the skills correctly invokable?

**Answer: Yes, with a caveat regarding the uncommitted file restructuring.**

The skills are structured correctly for invocation:
- Each skill has a clear name that matches its file/directory name
- The content is self-contained with executable commands
- Skills are referenced in the root `CLAUDE.md` under the "Skills" section

**Evidence from `CLAUDE.md` (lines 43-49):**
```markdown
## Skills

Use these skills for common operations:

- **ops** - Server deployment, database operations, testing commands
- **release** - Version bumps and releases for CLI and server
- **cli-dev** - Patterns for CLI development
```

**Uncommitted Change:** The skills have been moved from `.claude/skills/ops.md` to `.claude/skills/ops/SKILL.md` format. Git status shows:
```
deleted:    .claude/skills/cli-dev.md
deleted:    .claude/skills/ops.md
deleted:    .claude/skills/release.md
Untracked files:
    .claude/skills/cli-dev/
    .claude/skills/ops/
    .claude/skills/release/
```

The content is identical between the old and new locations, but the change needs to be committed for the new structure to be official.

### Question 2: Is any important information missing from the new structure?

**Answer: No significant information is missing, but there are some gaps and inconsistencies.**

**Information successfully preserved:**
- Complete ops commands in `ops` skill
- Release process and pre-release checklist in `release` skill
- CLI development patterns and documentation sync checklist in `cli-dev` skill
- Security model prominently featured in `server/CLAUDE.md`
- Authentication architecture detailed in root `CLAUDE.md`

**Minor gaps identified:**

1. **Token commands missing from skills:** The new `scratch tokens` commands (create, ls, revoke, use) are documented in `cli/CLAUDE.md` but not in any skill. If token management is a common workflow, it could benefit from skill coverage.

2. **CLI commands `checkout` vs `eject` inconsistency:** The root `CLAUDE.md` references `scratch checkout` (line 33: "Key commands: `scratch create`, `scratch build`, `scratch dev`, `scratch publish`, `scratch projects`") but `cli/CLAUDE.md` documents both `eject` (line 20-23) and `config` commands that aren't mentioned in the root.

3. **Shared types documentation duplicated:** Both root `CLAUDE.md` (lines 198-206) and `cli/CLAUDE.md` could reference shared types, but they're only in the root. This is fine for separation of concerns.

## 4. Code Quality Assessment

### Simplicity

**Rating: Good**

The refactoring follows a clear pattern:
- Conceptual/architectural knowledge stays in `CLAUDE.md` files
- Procedural/operational knowledge moves to skills
- Each skill has a focused, single-purpose scope

The three-skill structure (ops, release, cli-dev) covers the main workflows without over-fragmenting.

### Clarity

**Rating: Good**

Documentation is well-structured with consistent formatting:
- Clear headers and sections
- Code examples with context
- Tables for command references (e.g., "Deploy vs Config Push" table in ops skill)

**Example of good clarity (ops skill, lines 90-100):**
```markdown
## Deploy vs Config Push

**Important:** `deploy` and `config push` serve different purposes. Use the right one for the job.

| Change Type | Command |
|-------------|---------|
| Code changes | `deploy` |
| Route changes (wrangler config) | `deploy` |
| Environment variable changes | `config push` only |
| Both routes AND env vars | `deploy` then `config push` |
```

### Correctness

**Rating: Good**

Commands and file paths verified to match actual codebase:
- Build steps in `cli-dev` skill match `cli/src/build/steps/` directory
- Ops commands match `ops/commands/` implementations
- Release workflow matches `ops/commands/cli.ts` and `ops/commands/server/release.ts`

### Consistency

**Rating: Good with minor issues**

**Positive:**
- Consistent voice and formatting across all documentation
- Skills follow the same structure pattern
- `website/CLAUDE.md` and `cli/template/AGENTS.md` are nearly identical (as intended)

**Minor inconsistency:**
- `website/CLAUDE.md` has an extra "Note" block at line 5 explaining it's the dogfooding site
- `cli/template/AGENTS.md` doesn't have this note (correctly, since it's a template)

### Security

**Rating: Excellent**

The security documentation is comprehensive and prominently placed:

**Server CLAUDE.md security section (lines 7-52):**
- Clear "READ THIS FIRST" warning
- Explicit security invariants (3 total)
- Attack scenarios explained
- Token URL cleanup defense-in-depth documented
- "When Modifying Auth Code" checklist

**Example of good security documentation (server/CLAUDE.md, lines 14-28):**
```markdown
### Security Invariants

1. **No shared cookies**: Session cookies are scoped to the app domain only (`app.*`), never `*.example.com`. Sharing cookies would let malicious JS make authenticated API requests.

2. **Project-scoped content tokens**: Content tokens (for private content access) are scoped to a single project. A token for project A cannot access project B. User-scoped tokens would let an attacker on project A steal access to all of a victim's private projects.

3. **CORS policy**: API endpoints must not allow content domain origins in `Access-Control-Allow-Origin`.
```

## 5. Issues Found

### Critical Issues
None

### High Severity Issues
None

### Medium Severity Issues

1. **Uncommitted skill restructuring**
   - **Location:** `.claude/skills/`
   - **Description:** Skills have been moved from `*.md` files to `*/SKILL.md` subdirectories but this change is not committed. The git status shows deleted files and untracked directories.
   - **Impact:** The old file paths are referenced in the commit history, which could cause confusion.
   - **Recommendation:** Commit the skill restructuring or revert to the flat file structure.

### Low Severity Issues

1. **Missing newline at end of README.md**
   - **Location:** `README.md` line 147
   - **Description:** File doesn't end with a newline character.
   - **Recommendation:** Add trailing newline for POSIX compliance.

2. **Website CLAUDE.md/AGENTS.md sync is partial**
   - **Location:** `website/CLAUDE.md` vs `cli/template/AGENTS.md`
   - **Description:** The commit message says "Sync website/CLAUDE.md with cli/template/AGENTS.md" but `website/CLAUDE.md` has an extra note block at line 5 that `cli/template/AGENTS.md` doesn't have.
   - **Impact:** Minimal - the note is appropriate for the website but not for the template.
   - **Recommendation:** This is actually correct behavior; the note explains this is dogfooding. The commit message could be clearer that "sync" means "based on" rather than "identical to".

3. **CLI CLAUDE.md references old command name**
   - **Location:** `cli/CLAUDE.md` line 104
   - **Description:** References `src/cmd/checkout.ts` but the command was renamed to `eject` per Block 5 changes.
   - **Impact:** Misleading documentation.
   - **Recommendation:** Verify if the file was renamed or if the reference should be `src/cmd/eject.ts`.

4. **Root CLAUDE.md key commands list incomplete**
   - **Location:** `CLAUDE.md` line 33
   - **Description:** Key commands list shows `scratch create`, `scratch build`, `scratch dev`, `scratch publish`, `scratch projects` but omits commonly used commands like `scratch login`, `scratch tokens`, `scratch whoami`.
   - **Impact:** New contributors might not discover auth-related commands.
   - **Recommendation:** Either expand the list or add "(see `scratch --help` for full list)".

## 6. Recommendations

### Required Before Launch

1. **Commit the skill restructuring**
   - Either commit the move to `.claude/skills/*/SKILL.md` format, OR
   - Revert to the flat `.claude/skills/*.md` format
   - The current state with deleted files and untracked directories is inconsistent

### Nice-to-Have

1. **Add trailing newline to README.md**
   - Minor POSIX compliance fix

2. **Update `cli/CLAUDE.md` command reference**
   - Line 104: Verify `checkout.ts` vs `eject.ts` naming

3. **Consider adding tokens skill or section**
   - API token management is a new feature that could benefit from skill-level documentation

### Future Considerations

1. **Consider skill discovery mechanism**
   - Currently skills are listed manually in root `CLAUDE.md`
   - Could add a comment in each skill file that describes when it should be invoked

2. **Documentation generation/validation**
   - As the codebase grows, consider automated validation that docs match actual commands

## 7. Conclusion

The documentation refactoring is well-executed and improves the organization of operational knowledge. The separation between conceptual documentation (CLAUDE.md files) and procedural skills is clear and consistent.

**Key strengths:**
- Security model is prominently featured and comprehensive
- Skills cover the main operational workflows
- README provides a good introduction to Scratch
- Documentation is consistently formatted

**Primary concern:**
- The uncommitted skill restructuring (flat files to subdirectories) should be resolved before merge

**Recommendation:** Approve with the condition that the skill file structure is committed in its final form. The documentation quality is high and serves both human developers and AI agents effectively.
