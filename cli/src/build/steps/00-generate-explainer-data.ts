import type { BuildContext } from '../context'
import type { BuildStep } from '../types'
import { generateExplainerData } from '../explainers'
import log from '../../logger'

export const generateExplainerDataStep: BuildStep = {
  name: '00-generate-explainer-data',
  description: 'Generate explainer metadata',

  async execute(ctx: BuildContext): Promise<void> {
    const explainers = await generateExplainerData(ctx.rootDir)
    if (explainers.length > 0) {
      log.debug(`  Generated explainer metadata for ${explainers.length} files`)
    }
  },
}
