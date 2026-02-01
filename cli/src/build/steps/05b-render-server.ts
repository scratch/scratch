import type { BuildContext } from '../context';
import type { BuildPipelineState } from '../types';
import type { BuildStep } from '../types';
import log from '../../logger';

export const renderServerStep: BuildStep = {
  name: '05b-render-server',
  description: 'Render server modules to HTML for SSG',

  shouldRun(_ctx: BuildContext, state: BuildPipelineState): boolean {
    return state.options.ssg === true && state.outputs.serverBuildResult !== null;
  },

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const entries = state.outputs.entries!;
    const renderedContent = new Map<string, string>();

    log.debug(`  Rendering ${Object.keys(entries).length} pages...`);

    // Import each server module and call render() - in parallel for performance
    const renderPromises = Object.entries(entries).map(async ([name, entry]) => {
      const modulePath = entry.getArtifactPath('.js', ctx.serverCompiledDir);
      const serverModule = await import(modulePath);

      // Validate the module has a render function
      if (typeof serverModule.render !== 'function') {
        const exportedKeys = Object.keys(serverModule);
        const sourcePath = entry.relPath;
        throw new Error(
          `Failed to compile ${sourcePath}: server module is missing render() function.\n` +
            `  Module exports: ${exportedKeys.length > 0 ? exportedKeys.join(', ') : '(empty)'}\n` +
            `  This usually means the MDX file has a syntax error that was not reported.\n` +
            `  Check the file for special characters or invalid JSX syntax.`
        );
      }

      try {
        const html = await serverModule.render();
        renderedContent.set(name, html);
      } catch (err: any) {
        const sourcePath = entry.relPath;
        // Enhance React error messages with file context
        if (err.message?.includes('Element type is invalid')) {
          throw new Error(
            `Failed to render ${sourcePath}: ${err.message}\n` +
              `  This usually means a component in the MDX file could not be resolved.\n` +
              `  Check for typos in component names or missing imports.`
          );
        }
        throw new Error(`Failed to render ${sourcePath}: ${err.message}`);
      }
    });

    await Promise.all(renderPromises);

    state.outputs.renderedContent = renderedContent;
  },
};
