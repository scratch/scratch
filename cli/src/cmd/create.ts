import path from 'path';
import fs from 'fs/promises';
import { materializeProjectTemplates } from '../template';
import { BUILD_DEPENDENCIES } from '../build/steps/01-ensure-dependencies';
import { formatFileTree } from '../util';
import log from '../logger';

interface CreateOptions {
  src?: boolean;
  package?: boolean;
  minimal?: boolean;
  quiet?: boolean;
}

/**
 * Generate a package.json file for the project.
 */
export async function generatePackageJson(
  targetDir: string,
  projectName: string
): Promise<void> {
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

  const packageJsonPath = path.join(targetDir, 'package.json');
  await fs.writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n'
  );
}

/**
 * Create a new Scratch project.
 *
 * Includes src/ and package.json by default.
 * Use --no-src or --no-package to exclude.
 */
export async function createCommand(
  targetPath: string,
  options: CreateOptions = {}
) {
  const includeSrc = options.src !== false;
  const includePackage = options.package !== false;
  const minimal = options.minimal === true;

  const created = await materializeProjectTemplates(targetPath, {
    includeSrc,
    minimal,
  });

  // Generate package.json if requested (skip if it already exists)
  if (includePackage) {
    const packageJsonPath = path.join(targetPath, 'package.json');
    if (!(await fs.exists(packageJsonPath))) {
      const projectName = path.basename(path.resolve(targetPath));
      await generatePackageJson(targetPath, projectName);
      created.push('package.json');
    }
  }

  if (!options.quiet) {
    if (created.length > 0) {
      if (targetPath == '.') {
        log.info(`Created a new Scratch project:\n`);
      } else {
        log.info(`Created a new Scratch project in ${targetPath}:\n`);
      }
      for (const line of formatFileTree(created)) {
        log.info(`  ${line}`);
      }
      log.info('');
      log.info('Start the development server:\n');
      if (targetPath !== '.') {
        log.info(`  cd ${targetPath}`);
      }
      log.info('  scratch dev\n');
    } else {
      log.info('No files created (project already exists)');
    }
  }
}
