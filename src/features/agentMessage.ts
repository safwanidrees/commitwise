import * as vscode from 'vscode';
import { runClaude } from '../claude/cliRunner';
import { Config } from '../config';
import { Repository } from '../git/gitTypes';
import { AgentScope, buildAgentMessagePrompt, buildRewritePrompt, extractTaggedMessage, MessageContext } from '../prompt/promptBuilder';
import { checkSubject, cleanMessage } from '../prompt/validator';
import { log } from '../ui/log';
import { ui } from '../ui/prompts';
import { UserError } from '../ui/errors';

/**
 * Agent mode: Claude explores the repo with read-only tools, like asking
 * "Generate commit message for uncommitted code" in chat.
 */
export async function generateWithAgent(
  repo: Repository,
  cfg: Config,
  ctx: MessageContext,
  scope: AgentScope,
  pattern: string | undefined,
  token: vscode.CancellationToken,
  report: (message: string) => void,
): Promise<string> {
  const result = await runClaude({
    prompt: buildAgentMessagePrompt(ctx, scope),
    claudePathSetting: cfg.claudePath,
    model: cfg.agentModel,
    timeoutSeconds: cfg.agentTimeoutSeconds,
    repoRoot: repo.rootUri.fsPath,
    agent: true,
    token,
  });
  let msg = cleanMessage(extractTaggedMessage(result.text) ?? result.text);
  if (!msg) {
    throw new UserError('Claude finished without a commit message.');
  }
  if (pattern && !checkSubject(msg, pattern).ok) {
    // Re-running the whole investigation would be slow; a tool-less rewrite is enough.
    report('subject did not match the guidelines pattern; reformatting');
    log().info(`Agent subject did not match /${pattern}/; reformatting once.`);
    const fixed = await runClaude({
      prompt: buildRewritePrompt(ctx, msg, pattern),
      claudePathSetting: cfg.claudePath,
      model: cfg.agentModel,
      timeoutSeconds: cfg.timeoutSeconds,
      token,
    });
    msg = cleanMessage(fixed.text) || msg;
    if (!checkSubject(msg, pattern).ok) {
      void ui.warn(`Commitwise: the subject line still doesn't match the guidelines pattern /${pattern}/. Please edit it.`);
    }
  }
  return msg;
}
