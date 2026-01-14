// Config commands - validation and secrets management

import { existsSync } from 'fs'
import { green, yellow, red, reset, check, printResult } from '../../lib/colors'
import {
  VARS_EXAMPLE,
  WRANGLER_TEMPLATE,
  ENV_TS,
  parseVarsFile,
  getRuntimeVars,
  getRequiredVarsWithComments,
  parseWranglerTemplate,
  checkGitignore,
  checkEnvTs,
  getInstanceVarsPath,
  getInstanceWranglerPath,
  validateInstanceVars,
  CONFIG_ONLY_VARS,
} from '../../lib/config'

async function validateShared(): Promise<boolean> {
  console.log('Checking shared config...')
  let allPassed = true

  const varsExampleExists = existsSync(VARS_EXAMPLE)
  printResult(check(varsExampleExists, `${VARS_EXAMPLE} exists`))
  if (!varsExampleExists) {
    allPassed = false
    return allPassed
  }

  const templateExists = existsSync(WRANGLER_TEMPLATE)
  if (templateExists) {
    printResult(check(true, `${WRANGLER_TEMPLATE} exists`))
  } else {
    printResult(check(false, `${WRANGLER_TEMPLATE} not found`))
    allPassed = false
  }

  const gitignore = checkGitignore()
  printResult(check(gitignore.hasEnvPattern, `.gitignore covers *.env files`))
  printResult(check(gitignore.hasVarsPattern, `.gitignore covers *.vars files`))
  if (!gitignore.hasEnvPattern || !gitignore.hasVarsPattern) allPassed = false

  if (templateExists) {
    const wrangler = parseWranglerTemplate()
    if (wrangler.main) {
      const mainPath = `server/${wrangler.main}`
      const mainExists = existsSync(mainPath)
      printResult(check(mainExists, `main: ${wrangler.main} exists`))
      if (!mainExists) allPassed = false
    }

    if (wrangler.r2Binding) {
      printResult(check(true, `R2 binding: ${wrangler.r2Binding} configured`))
    } else {
      printResult(check(false, 'R2 binding configured'))
      allPassed = false
    }
  }

  const runtimeVars = getRuntimeVars()
  const envCheck = checkEnvTs(runtimeVars)
  if (envCheck.missing.length === 0) {
    printResult(check(true, `${ENV_TS} contains all ${runtimeVars.length} runtime variables`))
  } else {
    printResult(check(false, `${ENV_TS} missing: ${envCheck.missing.join(', ')}`))
    console.log(`    Run: bun ops server regenerate-env-ts`)
    allPassed = false
  }

  return allPassed
}

async function validateInstance(instance: string): Promise<boolean> {
  console.log(`\nChecking ${instance} config...`)
  let allPassed = true

  const varsPath = getInstanceVarsPath(instance)
  const wranglerPath = getInstanceWranglerPath(instance)

  const varsExists = existsSync(varsPath)
  printResult(check(varsExists, `${varsPath} exists`))
  if (!varsExists) {
    console.log(`    Run: bun ops server -i ${instance} setup`)
    return false
  }

  const wranglerExists = existsSync(wranglerPath)
  printResult(check(wranglerExists, `${wranglerPath} exists`))
  if (!wranglerExists) {
    console.log(`    Run: bun ops server -i ${instance} setup`)
    return false
  }

  const varsWithDefaults = getRequiredVarsWithComments()
  const requiredVars = varsWithDefaults.map(v => v.name)
  const instanceVars = parseVarsFile(varsPath)
  const missingVars: string[] = []
  const emptyVars: string[] = []
  const extraVars: string[] = []

  for (const varInfo of varsWithDefaults) {
    const { name: varName, defaultValue } = varInfo
    if (!instanceVars.has(varName)) {
      missingVars.push(varName)
    } else if (instanceVars.get(varName) === '' && defaultValue !== '') {
      emptyVars.push(varName)
    }
  }

  for (const varName of instanceVars.keys()) {
    if (!requiredVars.includes(varName)) {
      extraVars.push(varName)
    }
  }

  const templateValidation = validateInstanceVars(instance)

  if (missingVars.length === 0 && emptyVars.length === 0 && templateValidation.invalid.length === 0) {
    printResult(check(true, `All ${requiredVars.length} variables set`))
  } else {
    if (missingVars.length > 0) {
      printResult(check(false, `Missing: ${missingVars.join(', ')}`))
    }
    if (emptyVars.length > 0) {
      printResult(check(false, `Empty: ${emptyVars.join(', ')}`))
    }
    if (templateValidation.invalid.length > 0) {
      printResult(check(false, `Invalid: ${templateValidation.invalid.join(', ')}`))
    }
    allPassed = false
  }

  if (extraVars.length > 0) {
    printResult(check(false, `Extra (not in ${VARS_EXAMPLE}): ${extraVars.join(', ')}`))
    allPassed = false
  }

  return allPassed
}

