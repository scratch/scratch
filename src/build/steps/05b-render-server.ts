import type { BuildContext } from '../context';
import type { BuildPipelineState, RenderServerOutput } from '../types';
import { BuildPhase, defineStep } from '../types';
import log from '../../logger';

export const renderServerStep = defineStep<RenderServerOutput>({
  name: '05b-render-server',
  description: 'Render server modules to HTML for SSG',
  phase: BuildPhase.RenderServer,

  shouldRun(_ctx: BuildContext, state: BuildPipelineState): boolean {
    return state.options.ssg === true && state.outputs.serverBuildResult !== null;
  },

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<RenderServerOutput> {
    log.debug('=== SERVER RENDER ===');

    const entries = state.outputs.entries!;
    const renderedContent = new Map<string, string>();

    log.debug(`  Rendering ${Object.keys(entries).length} pages...`);

    // Import each server module and call render() - in parallel for performance
    const renderPromises = Object.entries(entries).map(async ([name, entry]) => {
      const modulePath = entry.getArtifactPath('.js', ctx.serverCompiledDir);
      const serverModule = await import(modulePath);
      const html = await serverModule.render();
      renderedContent.set(name, html);
    });

    await Promise.all(renderPromises);

    return { renderedContent };
  },
});
