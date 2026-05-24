export interface RunCommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
}

export interface RunCommandResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class CommandError extends Error {
  result: RunCommandResult;

  constructor(message: string, result: RunCommandResult) {
    super(message);
    this.name = 'CommandError';
    this.result = result;
  }
}

function decodeOutput(data: Uint8Array | null): string {
  if (!data) return '';
  return new TextDecoder().decode(data).trim();
}

export async function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<RunCommandResult> {
  const exePath = Bun.which(command);
  if (!exePath) {
    throw new Error(`Command not found: ${command}`);
  }

  const mergedEnv = {
    ...process.env,
    ...(options.env || {}),
  };
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(mergedEnv)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  const proc = Bun.spawn([exePath, ...args], {
    cwd: options.cwd,
    env,
    stdin: 'inherit',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdoutBuffer, stderrBuffer, exitCode] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).arrayBuffer() : new ArrayBuffer(0),
    proc.stderr ? new Response(proc.stderr).arrayBuffer() : new ArrayBuffer(0),
    proc.exited,
  ]);

  const result: RunCommandResult = {
    command,
    args,
    exitCode,
    stdout: decodeOutput(new Uint8Array(stdoutBuffer)),
    stderr: decodeOutput(new Uint8Array(stderrBuffer)),
  };

  if (exitCode !== 0 && !options.allowFailure) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new CommandError(
      `Command failed: ${command} ${args.join(' ')}${details ? `\n${details}` : ''}`,
      result
    );
  }

  return result;
}
