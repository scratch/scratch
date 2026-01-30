# Simplify scratch create Command

## Problem

The `scratch create` command has three rarely-used modes that add complexity:

- `--no-src` - Skip src/ template directory
- `--no-package` - Skip package.json generation
- `--minimal` - Skip example content, use simple PageWrapper

These options were added early in development for edge cases but create maintenance burden and confuse users. The default mode works well for nearly all use cases.

## Solution

Remove all three flags and simplify to a single mode.

## Implementation

### 1. Remove CLI flags

**File:** `cli/src/index.ts` (lines 86-88)

Remove:
```typescript
.option('--no-src', 'Skip src/ template directory')
.option('--no-package', 'Skip package.json template')
.option('--minimal', 'Minimal mode: skip example content, use simple PageWrapper')
```

### 2. Simplify CreateOptions

**File:** `cli/src/cmd/create.ts`

Remove `src`, `package`, `minimal` from CreateOptions interface (keep only `quiet`):
```typescript
interface CreateOptions {
  quiet?: boolean;
}
```

Remove lines 51-53 (option parsing) and simplify the function body:
```typescript
export async function createCommand(targetPath: string, options: CreateOptions = {}) {
  const created = await materializeProjectTemplates(targetPath);

  // Generate package.json if it doesn't exist
  const packageJsonPath = path.join(targetPath, 'package.json');
  if (!(await fs.exists(packageJsonPath))) {
    const projectName = path.basename(path.resolve(targetPath));
    await generatePackageJson(targetPath, projectName);
    created.push('package.json');
  }

  // ... rest unchanged (output logic) ...
}
```

Also remove the JSDoc comment mentioning the flags (line 44-46).

### 3. Simplify materializeProjectTemplates

**File:** `cli/src/template.ts`

Remove:
- `MINIMAL_FILES` constant (line 27)
- `MINIMAL_INFRASTRUCTURE_FILES` constant (lines 33-36)
- `isMinimalFile` function (lines 41-55)
- `isSrcFile` function (lines 60-62)
- `MaterializeOptions.includeSrc` and `MaterializeOptions.minimal` properties (keep `overwrite`)
- Conditional filtering logic in the main function (lines 101-137)

Simplified function:
```typescript
export interface MaterializeOptions {
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
}

export async function materializeProjectTemplates(
  targetDir: string,
  options: MaterializeOptions = {}
): Promise<string[]> {
  const { overwrite = false } = options;
  const created: string[] = [];

  await fs.mkdir(targetDir, { recursive: true });

  for (const [relativePath, file] of Object.entries(templates)) {
    // Skip internal build/config files
    if (relativePath.startsWith('_build/') || relativePath.startsWith('_config/')) {
      continue;
    }

    const targetPath = path.join(targetDir, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const exists = await fs.exists(targetPath);
    if (exists && !overwrite) {
      log.debug(`Skipped ${relativePath}`);
      continue;
    }

    await fs.writeFile(targetPath, getWritableContent(file));
    log.debug(`${exists ? 'Overwrote' : 'Wrote'} ${relativePath}`);
    created.push(relativePath);
  }

  return created;
}
```

### 4. Update watch command

**File:** `cli/src/cmd/watch.ts` (line 61)

Change:
```typescript
await createCommand(tempDir, { src: true, package: true, minimal: true, quiet: true });
```
To:
```typescript
await createCommand(tempDir, { quiet: true });
```

### 5. Update tests

**Delete:** `cli/test/e2e/create-minimal.test.ts`

**Keep as-is:** `cli/test/e2e/create-preserves-package-json.test.ts` (doesn't use removed flags)

**Verify:** Run `bun ops cli test` to ensure all tests pass.

### 6. Update documentation

**File:** `cli/CLAUDE.md` (lines 15-17)

Remove:
```markdown
  - `--no-src` - Exclude src/ directory
  - `--no-package` - Exclude package.json
  - `--minimal` - Minimal mode: skip example content
```

**File:** `website/pages/docs.mdx` (lines 205-207)

Remove:
```markdown
- `--no-src` — Skip the `src/` directory
- `--no-package` — Skip `package.json`
- `--minimal` — Skip example content
```

**Note:** `cli/CHANGELOG.md` contains historical references (v0.0.10, v0.0.7) - leave these unchanged as they document past behavior.

## Files Changed

1. `cli/src/index.ts` - Remove 3 flag definitions
2. `cli/src/cmd/create.ts` - Simplify CreateOptions, remove conditional logic
3. `cli/src/template.ts` - Remove tier constants, helper functions, and conditional filtering
4. `cli/src/cmd/watch.ts` - Simplify createCommand call
5. `cli/test/e2e/create-minimal.test.ts` - Delete
6. `cli/CLAUDE.md` - Remove flag documentation
7. `website/pages/docs.mdx` - Remove flag documentation

## Verification

After implementation:
1. `bun ops cli test` - All tests pass
2. `scratch create test-project` - Creates full project structure
3. `scratch --help` - Create command shows no extra flags