export async function syncSecretsToCloudflare(instance: string): Promise<boolean> {
  const varsPath = getInstanceVarsPath(instance)
  const wranglerPath = getInstanceWranglerPath(instance)

  if (!existsSync(varsPath)) {
    console.error(`Error: ${varsPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    return false
  }

  if (!existsSync(wranglerPath)) {
    console.error(`Error: ${wranglerPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    return false
  }

  const configArg = wranglerPath.replace('server/', '')
  const instanceVars = parseVarsFile(varsPath)
  const runtimeVars = getRuntimeVars()

  const missingOrEmpty: string[] = []
  for (const varName of runtimeVars) {
    if (!instanceVars.has(varName) || instanceVars.get(varName) === '') {
      missingOrEmpty.push(varName)
    }
  }

  if (missingOrEmpty.length > 0) {
    console.log(`Cannot sync: ${varsPath} has missing/empty values: ${missingOrEmpty.join(', ')}\n`)
    return false
  }

  let existingSecrets: Set<string> = new Set()
  try {
    const proc = Bun.spawn(['bunx', 'wrangler', 'secret', 'list', '--format=json', '-c', configArg], {
      cwd: 'server',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    if (exitCode === 0) {
      const stdout = await new Response(proc.stdout).text()
      try {
        const secrets = JSON.parse(stdout) as { name: string }[]
        existingSecrets = new Set(secrets.map(s => s.name))
      } catch {
        existingSecrets = new Set(
          stdout.trim().split('\n').filter(line => line.trim())
        )
      }
    }
  } catch {
    // Ignore errors listing secrets
  }

  const toDelete: string[] = []
  for (const secretName of existingSecrets) {
    if (!runtimeVars.includes(secretName)) {
      toDelete.push(secretName)
    }
  }

  let allPassed = true

  if (toDelete.length > 0) {
    console.log('Removing extra secrets from Cloudflare...')
    for (const name of toDelete) {
      process.stdout.write(`  Deleting ${name}... `)

      const proc = Bun.spawn(['bunx', 'wrangler', 'secret', 'delete', name, '-c', configArg], {
        cwd: 'server',
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      })

      proc.stdin.write('y\n')
      proc.stdin.end()

      const exitCode = await proc.exited
      if (exitCode === 0) {
        console.log(`${green}✓${reset}`)
      } else {
        const stderr = await new Response(proc.stderr).text()
        console.log(`${red}✗${reset} ${stderr.trim()}`)
        allPassed = false
      }
    }
    console.log('')
  }

  console.log('Syncing secrets to Cloudflare...')
  for (const [name, value] of instanceVars) {
    // Skip config-only vars (they're for wrangler config, not runtime secrets)
    if (CONFIG_ONLY_VARS.includes(name)) continue

    process.stdout.write(`  Pushing ${name}... `)

    const proc = Bun.spawn(['bunx', 'wrangler', 'secret', 'put', name, '-c', configArg], {
      cwd: 'server',
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    proc.stdin.write(value)
    proc.stdin.end()

    const exitCode = await proc.exited
    if (exitCode === 0) {
      console.log(`${green}✓${reset}`)
    } else {
      const stderr = await new Response(proc.stderr).text()
      console.log(`${red}✗${reset} ${stderr.trim()}`)
      allPassed = false
    }
  }

  console.log('')
  return allPassed
}

async function validateSecrets(instance: string, showFix: boolean): Promise<boolean> {
  const varsPath = getInstanceVarsPath(instance)
  const wranglerPath = getInstanceWranglerPath(instance)

  if (!existsSync(varsPath) || !existsSync(wranglerPath)) {
    return false
  }

  const configArg = wranglerPath.replace('server/', '')
  const runtimeVars = getRuntimeVars()

  console.log('\nChecking Cloudflare secrets...')
  try {
    const proc = Bun.spawn(['bunx', 'wrangler', 'secret', 'list', '--format=json', '-c', configArg], {
      cwd: 'server',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      if (stderr.includes('not logged in') || stderr.includes('authentication')) {
        printResult(check(false, 'Not logged in to Cloudflare'))
        console.log('    Run: bunx wrangler login')
      } else {
        printResult(check(false, `Failed to list secrets: ${stderr.trim()}`))
      }
      return false
    }

    const stdout = await new Response(proc.stdout).text()
    let secrets: { name: string }[] = []
    try {
      secrets = JSON.parse(stdout)
    } catch {
      secrets = stdout.trim().split('\n')
        .filter(line => line.trim())
        .map(name => ({ name: name.trim() }))
    }

    const secretNames = new Set(secrets.map(s => s.name))
    const missingSecrets: string[] = []
    const extraSecrets: string[] = []

    for (const varName of runtimeVars) {
      if (!secretNames.has(varName)) {
        missingSecrets.push(varName)
      }
    }

    for (const secretName of secretNames) {
      if (!runtimeVars.includes(secretName)) {
        extraSecrets.push(secretName)
      }
    }

    if (missingSecrets.length === 0 && extraSecrets.length === 0) {
      printResult(check(true, `All ${runtimeVars.length} secrets configured`))
      return true
    } else {
      if (missingSecrets.length > 0) {
        printResult(check(false, `Missing secrets: ${missingSecrets.join(', ')}`))
        if (showFix) {
          console.log('\n    To fix, run: bun ops server -i ' + instance + ' config push')
        }
      }
      if (extraSecrets.length > 0) {
        printResult(check(false, `Extra secrets (not in vars): ${extraSecrets.join(', ')}`))
        if (showFix) {
          console.log('\n    To fix, run: bun ops server -i ' + instance + ' config push')
        }
      }
      return false
    }
  } catch (error: any) {
    printResult(check(false, `Error checking secrets: ${error.message}`))
    return false
  }
}

export async function configCheckAction(instance: string, options: { fix?: boolean }): Promise<void> {
  let allPassed = true

  const sharedPassed = await validateShared()
  if (!sharedPassed) allPassed = false

  const instancePassed = await validateInstance(instance)
  if (!instancePassed) allPassed = false

  const secretsPassed = await validateSecrets(instance, options.fix || false)
  if (!secretsPassed) allPassed = false

  console.log('')
  if (allPassed) {
    console.log('Config validation passed.')
  } else {
    console.log('Config validation failed.')
    if (!options.fix) {
      console.log('Run with --fix to see commands to fix issues.')
    }
    process.exit(1)
  }
}

export async function configPushAction(instance: string): Promise<void> {
  console.log(`Pushing secrets for instance: ${instance}\n`)

  const syncPassed = await syncSecretsToCloudflare(instance)

  if (syncPassed) {
    console.log('Secrets synced successfully.')
  } else {
    console.log('Some secrets failed to sync.')
    process.exit(1)
  }
}
