import * as vscode from 'vscode';
import { Config, getConfig } from '../config';
import { filterDiffs } from '../git/diffFilter';
import { getChangesForMessage, resolveRepository, setCommitMessage } from '../git/gitApi';
import { Repository } from '../git/gitTypes';
import { buildMessagePrompt, MessageContext } from '../prompt/promptBuilder';
import { checkSubject, cleanMessage, retryFeedback } from '../prompt/validator';
import { showError, UserError } from '../ui/errors';
import { log } from '../ui/log';
import { ui } from '../ui/prompts';
import { withCliProgress } from '../ui/progress';
import { generateWithAgent } from './agentMessage';
import { callClaude } from './claudeCall';
import { resolveContext } from './messageContext';
import { confirmNoSecrets } from './secretScan';

export async function generateMessage(arg?: unknown): Promise<void> {
  try {
    await run(arg);
  } catch (err) {
    await showError(err);
  }
}

async function run(arg: unknown): Promise<void> {
  const repo = await resolveRepository(arg);
  const cfg = getConfig(repo.rootUri);
  const changes = await getChangesForMessage(repo, cfg.useUnstagedIfNothingStaged);
  if (!changes || changes.files.length === 0) {
    throw new UserError(cfg.useUnstagedIfNothingStaged ? 'There are no changes to describe.' : 'Nothing is staged.');
  }
  const agent = cfg.mode === 'agent';
  const exclude = await confirmNoSecrets(changes.files, cfg.ignoreGlobs, cfg.secretScan, { agent });
  const diff = filterDiffs(changes.files, cfg.ignoreGlobs, cfg.maxDiffChars, exclude);
  const { ctx, pattern } = await resolveContext(repo, cfg, diff, changes.source);

  const message = agent
    ? await withCliProgress('Commitwise: Claude is reading your changes (agent mode)', (token, report) =>
        generateWithAgent(repo, cfg, ctx, changes.source === 'staged changes' ? 'staged' : 'uncommitted', pattern, token, report),
      )
    : await withCliProgress('Commitwise: generating commit message', (token, report) =>
        generateFast(repo, cfg, ctx, pattern, token, report),
      );
  setCommitMessage(repo, message);
}

async function generateFast(
  repo: Repository,
  cfg: Config,
  ctx: MessageContext,
  pattern: string | undefined,
  token: vscode.CancellationToken,
  report: (message: string) => void,
): Promise<string> {
  const prompt = buildMessagePrompt(ctx);
  let msg = cleanMessage((await callClaude(repo, cfg, prompt, token)).text);
  const check = checkSubject(msg, pattern);
  if (check.ok && check.invalidPattern) {
    log().warn(`Ignoring invalid guidelines pattern: ${check.invalidPattern}`);
  }
  if (!check.ok && pattern) {
    report('subject did not match the guidelines pattern; retrying');
    log().info(`Subject "${check.subject}" did not match /${pattern}/; retrying once.`);
    const retry = { ...prompt, user: `${prompt.user}\n\n${retryFeedback(pattern, msg)}` };
    msg = cleanMessage((await callClaude(repo, cfg, retry, token)).text);
    if (!checkSubject(msg, pattern).ok) {
      void ui.warn(`Commitwise: the subject line still doesn't match the guidelines pattern /${pattern}/. Please edit it.`);
    }
  }
  return msg;
}
