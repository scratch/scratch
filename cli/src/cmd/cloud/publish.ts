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
  promptServerUrlSelection,
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

export interface PublishOptions {
  name?: string
  visibility?: string
  noBuild?: boolean
  noOpen?: boolean
  dryRun?: boolean
}

export async function publishCommand(ctx: CloudContext, projectPath: string = '.', options: PublishOptions = {}): Promise<void> {
  const resolvedPath = path.resolve(projectPath)

  // Load project config first to check for server_url override
  let config = await loadProjectConfig(resolvedPath)
  const configRelPath = '.scratch/project.toml'

  // Determine server URL priority: CLI option (via ctx) → project config → always prompt
  let effectiveServerUrl: string
  let serverUrlWasPrompted = false
  const ctxServerUrl = ctx.getServerUrlIfExplicit()  // Returns URL only if explicitly set via --server

  if (ctxServerUrl) {
    // CLI option takes highest priority
    effectiveServerUrl = ctxServerUrl
  } else if (config.server_url) {
    // Project config is second priority
    effectiveServerUrl = config.server_url
  } else {
    // No server_url in project config - always prompt
    effectiveServerUrl = await promptServerUrlSelection()
    serverUrlWasPrompted = true
  }

  // Now create context with resolved server URL
  const cloudCtx = new CloudContext({ serverUrl: effectiveServerUrl, projectPath: resolvedPath })

  // Check credentials (auto-login if not authenticated)
  const credentials = await cloudCtx.requireAuth()

  // Reload config in case it was updated during login/config
  config = await loadProjectConfig(resolvedPath)

  // Determine project name (CLI option > config > directory name)
  let projectName = options.name || config.name
  // Visibility: CLI option > config > default to interactive prompt
  let visibility = options.visibility || config.visibility

  // If no valid project name from options or config, run interactive setup
  if (!projectName || !validateProjectName(projectName).valid) {
    const result = await runInteractiveSetup(resolvedPath, credentials, config, effectiveServerUrl)
    projectName = result.name!  // runInteractiveSetup guarantees name is set
    config = result
  } else {
    // Valid name exists - save server_url to config if it was prompted
    if (serverUrlWasPrompted) {
      log.info('Saving server URL to .scratch/project.toml...')
      await saveProjectConfig(resolvedPath, {
        ...config,
        server_url: effectiveServerUrl,
      })
      log.info('')
    }

    if (config.name) {
      // Show config being used
      log.info(`Using project configuration from ${configRelPath}`)
      log.info(`  name: ${projectName}`)
      log.info('')
    }
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
        { name: projectName, visibility, project_id: config.id },
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

      // Save project ID if it changed (new project or wasn't saved before)
      if (result.project.id !== config.id) {
        await saveProjectConfig(resolvedPath, {
          ...config,
          id: result.project.id,
          name: projectName,
        })
      }

      // Open the deployed page in browser (primary URL) unless --no-open
      if (!options.noOpen) {
        await openBrowser(result.urls.primary)
      }
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

          // Save new config (preserve visibility and server_url from existing config, clear id for new project)
          log.info('')
          log.info('Saving .scratch/project.toml...')
          await saveProjectConfig(resolvedPath, {
            name: projectName,
            visibility: config.visibility,
            server_url: config.server_url,
            // Don't preserve id - this will be a new project
          })
          config = { ...config, id: undefined, name: projectName }
          log.info('')
          log.info('Note: If your site has broken links, run `scratch publish` again to rebuild with the new name.')
          log.info('')

          // Retry with new name
          continue
        } else if (error.status === 400) {
          const body = error.body as any
          const code = body?.code

          if (code === 'PROJECT_NOT_FOUND') {
            log.error('')
            log.error('Project not found on server.')
            log.error('')
            log.error('This can happen if:')
            log.error(`  - The project was deleted from the server`)
            log.error(`  - You're logged in as a different user (currently logged in as ${credentials.user.email})`)
            log.error(`  - The .scratch/project.toml contains an ID from a different server`)
            log.error('')
            log.error('To fix, remove the "id" line from .scratch/project.toml and publish again.')
            process.exit(1)
          } else if (code === 'PROJECT_NAME_TAKEN') {
            log.error('')
            log.error(`You already have a project named "${projectName}".`)
            log.error('')
            log.error(`Run \`scratch projects info ${projectName}\` to see details.`)
            process.exit(1)
          } else {
            log.error(`Deploy failed (${error.status})`)
            if (body?.error) {
              log.error(`  ${body.error}`)
            }
            process.exit(1)
          }
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
 * Interactive setup - prompts user for project name and visibility only
 * Called when config exists but name is invalid
 */
async function runInteractiveSetup(
  resolvedPath: string,
  credentials: { user: { email: string } },
  existingConfig: ProjectConfig,
  serverUrl: string
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
  const newConfig: ProjectConfig = {
    name: projectName,
    visibility,
    server_url: serverUrl,
  }
  await saveProjectConfig(resolvedPath, newConfig)
  log.info('')

  return newConfig
}
