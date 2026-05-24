import log from '../../logger';
import { DeployResult } from './types';

export function printDeployResult(result: DeployResult, json: boolean): void {
  if (json) {
    // Write to stdout directly; log level is set to quiet in --json mode
    // so this is the only stdout output.
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  log.info('');
  log.info(`Deploy complete`);
  log.info(`  provider:    ${result.provider}`);
  log.info(`  environment: ${result.environment}`);
  log.info(`  project:     ${result.project}`);
  log.info(`  url:         ${result.url}`);
  log.info(`  elapsed:     ${result.duration_ms}ms`);
}
