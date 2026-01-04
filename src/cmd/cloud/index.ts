import { Command } from 'commander'
import { loginCommand, logoutCommand, whoamiCommand } from './auth'

export function registerCloudCommands(program: Command): void {
  const cloud = program
    .command('cloud')
    .description('Scratch Cloud commands')

  cloud
    .command('login')
    .description('Log in to Scratch Cloud')
    .action(async () => {
      try {
        await loginCommand()
      } catch (error: any) {
        console.error('Login failed:', error.message)
        process.exit(1)
      }
    })

  cloud
    .command('logout')
    .description('Log out from Scratch Cloud')
    .action(async () => {
      try {
        await logoutCommand()
      } catch (error: any) {
        console.error('Logout failed:', error.message)
        process.exit(1)
      }
    })

  cloud
    .command('whoami')
    .description('Show current user info')
    .action(async () => {
      try {
        await whoamiCommand()
      } catch (error: any) {
        console.error('Failed to get user info:', error.message)
        process.exit(1)
      }
    })
}
