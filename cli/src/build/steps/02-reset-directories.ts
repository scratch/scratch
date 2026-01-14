import type { BuildContext } from '../context';
import type { BuildStep } from '../types';

export const resetDirectoriesStep: BuildStep = {
  name: '02-reset-directories',
  description: 'Reset build and temp directories',

  async execute(ctx: BuildContext): Promise<void> {
    await ctx.reset();
  },
};
