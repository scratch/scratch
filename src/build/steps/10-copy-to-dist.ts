import fs from 'fs/promises';
import type { BuildContext } from '../context';
import { BuildPhase, type BuildStep } from '../types';
import log from '../../logger';

export const copyToDistStep: BuildStep = {
  name: '10-copy-to-dist',
  description: 'Copy compiled assets to dist/',
  phase: BuildPhase.CopyToDist,

  async execute(ctx: BuildContext): Promise<void> {
    await fs.cp(ctx.clientCompiledDir, ctx.buildDir, { recursive: true });

    log.debug(`  Output in: ${ctx.buildDir}`);
  },
};
