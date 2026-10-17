import * as vscode from 'vscode';
import { CliResult } from '../claude/cliOutput';
import { repoRootFor, runClaude } from '../claude/cliRunner';
import { Config } from '../config';
import { Repository } from '../git/gitTypes';
import { Prompt } from '../prompt/promptBuilder';

/** Runs a prompt with the repo's settings applied. */
export function callClaude(
  repo: Repository,
  cfg: Config,
  prompt: Prompt,
  token: vscode.CancellationToken,
): Promise<CliResult> {
  return runClaude({
    prompt,
    claudePathSetting: cfg.claudePath,
    model: cfg.model,
    timeoutSeconds: cfg.timeoutSeconds,
    repoRoot: repoRootFor(cfg.runInRepoDirectory, repo.rootUri),
    token,
  });
}

/** Structured output if present, else the result text parsed as JSON. */
export function structuredOf(result: CliResult): unknown {
  if (result.structured !== undefined && result.structured !== null) {
    return result.structured;
  }
  const t = result.text.trim().replace(/^```(?:json)?\n?|\n?```$/g, '');
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}
