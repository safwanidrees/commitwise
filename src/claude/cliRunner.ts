import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as vscode from 'vscode';
import { Prompt } from '../prompt/promptBuilder';
import { log } from '../ui/log';
import { buildAgentArgs, buildArgs } from './cliArgs';
import { childPath, locateClaude } from './cliLocator';
import { classifyFailure, CliErrorKind, CliResult, parseCliJson } from './cliOutput';

export class CliError extends Error {
  constructor(
    readonly kind: CliErrorKind,
    message: string,
    readonly detail?: string,
    readonly claudePath?: string,
  ) {
    super(message);
  }
}

export interface RunOptions {
  prompt: Prompt;
  claudePathSetting: string;
  /** Empty = the CLI's default model (what chat uses). */
  model: string;
  timeoutSeconds: number;
  /** Repo root when `runInRepoDirectory` is on; otherwise a neutral temp dir is used. */
  repoRoot?: string | undefined;
  /** Agent mode: read-only tools inside `repoRoot` (required); `prompt.system` is appended to Claude Code's own. */
  agent?: boolean;
  token?: vscode.CancellationToken | undefined;
}

export async function runClaude(opts: RunOptions): Promise<CliResult> {
  const binary = await locateClaude(opts.claudePathSetting);
  if (!binary) {
    throw new CliError('NOT_INSTALLED', 'claude CLI not found');
  }
  const inRepo = opts.repoRoot !== undefined;
  const model = opts.model || undefined;
  const args = opts.agent
    ? buildAgentArgs({ ...(model ? { model } : {}), appendSystem: opts.prompt.system })
    : buildArgs({ ...(model ? { model } : {}), system: opts.prompt.system, ...(opts.prompt.schema ? { schema: opts.prompt.schema } : {}), inRepo });
  const cwd = opts.repoRoot ?? os.tmpdir();
  log().info(
    `Running claude${opts.agent ? ' in agent mode' : ''} (model=${model ?? 'CLI default'}, cwd=${cwd}, system=${opts.prompt.system.length} chars, input=${opts.prompt.user.length} chars${opts.prompt.schema ? ', structured' : ''})`,
  );

  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env: { ...process.env, PATH: safeChildPath(binary) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let reason: 'timeout' | 'cancelled' | undefined;
    let spawnError: NodeJS.ErrnoException | undefined;

    const kill = (why: 'timeout' | 'cancelled'): void => {
      reason ??= why;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    };
    const timer = setTimeout(() => kill('timeout'), opts.timeoutSeconds * 1000);
    const cancelSub = opts.token?.onCancellationRequested(() => kill('cancelled'));
    if (opts.token?.isCancellationRequested) {
      kill('cancelled');
    }

    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.stdin.on('error', () => {
      // EPIPE if the process exits before reading stdin; the exit handler reports it.
    });
    child.on('error', (e: NodeJS.ErrnoException) => (spawnError = e));
    child.on('close', (code) => {
      clearTimeout(timer);
      cancelSub?.dispose();
      if (reason === 'cancelled') {
        return reject(new CliError('CANCELLED', 'Cancelled'));
      }
      if (reason === 'timeout') {
        return reject(new CliError('TIMEOUT', `No response after ${opts.timeoutSeconds}s`));
      }
      const parsed = parseCliJson(stdout);
      if (parsed && parsed.denials > 0) {
        log().info(`claude was refused ${parsed.denials} tool call(s) by the read-only permissions`);
      }
      if (parsed && !parsed.isError && code === 0) {
        if (!parsed.text.trim() && parsed.structured === undefined) {
          return reject(new CliError('UNKNOWN', 'Claude returned an empty response', stderr, binary));
        }
        return resolve(parsed);
      }
      const kind =
        code === 127
          ? 'NOT_INSTALLED'
          : classifyFailure({
              ...(spawnError?.code ? { spawnErrorCode: spawnError.code } : {}),
              stderr,
              ...(parsed ? { resultText: parsed.text, apiStatus: parsed.apiStatus } : {}),
            });
      const message =
        parsed?.text.trim() || stderr.trim().split('\n').pop() || spawnError?.message || `exit code ${code}`;
      reject(new CliError(kind, message, `exit=${code}\nstderr:\n${stderr}\nstdout:\n${stdout.slice(0, 2000)}`, binary));
    });

    child.stdin.end(opts.prompt.user, 'utf8');
  });
}

function safeChildPath(binary: string): string {
  try {
    return childPath(binary);
  } catch {
    return process.env['PATH'] ?? '';
  }
}

/** Convenience: `runInRepoDirectory` decides whether the CLI sees the repo. */
export function repoRootFor(runInRepoDirectory: boolean, root: vscode.Uri): string | undefined {
  return runInRepoDirectory ? root.fsPath : undefined;
}
