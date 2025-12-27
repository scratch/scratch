import fs from 'fs/promises';
import type { BuildContext } from '../context';
import { BuildPhase, type BuildStep } from '../types';
import log from '../../logger';

export const copyPublicStaticStep: BuildStep = {
  name: '10-copy-public-static',
  description: 'Copy public/ static assets',
  phase: BuildPhase.CopyPublicStatic,

  async execute(ctx: BuildContext): Promise<void> {
    if (!(await fs.exists(ctx.staticDir))) {
      log.debug('  No public/ directory found, skipping');
      return;
    }

    await fs.cp(ctx.staticDir, ctx.buildDir, { recursive: true });

    log.debug('  Copied public/ static assets');
  },
};
