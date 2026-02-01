// Setup command - creates Cloudflare resources and configures an instance

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { input, select } from '@inquirer/prompts'
import { green, yellow, reset, dim } from '../../lib/output'
import {
  WRANGLER_TEMPLATE,
  parseVarsFile,
  writeVarsFile,
  getRequiredVarsWithComments,
  getInstanceVarsPath,
  getInstanceWranglerPath,
  COMMON_AUTH_VARS,
  LOCAL_AUTH_VARS,
  CF_ACCESS_AUTH_VARS,
} from '../../lib/config'
import { syncSecretsToCloudflare } from './config'

async function getD1DatabaseId(dbName: string, accountId?: string): Promise<string | null> {
  const env = accountId ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId } : undefined
  const proc = Bun.spawn(['bunx', 'wrangler', 'd1', 'list', '--json'], {
    cwd: 'server',
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) return null

  try {
    const stdout = await new Response(proc.stdout).text()
    const databases = JSON.parse(stdout) as { name: string; uuid: string }[]
    const db = databases.find(d => d.name === dbName)
    return db?.uuid || null
  } catch {
    return null
  }
}

export function generateWranglerConfig(instance: string, d1DatabaseId: string): string {
  if (!existsSync(WRANGLER_TEMPLATE)) {
    throw new Error(`Wrangler template not found: ${WRANGLER_TEMPLATE}`)
  }

  let config = readFileSync(WRANGLER_TEMPLATE, 'utf-8')

  const varsPath = getInstanceVarsPath(instance)
  const vars = existsSync(varsPath) ? parseVarsFile(varsPath) : new Map<string, string>()

  vars.set('INSTANCE', instance)
  vars.set('D1_DATABASE_ID', d1DatabaseId)

  if (!vars.has('APP_PORT')) {
    vars.set('APP_PORT', '8788')
  }

  config = config.replace(/\$\{(\w+)\}/g, (match, name) => {
    const value = vars.get(name)
    if (!value) {
      // CLOUDFLARE_ACCOUNT_ID is optional - if missing, we'll remove the line below
      if (name === 'CLOUDFLARE_ACCOUNT_ID') {
        return ''
      }
      throw new Error(`Missing required variable for wrangler config: ${name}`)
    }
    return value
  })

  // Remove account_id line if CLOUDFLARE_ACCOUNT_ID was not set
  if (!vars.get('CLOUDFLARE_ACCOUNT_ID')) {
    config = config.replace(/^account_id\s*=\s*""\n/m, '')
  }

  config = config
    .replace(/\[dev\][\s\S]*?(?=\n\[|\n#|$)/, '')
    .replace(/^workers_dev\s*=\s*true$/m, 'workers_dev = false')
    .replace(/^preview_urls\s*=\s*true$/m, 'preview_urls = false')

  const baseDomain = vars.get('BASE_DOMAIN')
  const appSubdomain = vars.get('APP_SUBDOMAIN')
  const contentSubdomain = vars.get('CONTENT_SUBDOMAIN')

  if (baseDomain && appSubdomain && contentSubdomain && baseDomain !== 'localhost') {
    const appDomain = `${appSubdomain}.${baseDomain}`
    const contentDomain = `${contentSubdomain}.${baseDomain}`
    config += `
# Generated routes
[[routes]]
pattern = "${appDomain}/*"
zone_name = "${baseDomain}"

[[routes]]
pattern = "${contentDomain}/*"
zone_name = "${baseDomain}"
`

    // Add www and naked domain routes if WWW_PROJECT_ID is configured
    const wwwProjectId = vars.get('WWW_PROJECT_ID')
    if (wwwProjectId && wwwProjectId !== '_') {
      config += `
[[routes]]
pattern = "www.${baseDomain}/*"
zone_name = "${baseDomain}"

[[routes]]
pattern = "${baseDomain}/*"
zone_name = "${baseDomain}"
`
    }
  }

  return config
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

async function createR2Bucket(bucketName: string, accountId?: string): Promise<void> {
  const env = accountId ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId } : undefined
  const bucketProc = Bun.spawn(['bunx', 'wrangler', 'r2', 'bucket', 'create', bucketName], {
    cwd: 'server',
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  })

  const bucketExitCode = await bucketProc.exited
  const bucketStderr = await new Response(bucketProc.stderr).text()

  if (bucketExitCode === 0) {
    console.log(`  ${green}✓${reset} Created bucket: ${bucketName}`)
  } else if (bucketStderr.toLowerCase().includes('already') || bucketStderr.toLowerCase().includes('exist')) {
    console.log(`  ${yellow}!${reset} Bucket already exists: ${bucketName}`)
  } else {
    const listProc = Bun.spawn(['bunx', 'wrangler', 'r2', 'bucket', 'list'], {
      cwd: 'server',
      stdout: 'pipe',
      stderr: 'pipe',
      env,
    })
    const listExitCode = await listProc.exited
    const listStdout = await new Response(listProc.stdout).text()

    if (listExitCode === 0 && listStdout.includes(bucketName)) {
      console.log(`  ${yellow}!${reset} Bucket already exists: ${bucketName}`)
    } else {
      console.error(`  Failed to create bucket: ${bucketStderr.trim()}`)
      process.exit(1)
    }
  }
}

export async function setupAction(instance: string): Promise<void> {
  console.log(`Setting up Cloudflare resources for instance: ${instance}\n`)

  const workerName = `${instance}-scratch-server`
  const filesBucketName = `${instance}-scratch-files`
  const dbName = `${instance}-scratch-db`

  const varsPath = getInstanceVarsPath(instance)
  const wranglerPath = getInstanceWranglerPath(instance)

  // Read account ID from existing vars if available (for multi-account users)
  const existingVars = existsSync(varsPath) ? parseVarsFile(varsPath) : new Map<string, string>()
  const accountId = existingVars.get('CLOUDFLARE_ACCOUNT_ID') || undefined
  const wranglerEnv = accountId ? { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId } : undefined

  if (accountId) {
    console.log(`Using Cloudflare account: ${accountId}\n`)
  }

  // Step 1: Check Cloudflare login
  console.log('Step 1: Checking Cloudflare login')
  const whoamiProc = Bun.spawn(['bunx', 'wrangler', 'whoami'], {
    cwd: 'server',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const whoamiExitCode = await whoamiProc.exited
  if (whoamiExitCode === 0) {
    const stdout = await new Response(whoamiProc.stdout).text()
    const match = stdout.match(/associated with the email (.+?)!/)
    if (match) {
      console.log(`  ${green}✓${reset} Logged in as ${match[1]}`)
    } else {
      console.log(`  ${green}✓${reset} Already logged in`)
    }
  } else {
    console.log('  Not logged in, opening browser...')
    const loginProc = Bun.spawn(['bunx', 'wrangler', 'login'], {
      cwd: 'server',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await loginProc.exited
  }

  // Step 2: Create R2 bucket
  console.log(`\nStep 2: Creating R2 bucket`)
  await createR2Bucket(filesBucketName, accountId)

  // Step 3: Create D1 database
  console.log(`\nStep 3: Creating D1 database (${dbName})`)
  const d1Proc = Bun.spawn(['bunx', 'wrangler', 'd1', 'create', dbName], {
    cwd: 'server',
    stdout: 'pipe',
    stderr: 'pipe',
    env: wranglerEnv,
  })

  const d1ExitCode = await d1Proc.exited
  const d1Stdout = await new Response(d1Proc.stdout).text()
  const d1Stderr = await new Response(d1Proc.stderr).text()

  let d1DatabaseId: string | null = null

  if (d1ExitCode === 0) {
    const idMatch = d1Stdout.match(/database_id\s*=\s*"([^"]+)"/)
    if (idMatch) {
      d1DatabaseId = idMatch[1]
      console.log(`  ${green}✓${reset} Created D1 database: ${dbName}`)
      console.log(`     ID: ${d1DatabaseId}`)
    } else {
      console.log(`  ${green}✓${reset} Created D1 database, but could not parse ID from output`)
      d1DatabaseId = await getD1DatabaseId(dbName, accountId)
      if (d1DatabaseId) {
        console.log(`     ID (fetched): ${d1DatabaseId}`)
      }
    }
  } else {
    const alreadyExists = d1Stderr.toLowerCase().includes('already') ||
                          d1Stdout.toLowerCase().includes('already') ||
                          d1Stderr.toLowerCase().includes('exist') ||
                          d1Stdout.toLowerCase().includes('exist')

    if (alreadyExists) {
      console.log(`  ${yellow}!${reset} D1 database already exists: ${dbName}`)
    }

    d1DatabaseId = await getD1DatabaseId(dbName, accountId)
    if (d1DatabaseId) {
      console.log(`     ID: ${d1DatabaseId}`)
    } else if (!alreadyExists) {
      console.error(`  Failed to create D1 database: ${d1Stderr.trim() || d1Stdout.trim()}`)
      process.exit(1)
    }
  }

  if (!d1DatabaseId) {
    console.error('  Could not retrieve D1 database ID')
    console.error('  Run: bunx wrangler d1 list')
    process.exit(1)
  }

  // Step 4: Interactive configuration
  console.log('\nStep 4: Configuring environment variables')
  console.log(`${dim}Press Enter to accept the default value shown in parentheses${reset}\n`)

  const varsWithComments = getRequiredVarsWithComments()
  const newVars = new Map<string, string>()

  newVars.set('D1_DATABASE_ID', d1DatabaseId)

  // Variables that depend on AUTH_MODE - derived from the imported constants
  const AUTH_MODE_VARS = ['AUTH_MODE', ...COMMON_AUTH_VARS, ...LOCAL_AUTH_VARS, ...CF_ACCESS_AUTH_VARS]

  // Helper function to prompt for a variable
  async function promptForVar(varInfo: { name: string; comments: string[]; defaultValue: string }) {
    const { name: varName, comments, defaultValue } = varInfo
    const existingValue = existingVars.get(varName) || defaultValue || ''

    if (comments.length > 0) {
      for (const comment of comments) {
        console.log(`${dim}${comment}${reset}`)
      }
    }

    const inputValue = await input({
      message: `${varName}:`,
      default: truncate(existingValue, 30),
      transformer: (val: string) => val,
    })

    const finalValue = inputValue === truncate(existingValue, 30) ? existingValue : inputValue
    newVars.set(varName, finalValue)
    console.log('')
    return finalValue
  }

  // First, ask for all non-auth variables
  for (const varInfo of varsWithComments) {
    const { name: varName } = varInfo

    if (varName === 'D1_DATABASE_ID') {
      console.log(`${dim}D1_DATABASE_ID=${d1DatabaseId} (auto-filled)${reset}\n`)
      continue
    }

    // Skip auth-mode-dependent variables for now
    if (AUTH_MODE_VARS.includes(varName)) {
      continue
    }

    await promptForVar(varInfo)
  }

  // Now handle AUTH_MODE and its dependent variables
  const existingAuthMode = existingVars.get('AUTH_MODE') || 'local'
  const authMode = await select({
    message: 'AUTH_MODE:',
    choices: [
      {
        name: 'local (Google OAuth)',
        value: 'local',
        description: 'Use BetterAuth with Google OAuth for authentication',
      },
      {
        name: 'cloudflare-access',
        value: 'cloudflare-access',
        description: 'Use Cloudflare Access for authentication',
      },
    ],
    default: existingAuthMode,
  })
  newVars.set('AUTH_MODE', authMode)
  console.log('')

  // Always ask for BETTER_AUTH_SECRET (needed for both modes)
  const secretVarInfo = varsWithComments.find(v => v.name === 'BETTER_AUTH_SECRET')
  if (secretVarInfo) {
    await promptForVar(secretVarInfo)
  }

  // Ask for mode-specific variables and set placeholders for the others
  if (authMode === 'local') {
    // Ask for Google OAuth variables
    for (const varName of LOCAL_AUTH_VARS) {
      const varInfo = varsWithComments.find(v => v.name === varName)
      if (varInfo) {
        await promptForVar(varInfo)
      }
    }
    // Set placeholder for Cloudflare Access variable
    for (const varName of CF_ACCESS_AUTH_VARS) {
      newVars.set(varName, '_')
    }
  } else {
    // Ask for Cloudflare Access variable
    for (const varName of CF_ACCESS_AUTH_VARS) {
      const varInfo = varsWithComments.find(v => v.name === varName)
      if (varInfo) {
        await promptForVar(varInfo)
      }
    }
    // Set placeholder for Google OAuth variables
    for (const varName of LOCAL_AUTH_VARS) {
      newVars.set(varName, '_')
    }
  }

  // Step 5: Write vars file
  console.log(`Step 5: Writing ${varsPath}`)
  writeVarsFile(varsPath, newVars)
  console.log(`  ${green}✓${reset} Wrote ${varsPath}`)

  // Step 6: Generate wrangler config
  console.log(`\nStep 6: Generating ${wranglerPath}`)
  try {
    const config = generateWranglerConfig(instance, d1DatabaseId)
    writeFileSync(wranglerPath, config)
    console.log(`  ${green}✓${reset} Wrote ${wranglerPath}`)
  } catch (error: any) {
    console.error(`  Failed to generate wrangler config: ${error.message}`)
    process.exit(1)
  }

  // Step 7: Push secrets to Cloudflare
  console.log('\nStep 7: Pushing secrets to Cloudflare')
  const syncPassed = await syncSecretsToCloudflare(instance)

  // Print summary
  console.log('\n' + '='.repeat(60))
  if (syncPassed) {
    console.log('Setup complete!')
  } else {
    console.log('Setup complete (some secrets failed to sync)')
  }
  console.log('='.repeat(60))
  console.log(`\nResources with prefix "${instance}-":`)
  console.log(`  Worker:   ${workerName}`)
  console.log(`  R2:       ${filesBucketName} (files)`)
  console.log(`  D1:       ${dbName} (${d1DatabaseId})`)

  console.log(`\nNext steps:`)
  console.log(`  1. Run database migrations: bun ops server -i ${instance} db migrate`)
  console.log(`  2. Deploy: bun ops server -i ${instance} deploy`)
}
