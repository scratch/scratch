import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import type { BuildContext } from '../context';
import type { BuildStep } from '../types';
import { bunInstall } from '../../util';
import log from '../../logger';

export const BUILD_DEPENDENCIES = [
  'react',
  'react-dom',
  '@mdx-js/react',
  'tailwindcss',
  '@tailwindcss/cli',
  '@tailwindcss/typography',
];

export const ensureDependenciesStep: BuildStep = {
  name: '01-ensure-dependencies',
  description: 'Ensure build dependencies installed',

  async execute(ctx: BuildContext): Promise<void> {
    const packageJsonPath = path.resolve(ctx.rootDir, 'package.json');
    const nodeModulesPath = path.resolve(ctx.rootDir, 'node_modules');

    // Create package.json if it doesn't exist
    if (!(await fs.exists(packageJsonPath))) {
      const projectName = path.basename(ctx.rootDir);
      const packageJson = {
        name: projectName,
        private: true,
        scripts: {
          dev: 'scratch dev',
          build: 'scratch build',
        },
        dependencies: Object.fromEntries(
          BUILD_DEPENDENCIES.map((pkg) => [pkg, 'latest'])
        ),
      };
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
      log.info('Created package.json');
    }

    // Install dependencies if node_modules doesn't exist
    if (!(await fs.exists(nodeModulesPath))) {
      log.info('Installing dependencies...');
      bunInstall(ctx.rootDir);
      log.info('Dependencies installed');
      restartBuildInSubprocess();
    }
  },
};

/**
 * Re-run the build in a fresh subprocess to work around Bun runtime issue.
 * Bun.build() fails after spawning a child bun process in the same execution.
 */
function restartBuildInSubprocess(): never {
  log.debug('Re-running build in subprocess to work around Bun runtime issue');

  // Detect if running as compiled binary vs `bun run script.ts`
  // Compiled binary: argv = ["bun", "/$bunfs/root/scratch", ...args]
  //                  execPath = "/path/to/scratch" (actual binary)
  // bun run:         argv = ["/path/to/bun", "/path/to/script.ts", ...args]
  //                  execPath = "/path/to/bun"
  const isCompiledBinary = process.argv[0] === 'bun' && process.argv[1]?.startsWith('/$bunfs/');

  const executable = isCompiledBinary ? process.execPath : process.argv[0]!;
  const args = isCompiledBinary ? process.argv.slice(2) : process.argv.slice(1);

  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}
