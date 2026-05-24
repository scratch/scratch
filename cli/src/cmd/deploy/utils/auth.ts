import { CommandError, runCommand } from './spawn';

export async function ensureToolAvailable(tool: string, installHint: string): Promise<void> {
  try {
    await runCommand(tool, ['--version']);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Command not found')) {
      throw new Error(`${tool} is required but was not found. ${installHint}`);
    }
    throw error;
  }
}

export async function ensureAuthenticated(
  tool: string,
  args: string[],
  loginHint: string
): Promise<void> {
  try {
    await runCommand(tool, args);
  } catch (error) {
    if (error instanceof CommandError) {
      throw new Error(`Authentication check failed for ${tool}. ${loginHint}`);
    }
    throw error;
  }
}
