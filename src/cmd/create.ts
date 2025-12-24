import path from 'path';
import fs from 'fs/promises';
import { materializeProjectTemplates } from '../template';
import { BUILD_DEPENDENCIES } from '../context';
import log from '../logger';

interface CreateOptions {
  src?: boolean;
  examples?: boolean;
  package?: boolean;
}

/**
 * Generate a package.json file for the project.
 */
export async function generatePackageJson(targetDir: string, projectName: string): Promise<void> {
  const packageJson = {
    name: projectName,
    private: true,
    scripts: {
      dev: 'scratch dev',
      build: 'scratch build',
    },
    dependencies: Object.fromEntries(
      BUILD_DEPENDENCIES.map(pkg => [pkg, 'latest'])
    ),
  };

  const packageJsonPath = path.join(targetDir, 'package.json');
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

/**
 * Create a new Scratch project.
 *
 * Includes src/, examples, and package.json by default.
 * Use --no-src, --no-examples, or --no-package to exclude.
 */
export async function createCommand(targetPath: string, options: CreateOptions = {}) {
  // Defaults: include everything (--no-* flags set these to false)
  const includeSrc = options.src !== false;
  const includeExamples = options.examples !== false;
  const includePackage = options.package !== false;

  const created = await materializeProjectTemplates(targetPath, {
    includeSrc,
    includeExamples,
  });

  // Generate package.json if requested
  if (includePackage) {
    const projectName = path.basename(path.resolve(targetPath));
    await generatePackageJson(targetPath, projectName);
    created.push('package.json');
  }

  if (created.length > 0) {
    log.info('Created:');
    for (const file of created.sort()) {
      log.info(`  ${file}`);
    }
    log.info('');
    log.info('Start the development server:');
    if (targetPath !== '.') {
      log.info(`  cd ${targetPath}`);
    }
    log.info('  scratch dev');
  } else {
    log.info('No files created (project already exists)');
  }
}
