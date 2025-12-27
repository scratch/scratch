import fs from 'fs/promises';
import type { BuildContext } from '../context';
import { BuildPhase, defineStep } from '../types';
import log from '../../logger';

export const copyToDistStep = defineStep({
  name: '11-copy-to-dist',
  description: 'Copy compiled assets to dist/',
  phase: BuildPhase.CopyToDist,

  shouldRun(): boolean {
    return true;
  },

  async execute(ctx: BuildContext): Promise<void> {
    await fs.cp(ctx.clientCompiledDir, ctx.buildDir, { recursive: true });

    log.debug(`  Output in: ${ctx.buildDir}`);
  },
});
