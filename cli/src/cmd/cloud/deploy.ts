import log from '../../logger'
import { deploy, ApiError } from '../../cloud/api'
import { buildCommand } from '../build'
import { BuildContext } from '../../build/context'
import { validateProjectName } from '@scratch/shared/project'
import { formatBytes, openBrowser, stripTrailingSlash } from '../../util'
import {
  loadProjectConfig,
  saveProjectConfig,
  // Prompts
  promptProjectName,
  promptVisibility,
  type ProjectConfig,
} from '../../config'
import { CloudContext } from './context'
import fs from 'fs/promises'
import path from 'path'

// Create zip from directory
async function createZip(dirPath: string): Promise<{ data: ArrayBuffer; fileCount: number; totalBytes: number }> {
  const JSZipModule = await import('jszip')
  const JSZip = JSZipModule.default || JSZipModule
  const zip = new JSZip()

  let fileCount = 0
  let totalBytes = 0

  async function addDir(currentPath: string, zipPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        await addDir(fullPath, entryZipPath)
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath)
        zip.file(entryZipPath, content)
        fileCount++
        totalBytes += content.length
      }
      // Skip symlinks and other special files
    }
  }

  await addDir(dirPath, '')

  const data = await zip.generateAsync({ type: 'arraybuffer' })
  return { data, fileCount, totalBytes }
}

export interface DeployOptions {
  name?: string
  visibility?: string
  noBuild?: boolean
  dryRun?: boolean
}

export async function deployCommand(ctx: CloudContext, projectPath: string = '.', options: DeployOptions = {}): Promise<void> {
  const resolvedPath = path.resolve(projectPath)

  // Get server URL from context (already resolved from CLI flag → project config → global config)
  const effectiveServerUrl = await ctx.getServerUrl()

  // Check credentials (auto-login if not authenticated)
  const credentials = await ctx.requireAuth()

  // Load project config
  let config = await loadProjectConfig(resolvedPath)
  const configRelPath = '.scratch/project.toml'

  // Determine project name (CLI option > config > directory name)
  let projectName = options.name || config.name
  // Visibility: CLI option > config > default to interactive prompt
  let visibility = options.visibility || config.visibility

  // If no valid project name from options or config, run interactive setup
  if (!projectName || !validateProjectName(projectName).valid) {
    const result = await runInteractiveSetup(resolvedPath, credentials, config)
    projectName = result.name!  // runInteractiveSetup guarantees name is set
    config = result
  } else if (config.name) {
    // Show config being used
    log.info(`Using project configuration from ${configRelPath}`)
    log.info(`  name: ${projectName}`)
    log.info('')
  }

  // Build unless --no-build
  const distDir = path.join(resolvedPath, 'dist')

  if (!options.noBuild) {
    log.info('Building project...')
    // Base path matches the deployed URL: /<user-id>/<project-name>/
    const buildCtx = new BuildContext({ path: resolvedPath, base: `/${credentials.user.id}/${projectName}` })
    await buildCommand(buildCtx, { ssg: true }, resolvedPath)
  }

  // Check dist/ exists
  try {
    const stat = await fs.stat(distDir)
    if (!stat.isDirectory()) {
      log.error('dist/ is not a directory')
      process.exit(1)
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      log.error('dist/ directory not found. Run `scratch build` first or remove --no-build')
      process.exit(1)
    }
    throw err
  }

  // Create zip
  log.info('Packaging for upload...')
  const { data: zipData, fileCount, totalBytes } = await createZip(distDir)
  const compressedBytes = zipData.byteLength
  log.info(`  ${fileCount} files, ${formatBytes(totalBytes)} -> ${formatBytes(compressedBytes)}`)

  // Dry run - show what would be deployed without uploading
  if (options.dryRun) {
    log.info('')
    log.info('Dry run complete. Would deploy project:')
    log.info(`  ${projectName}`)
    log.info('')
    log.info('(Actual URLs will be shown after deploy based on your account)')
    return
  }

  // Upload (with retry loop for name conflicts)
  while (true) {
    log.info(`Uploading to ${effectiveServerUrl}...`)

    try {
      const result = await deploy(
        credentials.token,
        { name: projectName, visibility },
        zipData,
        effectiveServerUrl
      )

      log.info('')
      if (result.project.created) {
        log.info(`Created project "${projectName}"`)
      }
      log.info(`Deployed v${result.deploy.version}`)
      log.info('')
      log.info('URLs:')
      log.info(`  ${stripTrailingSlash(result.urls.primary)}`)
      log.info(`  ${stripTrailingSlash(result.urls.byId)}`)

      // Open the deployed page in browser (primary URL)
      await openBrowser(result.urls.primary)
      return
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 413) {
          log.error('Deploy too large. Reduce the size of your dist/ directory.')
          process.exit(1)
        } else if (error.status === 403) {
          // Project name conflict - prompt for new name
          log.info('')
          log.info(`Project "${projectName}" is owned by a different user.`)
          log.info('')

          projectName = await promptProjectName(undefined, undefined)

          // Save new config (preserve visibility and server_url from existing config)
          log.info('')
          log.info('Saving .scratch/project.toml...')
          await saveProjectConfig(resolvedPath, {
            name: projectName,
            visibility: config.visibility,
            server_url: config.server_url,
          })
          log.info('')
          log.info('Note: If your site has broken links, run `scratch cloud deploy` again to rebuild with the new name.')
          log.info('')

          // Retry with new name
          continue
        } else {
          const body = error.body as any
          log.error(`Deploy failed (${error.status})`)
          if (body?.error) {
            log.error(`  ${body.error}`)
          } else if (body?.message) {
            log.error(`  ${body.message}`)
          } else if (typeof body === 'string' && body) {
            // Show first line of text response (might be error page or stack trace)
            const firstLine = body.split('\n')[0].substring(0, 200)
            log.error(`  ${firstLine}`)
          }
          process.exit(1)
        }
      }
      throw error
    }
  }
}

/**
 * Interactive setup - prompts user for project config, saves to .scratch/project.toml
 */
async function runInteractiveSetup(
  resolvedPath: string,
  credentials: { user: { email: string } },
  existingConfig: ProjectConfig
): Promise<ProjectConfig> {
  const dirName = path.basename(resolvedPath)

  log.info('')
  log.info('Project Setup')
  log.info('=============')
  log.info('')

  // 1. Prompt for project name
  const projectName = await promptProjectName(existingConfig.name, dirName)

  // 2. Prompt for visibility
  const visibility = await promptVisibility(credentials.user.email, existingConfig.visibility)

  // Save config
  log.info('')
  log.info('Saving .scratch/project.toml...')
  const newConfig: ProjectConfig = { name: projectName, visibility }
  await saveProjectConfig(resolvedPath, newConfig)
  log.info('')

  return newConfig
}
