// Regenerate env.ts command

import { writeFileSync } from 'fs'
import { green, reset } from '../../lib/output'
import { ENV_TS, getRuntimeVars, generateEnvTs } from '../../lib/config'

export async function regenerateEnvAction(): Promise<void> {
  const runtimeVars = getRuntimeVars()
  const content = generateEnvTs(runtimeVars)
  writeFileSync(ENV_TS, content)
  console.log(`${green}✓${reset} Regenerated ${ENV_TS} with ${runtimeVars.length} runtime variables`)
}
