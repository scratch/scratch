#!/usr/bin/env bun

import { Command } from 'commander'
import { registerServerCommands } from './commands/server/index'
import { registerCliCommands } from './commands/cli'
import { registerPrCommand } from './commands/pr'
import { registerCommitCommand } from './commands/commit'

const program = new Command()

program
  .name('ops')
  .description('Scratch ops CLI')
  .version('1.0.0')

registerServerCommands(program)
registerCliCommands(program)
registerPrCommand(program)
registerCommitCommand(program)

program.parse()
