# CLI Development Skill

Patterns for developing the Scratch CLI.

## File Locations

- **CLI commands**: `cli/src/cmd/` - Each command has its own file
- **Build steps**: `cli/src/build/steps/` - Modular build pipeline steps
- **Build orchestrator**: `cli/src/build/orchestrator.ts` - Step ordering
- **Build config**: `cli/src/build/buncfg.ts` - Bun.build() configuration
- **Templates**: `cli/template/` - Embedded project templates
- **Cloud commands**: `cli/src/cmd/cloud/` - Server interaction commands

## Adding a New CLI Command

1. Create handler in `cli/src/cmd/yourcommand.ts`
2. Register in `cli/src/index.ts` using Commander

Example:
```typescript
// cli/src/cmd/yourcommand.ts
export async function yourcommand(options: Options) {
  // implementation
}

// cli/src/index.ts
program
  .command('yourcommand')
  .description('What it does')
  .action(yourcommand);
```

## Modifying Build Pipeline

1. Add/modify steps in `cli/src/build/steps/`
2. Update step ordering in `cli/src/build/orchestrator.ts`
3. Build config is in `cli/src/build/buncfg.ts`

## Adding Template Files

1. Add to `cli/template/` for user-facing files (copied to new projects)
2. Add to `cli/template/_build/` for internal build infrastructure (not copied)
3. Run `bun run build` (auto-regenerates `src/template.generated.ts`)

## Testing Changes

```bash
# Test in a temp directory (NEVER build directly in template/)
rm -rf /tmp/test-scratch && mkdir /tmp/test-scratch
cd cli && bun run src/index.ts create /tmp/test-scratch
bun run src/index.ts build /tmp/test-scratch

# Run CLI tests
bun ops cli test          # All tests
bun ops cli test:unit     # Unit only
bun ops cli test:e2e      # E2E only

# Full integration test
bun ops server -i staging test
```

## Documentation Sync Checklist

When modifying CLI functionality, update these documents as needed:

- [ ] `cli/CLAUDE.md` - If adding/changing commands, build steps, or architecture
- [ ] `website/pages/docs.mdx` - If the change affects user-facing behavior
- [ ] `cli/template/AGENTS.md` - If the change affects how agents should use scratch in projects

Keep `cli/template/AGENTS.md` and `website/pages/docs.mdx` in sync for user-facing changes.
