import type { BuildContext } from '../../context';
import { BuildPhase, defineStep } from '../types';

export const ensureDependenciesStep = defineStep({
  name: '01-ensure-dependencies',
  description: 'Ensure build dependencies installed',
  phase: BuildPhase.EnsureDependencies,

  shouldRun(): boolean {
    return true;
  },

  async execute(ctx: BuildContext): Promise<void> {
    await ctx.ensureBuildDependencies();
  },
});
