import type { BuildContext } from '../../context';
import { BuildPhase, defineStep } from '../types';

export const resetDirectoriesStep = defineStep({
  name: '02-reset-directories',
  description: 'Reset build and temp directories',
  phase: BuildPhase.ResetDirectories,

  shouldRun(): boolean {
    return true;
  },

  async execute(ctx: BuildContext): Promise<void> {
    await ctx.reset();
  },
});
