import { Config } from '../config';
import { extractTicket } from '../git/branchTicket';
import { FilterResult } from '../git/diffFilter';
import { historyExamples } from '../git/gitLog';
import { Repository } from '../git/gitTypes';
import { loadGuidelines } from '../guidelines/guidelinesLoader';
import { log } from '../ui/log';
import { MessageContext, StyleSource } from '../prompt/promptBuilder';

export interface ResolvedContext {
  ctx: MessageContext;
  /** Subject-line regex from the guidelines frontmatter, if any. */
  pattern?: string | undefined;
}

/** Style priority: guidelines file → learned history style → Conventional Commits. */
export async function resolveContext(
  repo: Repository,
  cfg: Config,
  diff: FilterResult,
  source: string,
): Promise<ResolvedContext> {
  const guidelines = await loadGuidelines(repo.rootUri.fsPath, cfg.guidelinesPath, cfg.guidelinesMaxBytes, (m) =>
    log().warn(m),
  );
  let style: StyleSource = { kind: 'default' };
  if (guidelines) {
    style = { kind: 'guidelines', path: guidelines.path, content: guidelines.content };
  } else if (cfg.useHistoryStyle) {
    const examples = await historyExamples(repo, cfg.historyCommitCount);
    if (examples) {
      style = { kind: 'history', examples };
    }
  }
  const branch = repo.state.HEAD?.name;
  return {
    ctx: { style, ticket: extractTicket(branch, cfg.ticketRegex), branch, diff, source },
    pattern: guidelines?.pattern,
  };
}
