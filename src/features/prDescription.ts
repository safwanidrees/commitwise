import * as vscode from 'vscode';
import { getConfig } from '../config';
import { filterDiffs } from '../git/diffFilter';
import { splitDiff } from '../git/diffParse';
import { resolveRepository } from '../git/gitApi';
import { git, refExists } from '../git/gitExec';
import { Repository } from '../git/gitTypes';
import { buildPrDescriptionPrompt } from '../prompt/promptBuilder';
import { cleanMessage } from '../prompt/validator';
import { showError, UserError } from '../ui/errors';
import { ui } from '../ui/prompts';
import { withCliProgress } from '../ui/progress';
import { callClaude } from './claudeCall';
import { resolveContext } from './messageContext';
import { confirmNoSecrets } from './secretScan';

export async function prDescription(arg?: unknown): Promise<void> {
  try {
    await run(arg);
  } catch (err) {
    await showError(err);
  }
}

async function run(arg: unknown): Promise<void> {
  const repo = await resolveRepository(arg);
  const cfg = getConfig(repo.rootUri);
  const branch = repo.state.HEAD?.name;
  const base = await defaultBranch(repo);
  if (!base) {
    throw new UserError('Could not find the default branch (tried origin/HEAD, main, master, develop).');
  }
  if (branch && (base === branch || base.endsWith(`/${branch}`))) {
    throw new UserError(`You are on the default branch (${branch}). Check out a feature branch first.`);
  }
  const mergeBase = (await git(repo, ['merge-base', 'HEAD', base])).trim();
  const subjects = (await git(repo, ['log', '--no-merges', '--format=%s', `${mergeBase}..HEAD`]))
    .split('\n')
    .filter(Boolean);
  if (subjects.length === 0) {
    throw new UserError(`This branch has no commits that aren't on ${base}.`);
  }
  // Committed changes only: uncommitted work isn't part of the PR yet.
  const files = splitDiff(await git(repo, ['diff', '--no-color', '--no-ext-diff', '-M', mergeBase, 'HEAD']));
  const exclude = await confirmNoSecrets(files, cfg.ignoreGlobs, cfg.secretScan);
  const diff = filterDiffs(files, cfg.ignoreGlobs, cfg.maxDiffChars, exclude);
  const { ctx } = await resolveContext(repo, cfg, diff, 'branch changes');
  const prompt = buildPrDescriptionPrompt({ ...ctx, baseBranch: base, commitSubjects: subjects });

  const text = await withCliProgress('Commitwise: writing PR description', async (token) =>
    cleanMessage((await callClaude(repo, cfg, prompt, token)).text),
  );
  const doc = await vscode.workspace.openTextDocument({ content: `${text}\n`, language: 'markdown' });
  await vscode.window.showTextDocument(doc);
  const choice = await ui.info('PR description ready.', 'Copy to Clipboard');
  if (choice === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(doc.getText());
  }
}

async function defaultBranch(repo: Repository): Promise<string | undefined> {
  try {
    const ref = (await git(repo, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])).trim();
    if (ref && ref !== 'origin/HEAD') {
      return ref;
    }
  } catch {
    // no origin/HEAD
  }
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master', 'origin/develop', 'develop']) {
    if (await refExists(repo, candidate)) {
      return candidate;
    }
  }
  return undefined;
}
