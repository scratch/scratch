import log, { setLogLevel } from '../../logger';
import { openBrowser } from '../../util';
import { getProvider } from './provider-registry';
import { printDeployResult } from './output';
import { prepareDeploy } from './preflight';
import { DeployOptions, DeployProvider, DeployResult } from './types';

interface DeployDependencies {
  getProvider: (name: string) => DeployProvider;
  prepareDeploy: typeof prepareDeploy;
  printDeployResult: typeof printDeployResult;
  openBrowser: typeof openBrowser;
  now: () => number;
}

const defaultDependencies: DeployDependencies = {
  getProvider,
  prepareDeploy,
  printDeployResult,
  openBrowser,
  now: () => Date.now(),
};

export async function deployCommand(
  providerName: string,
  projectPath: string = '.',
  options: DeployOptions = {},
  deps: DeployDependencies = defaultDependencies
): Promise<DeployResult> {
  // Suppress info logs when --json is set so stdout contains only valid JSON.
  // Errors still appear on stderr via log.error.
  if (options.json) {
    setLogLevel('quiet');
  }

  const provider = deps.getProvider(providerName);

  log.info(`Preparing ${provider.name} deployment...`);

  const ctx = await deps.prepareDeploy(provider.name, projectPath, options);

  await provider.validatePrerequisites(ctx);

  const startedAt = deps.now();
  const providerResult = await provider.deploy(ctx);

  const duration = deps.now() - startedAt;
  const result: DeployResult = {
    provider: provider.name,
    environment: ctx.environment,
    project: providerResult.project || ctx.project,
    url: providerResult.url,
    duration_ms: duration,
  };

  deps.printDeployResult(result, Boolean(options.json));

  if (options.open !== false) {
    await deps.openBrowser(result.url);
  }

  return result;
}
