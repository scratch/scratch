# Plan: Transition CLAUDE.md Content to Skills

## Current State

### CLAUDE.md Files (Excluding cli/template/)

1. **Root `/CLAUDE.md`** (comprehensive, ~300 lines)
   - Repository structure overview
   - CLI overview (references cli/CLAUDE.md)
   - Instance-based configuration
   - Key commands (`bun ops ...`)
   - Testing instructions (integration tests, CLI tests)
   - Environment variables
   - Authentication architecture (detailed security rationale)
   - Shared types

2. **`/cli/CLAUDE.md`** (detailed, ~210 lines)
   - CLI commands with flags
   - Build pipeline architecture (12 steps)
   - Component resolution
   - Template system internals
   - Testing patterns
   - Common patterns (adding commands, modifying build)

3. **`/website/CLAUDE.md`** (~255 lines)
   - User-facing documentation about scratch projects
   - MDX authoring guide
   - Component usage
   - Styling with Tailwind
   - (This is end-user documentation, similar to what goes in cli/template/)

### Problems with Current Approach

1. **Large context overhead**: Root CLAUDE.md is always loaded, even for simple tasks
2. **Procedural knowledge buried in prose**: Commands like "how to run integration tests" are embedded in paragraphs
3. **No task-specific guidance**: Agent must parse entire document to find relevant instructions
4. **Duplication risk**: Same operational commands documented in multiple places

## Proposed Skills

Skills should encapsulate **procedural, task-specific knowledge** that agents need to execute discrete workflows. Keep **architectural understanding and security rationale** in CLAUDE.md.

### 1. `scratch-test` - Run integration or CLI tests

**Trigger examples:**
- "Run integration tests"
- "Test against staging"
- "Run CLI tests"
- "Verify my changes work"

**Skill provides:**
- Commands: `bun ops server -i <instance> test`, `bun ops cli test`
- How to view logs (`logs/<instance>.log`)
- What the integration test does (builds CLI, deploys, creates project, verifies)
- When to use which test type

### 2. `scratch-deploy` - Deploy server to an instance

**Trigger examples:**
- "Deploy to staging"
- "Deploy server"
- "Push to prod"

**Skill provides:**
- Commands: `bun ops server -i <instance> deploy`
- Pre-deploy checklist (run tests, check config)
- How to tail logs after deploy
- Warning about prod deployments

### 3. `scratch-db` - Database operations

**Trigger examples:**
- "Run migrations"
- "Query the database"
- "Check database tables"

**Skill provides:**
- Commands: `migrate`, `tables`, `query`, `drop-all`
- Warning about destructive operations in prod
- How to find schema.sql

### 4. `scratch-release` - Release CLI or server

**Trigger examples:**
- "Release CLI"
- "Bump server version"
- "Create a release"

**Skill provides:**
- Commands: `bun ops cli release [patch|minor|major]`
- Commands: `bun ops server release [patch|minor|major]`
- What tags are created
- When to use which bump level

### 5. `scratch-cli-dev` - CLI development patterns

**Trigger examples:**
- "Add a new CLI command"
- "Modify the build pipeline"
- "Add a template file"

**Skill provides:**
- File locations for commands, build steps, templates
- Step-by-step patterns for common tasks
- Testing workflow after changes

## What Stays in CLAUDE.md

### Root CLAUDE.md (Simplified)

Keep:
- Repository structure overview (essential context)
- Authentication architecture (security rationale - agents MUST understand this before modifying auth code)
- Instance-based configuration concept
- Shared types import paths
- Links to skills for procedural tasks

Remove:
- Detailed command listings (move to skills)
- Testing instructions (move to `scratch-test` skill)
- Step-by-step procedures

### cli/CLAUDE.md

Keep:
- Build pipeline architecture overview
- Component resolution explanation
- Template system architecture
- File structure and purpose

Remove:
- Testing the default template (move to `scratch-test` skill)
- Common patterns for adding commands (move to `scratch-cli-dev` skill)

### server/CLAUDE.md (New)

Create a new `server/CLAUDE.md` with a prominent security section. The root CLAUDE.md covers auth architecture, but server-specific security invariants should live closer to the code.

**Security Invariants to Document:**

```markdown
# Security Model

## Critical: Content Domain Isolation

The content domain (`pages.*`) serves **untrusted, user-submitted JavaScript**.
Any visitor to a malicious project could have attacker-controlled JS running in their browser.

### Security Invariants

1. **No shared cookies**: Session cookies are scoped to the app domain only (`app.*`),
   never `*.example.com`. Sharing cookies would let malicious JS make authenticated
   API requests.

2. **Project-scoped content tokens**: Content tokens (for private project access)
   are scoped to a single project. A token for project A cannot access project B.
   User-scoped tokens would let an attacker on project A steal access to all of
   a victim's private projects.

3. **CORS policy**: API endpoints must not allow content domain origins in
   Access-Control-Allow-Origin.

### Attack Scenarios to Prevent

- Attacker uploads malicious JS to their project
- Victim visits attacker's project while logged in
- Malicious JS attempts to:
  - Read victim's session cookie → BLOCKED (cookie not shared)
  - Make API requests to app domain → BLOCKED (CORS + no cookie)
  - Use victim's content token for other projects → BLOCKED (project-scoped)

### When Modifying Auth Code

Before changing authentication, content tokens, or cookie handling:
1. Re-read this security model
2. Verify changes don't violate these invariants
3. Consider: "If a user visits a malicious project, what can the attacker do?"
```

