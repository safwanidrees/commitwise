import { getConfig } from '../config';
import { filterDiffs } from '../git/diffFilter';
import { getChangesForMessage, resolveRepository, setCommitMessage } from '../git/gitApi';
import { buildOptionsPrompt } from '../prompt/promptBuilder';
import { checkSubject, cleanMessage } from '../prompt/validator';
import { showError, UserError } from '../ui/errors';
import { PickItem, ui } from '../ui/prompts';
import { withCliProgress } from '../ui/progress';
import { callClaude, structuredOf } from './claudeCall';
import { resolveContext } from './messageContext';
import { confirmNoSecrets } from './secretScan';

export async function generateOptions(arg?: unknown): Promise<void> {
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
    throw new UserError('There are no changes to describe.');
  }
  const exclude = await confirmNoSecrets(changes.files, cfg.ignoreGlobs, cfg.secretScan);
  const diff = filterDiffs(changes.files, cfg.ignoreGlobs, cfg.maxDiffChars, exclude);
  const { ctx, pattern } = await resolveContext(repo, cfg, diff, changes.source);
  const prompt = buildOptionsPrompt(ctx, cfg.optionsCount);

  const options = await withCliProgress('Commitwise: generating options', async (token) =>
    parseOptions(structuredOf(await callClaude(repo, cfg, prompt, token))),
  );
  if (options.length === 0) {
    throw new UserError('Claude did not return any options.');
  }
  const picked = await ui.pick(
    options.map((o, i) => {
      const [subject = '', ...rest] = o.split('\n');
      const item: PickItem & { message: string } = { id: `option-${i}`, label: subject, message: o };
      if (!checkSubject(o, pattern).ok) {
        item.description = '$(warning) does not match guidelines pattern';
      }
      const body = rest.join(' ').trim();
      if (body) {
        item.detail = body;
      }
      return item;
    }),
    { placeHolder: 'Choose a commit message', matchOnDetail: true },
  );
  if (picked) {
    setCommitMessage(repo, picked.message);
  }
}

export function parseOptions(data: unknown): string[] {
  const list = (data as { options?: unknown } | null)?.options ?? data;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((o): o is string => typeof o === 'string').map(cleanMessage).filter(Boolean);
}
