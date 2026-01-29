# Plan: Rename `list` and `delete` Commands to `ls` and `rm`

## Overview

Rename the `projects` and `share` subcommands to use shorter, Unix-style names:
- `projects list` → `projects ls`
- `projects delete` → `projects rm`
- `share list` → `share ls`

Note: `share revoke` stays as-is.

## Files to Modify

### 1. Command Registration (`cli/src/index.ts`)

Update the Commander.js command definitions:

**Projects commands (around lines 265-297):**
```typescript
// Before
projects.command('list', { isDefault: true })
projects.command('delete')

// After
projects.command('ls', { isDefault: true })
projects.command('rm')
```

**Share commands (around lines 299-338):**
```typescript
// Before
share.command('list')

// After
share.command('ls')
```

Also update the `withErrorHandling` labels:
- `'Projects list'` → `'Projects ls'`
- `'Projects delete'` → `'Projects rm'`
- `'Share list'` → `'Share ls'`

### 2. CLI Documentation (`cli/CLAUDE.md`)

Update the command reference section:

**Before:**
```markdown
- `projects list [server-url]` - List all user's projects
- `projects delete [name] [server-url]` - Delete project (requires confirmation)
- `share list [project]` - List share tokens for a project
```

**After:**
```markdown
- `projects ls [server-url]` - List all user's projects
- `projects rm [name] [server-url]` - Delete project (requires confirmation)
- `share ls [project]` - List share tokens for a project
```

### 3. Website Documentation (`website/pages/docs.mdx`)

Update all command references (around lines 635-792):
- Line 635: `### scratch projects list` → `### scratch projects ls`
- Line 640: `scratch projects list [server-url]` → `scratch projects ls [server-url]`
- Line 678: `### scratch projects delete` → `### scratch projects rm`
- Line 683: `scratch projects delete [name] [server-url]` → `scratch projects rm [name] [server-url]`
- Line 691: `$ scratch projects delete my-blog` → `$ scratch projects rm my-blog`
- Line 783: `### scratch share list` → `### scratch share ls`
- Line 788: `scratch share list [project]` → `scratch share ls [project]`
- Line 792: `$ scratch share list my-blog` → `$ scratch share ls my-blog`

### 4. Website Notes (`website/notes.md`)

Update outline references (around lines 57-135):
- Line 58: `### scratch projects list` → `### scratch projects ls`
- Line 60: `### scratch projects delete` → `### scratch projects rm`
- Line 67: `### scratch share list` → `### scratch share ls`
- Line 135: `#### scratch projects list|info|delete` → `#### scratch projects ls|info|rm`

### 5. Root Documentation (`CLAUDE.md`)

Check if root CLAUDE.md references these commands. Based on exploration, it references `scratch projects` but not the subcommands specifically. No changes needed.

### 6. Template Files

- `cli/template/AGENTS.md` - Does not reference these specific commands. No changes needed.

### 7. Tests

**No test changes needed.** The CLI tests don't invoke `projects list`, `projects delete`, or `share list` as CLI commands:

- `cli/test/unit/cloud/api-server-url.test.ts` - Tests API endpoint construction (e.g., `/api/projects`), not CLI commands. Test descriptions like "projects list endpoint" are just descriptive names.
- `cli/test/e2e/cloud-server-url-flag.test.ts` - Tests `whoami` and `login` help output, not projects/share commands.

The internal function names (`listProjectsCommand`, `projectDeleteCommand`, `shareListCommand`) are not changing, only the CLI-facing command names.

## Implementation Steps

1. **Update `cli/src/index.ts`:**
   - Change `projects.command('list', ...)` → `projects.command('ls', ...)`
   - Change `projects.command('delete')` → `projects.command('rm')`
   - Change `share.command('list')` → `share.command('ls')`
   - Update error handling labels to match

2. **Update `cli/CLAUDE.md`:**
   - Update all command references in documentation

3. **Update `website/pages/docs.mdx`:**
   - Update all command examples and headings

4. **Update `website/notes.md`:**
   - Update command outline

5. **Run tests to verify:**
   ```bash
   bun ops cli test
   ```

6. **Manual verification:**
   ```bash
   bun ops cli build
   scratch projects --help
   scratch share --help
   ```

## Notes

- The `{ isDefault: true }` option on `projects ls` means running `scratch projects` without a subcommand will run `ls` (same behavior as before)
- The function names in `projects.ts` (`listProjectsCommand`, `projectDeleteCommand`) and `share.ts` (`shareListCommand`, `shareRevokeCommand`) don't need to change since they're internal implementations
- No API changes needed - this is purely a CLI surface rename