This should be the first thing an agent sees when working on server code.

### website/CLAUDE.md

Keep as-is. The `website/` directory is itself a Scratch project (scaffolded via `scratch create`) that gets published to scratch.dev. This file matches `cli/template/AGENTS.md` intentionally - it provides the same guidance any Scratch project would have.

**Clarification needed:** Both `website/CLAUDE.md` and root `CLAUDE.md` should explicitly note that:
- `website/` is a Scratch project (dogfooding)
- `website/CLAUDE.md` documents how to work with that project as a Scratch site
- This is distinct from contributing to the Scratch CLI/server codebase

## Implementation Steps

### Phase 1: Create Skills Directory Structure

```
.claude/
└── skills/
    ├── scratch-test.md
    ├── scratch-deploy.md
    ├── scratch-db.md
    ├── scratch-release.md
    └── scratch-cli-dev.md
```

### Phase 2: Write Skill Files

Each skill file should include:
1. Brief description of what the skill handles
2. Exact commands with examples
3. Expected outputs
4. Common errors and solutions
5. Safety warnings where applicable

Example structure for `scratch-test.md`:
```markdown
# Scratch Test Skill

Run integration tests or CLI tests for the scratch project.

## Integration Tests

Test against a deployed instance:
```bash
bun ops server -i staging test
```

This:
1. Builds the CLI
2. Runs migrations
3. Deploys server
4. Creates test project
5. Verifies deployment
6. Cleans up

View logs during/after test:
```bash
cat logs/staging.log
```

## CLI Tests

```bash
bun ops cli test        # All tests
bun ops cli test:unit   # Unit only
bun ops cli test:e2e    # E2E only
```
```

### Phase 3: Update CLAUDE.md Files

1. Add skill references to root CLAUDE.md
2. Remove procedural content that's now in skills
3. Keep architectural explanations
4. Simplify cli/CLAUDE.md similarly

### Phase 4: Create server/CLAUDE.md

Create `server/CLAUDE.md` with:
1. Security Model section (invariants, attack scenarios, modification checklist)
2. Server architecture overview
3. Route organization
4. Reference to root CLAUDE.md for auth flow details

Update root CLAUDE.md to reference server/CLAUDE.md for security invariants.

### Phase 5: Clarify website/ Documentation

Update both files to clarify the relationship:

1. **Root CLAUDE.md**: Add note in Repository Structure that `website/` is itself a Scratch project (dogfooding) published to scratch.dev

2. **website/CLAUDE.md**: Add header clarifying this is a Scratch project and pointing to root CLAUDE.md for repo-wide contribution guidance

## Migration Notes

- Skills should be self-contained - agent shouldn't need to read CLAUDE.md to execute a skill
- CLAUDE.md provides "why" and architecture; skills provide "how"
- Authentication section MUST stay in CLAUDE.md - it's security-critical context, not a procedure
- Test the skills by asking an agent to perform tasks and verifying it finds the right information

## Documentation Sync Policy

### The Problem

CLI functionality is documented in multiple places:

| Document | Audience | Location |
|----------|----------|----------|
| `website/pages/docs.mdx` | End users | Published to scratch.dev |
| `cli/template/AGENTS.md` | AI agents | Copied into new projects |
| `cli/CLAUDE.md` | Contributors | Repo-internal |

When CLI behavior changes, all relevant docs must be updated. Currently there's no enforcement of this.

### Proposed Policy

**When modifying CLI functionality, update these documents:**

1. **`cli/CLAUDE.md`** - If adding/changing commands, build steps, or architecture
2. **`website/pages/docs.mdx`** - If the change affects user-facing behavior
3. **`cli/template/AGENTS.md`** - If the change affects how agents should use scratch in projects

This policy should be:
- Documented in `cli/CLAUDE.md` under "Common Patterns"
- Reinforced in the `scratch-cli-dev` skill
- Potentially enforced via a pre-commit hook or PR checklist

### On Combining docs.mdx and AGENTS.md

These serve different audiences with different needs:

**docs.mdx (users):**
- Comprehensive explanations
- Visual examples, screenshots
- Marketing-friendly language
- Covers edge cases, troubleshooting

**AGENTS.md (AI agents):**
- Concise, action-oriented
- Focuses on "what works" not "why"
- Structured for quick parsing
- Omits obvious details agents can infer

**Recommendation:** Keep them separate but maintain a clear sync policy. The cognitive overhead of keeping two docs in sync is lower than the complexity of a generation system, and each doc can be optimized for its audience.

A `scratch-cli-dev` skill can include a checklist:
```
When modifying CLI:
- [ ] Update cli/CLAUDE.md if architecture changed
- [ ] Update website/pages/docs.mdx if user-facing behavior changed
- [ ] Update cli/template/AGENTS.md if project usage patterns changed
```

## Questions to Resolve

1. **Skill discovery**: How do agents know which skills exist? Need to document in root CLAUDE.md or rely on Claude Code's skill listing?

2. **Skill invocation**: Should these be user-invocable (`/scratch-test`) or automatically triggered based on context?

3. **Granularity**: Is `scratch-deploy` separate enough from `scratch-test` (which also deploys)? Consider merging into `scratch-ops`?

4. **Doc sync enforcement**: Is a manual policy (documented in CLAUDE.md + skill checklist) sufficient, or should we add automated enforcement (pre-commit hook that detects CLI changes and warns about docs)?
