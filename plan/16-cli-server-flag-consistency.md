# CLI Server Flag Consistency

## Problem

The CLI uses inconsistent patterns for specifying server URLs:

1. **Most commands** use positional argument: `[server-url]`
2. **publish and tokens use** use option flag: `--server <url>`

This inconsistency confuses users and makes the CLI harder to learn.

## Current State

| Command | Current Pattern | Default |
|---------|----------------|---------|
| `publish` | `--server <url>` | project config → prompt |
| `login` | `[server-url]` positional | smart resolution |
| `logout` | `[server-url]` positional | smart resolution |
| `whoami` | `[server-url]` positional | smart resolution |
| `projects ls` | `[server-url]` positional | smart resolution |
| `projects info` | `[server-url]` positional | smart resolution |
| `projects rm` | `[server-url]` positional | smart resolution |
| `share create` | none | smart resolution |
| `share ls` | none | smart resolution |
| `share revoke` | none | smart resolution |
| `tokens ls` | `[server-url]` positional | smart resolution |
| `tokens create` | `[server-url]` positional | smart resolution |
| `tokens revoke` | `[server-url]` positional | smart resolution |
| `tokens use` | `--server <url>` | prompt |
| `cf-access` | `[server-url]` positional | smart resolution |

## Solution

1. Standardize all commands to use `--server <url>` option flag
2. Default to `scratch.dev` (which normalizes to `app.scratch.dev`)
3. Keep existing smart resolution: `--server` flag → project config → logged-in servers → default

## Implementation

### 1. Update CLI command definitions

**File:** `cli/src/index.ts`

Change all commands from positional `[server-url]` to option `--server <url>`:

**login** (line 227):
```typescript
// Before
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**logout** (line 239):
```typescript
// Before
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**whoami** (line 250):
```typescript
// Before
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**projects ls** (line 266):
```typescript
// Before
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**projects info** (lines 277-278):
```typescript
// Before
.argument('[name]', 'Project name (uses .scratch/project.toml if not specified)')
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.argument('[name]', 'Project name (uses .scratch/project.toml if not specified)')
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**projects rm** (lines 289-290):
```typescript
// Before
.argument('[name]', 'Project name (uses .scratch/project.toml if not specified)')
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.argument('[name]', 'Project name (uses .scratch/project.toml if not specified)')
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**share create** (line 307):
```typescript
// Before
.argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')

// After
.argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**share ls** (line 320):
```typescript
// Before
.argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')

// After
.argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**share revoke** (line 332):
```typescript
// Before
.argument('<tokenId>', 'Token ID to revoke')
.argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')

// After
.argument('<tokenId>', 'Token ID to revoke')
.argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**tokens ls** (line 348):
```typescript
// Before
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**tokens create** (line 360):
```typescript
// Before
.argument('<name>', 'Token name (3-40 characters, alphanumeric with hyphens/underscores)')
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.argument('<name>', 'Token name (3-40 characters, alphanumeric with hyphens/underscores)')
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**tokens revoke** (line 373):
```typescript
// Before
.argument('<id-or-name>', 'Token ID or name')
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.argument('<id-or-name>', 'Token ID or name')
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

**cf-access** (line 396):
```typescript
// Before
.argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')

// After
.option('--server <url>', 'Server URL (defaults to scratch.dev)')
```

### 2. Update action handlers in index.ts

Update the handler functions to pass `options.server` instead of positional arguments:

```typescript
// login (line 230-233)
// Before
.action(withErrorHandling('Login', async (serverUrl, options) => {
  const ctx = createCloudContext(serverUrl);
  await loginCommand(ctx, { timeout: options.timeout ? parseFloat(options.timeout) : undefined });
}));

// After
.action(withErrorHandling('Login', async (options) => {
  const ctx = createCloudContext(options.server);
  await loginCommand(ctx, { timeout: options.timeout ? parseFloat(options.timeout) : undefined });
}));
```

Apply similar pattern to all affected commands.

### 3. Update share commands to accept server URL

**File:** `cli/src/index.ts`

```typescript
// share create
.action(withErrorHandling('Share create', async (project, options) => {
  const ctx = createCloudContext(options.server);
  await shareCreateCommand(ctx, project, { name: options.name, duration: options.duration });
}));

// share ls
.action(withErrorHandling('Share ls', async (project, options) => {
  const ctx = createCloudContext(options.server);
  await shareListCommand(ctx, project);
}));

// share revoke
.action(withErrorHandling('Share revoke', async (tokenId, project, options) => {
  const ctx = createCloudContext(options.server);
  await shareRevokeCommand(ctx, tokenId, project);
}));
```

### 4. Update CloudContext comments

**File:** `cli/src/cmd/cloud/context.ts`

Update comments to reflect the change from positional arg to `--server` flag:

```typescript
// Line 14-15
/** Server URL override from --server flag */
serverUrl?: string

// Line 28-29 (comment block)
* 1. CLI argument (--server flag)
```

### 5. Update documentation

**File:** `cli/CLAUDE.md`

Update any references to server URL command syntax.

**File:** `website/pages/docs.mdx`

Update command examples to use `--server` flag syntax.

## Files Changed

1. `cli/src/index.ts` - Update all command definitions and handlers
2. `cli/src/cmd/cloud/context.ts` - Update comments
3. `cli/CLAUDE.md` - Update documentation
4. `website/pages/docs.mdx` - Update documentation

## Verification

After implementation:
1. `bun ops cli test` - All tests pass
2. `scratch login --help` - Shows `--server <url>` option
3. `scratch projects ls --help` - Shows `--server <url>` option
4. `scratch share --help` - Shows `--server <url>` option
5. `scratch login --server scratch.dev` - Works and normalizes to `app.scratch.dev`
6. `bun ops server -i staging test` - Full integration test passes
