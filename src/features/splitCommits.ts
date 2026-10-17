import * as vscode from 'vscode';
import { getConfig } from '../config';
import { filterDiffs } from '../git/diffFilter';
import { FileDiff, splitDiff } from '../git/diffParse';
import { absPath, readAsNewFiles, readUntracked, relPath, resolveRepository, untrackedChanges } from '../git/gitApi';
import { git } from '../git/gitExec';
import { Repository, Status } from '../git/gitTypes';
import { buildSplitPrompt, splitRetryFeedback } from '../prompt/promptBuilder';
import { cleanMessage } from '../prompt/validator';
import { showError, UserError } from '../ui/errors';
import { log } from '../ui/log';
import { PickItem, ui } from '../ui/prompts';
import { withCliProgress } from '../ui/progress';
import { callClaude, structuredOf } from './claudeCall';
import { resolveContext } from './messageContext';
import { confirmNoSecrets } from './secretScan';
import { ChangeUnit, PlanGroup, pathsToStage, validatePlan } from './splitPlan';

export async function splitCommits(arg?: unknown): Promise<void> {
  try {
    await run(arg);
  } catch (err) {
    await showError(err);
  }
}

async function run(arg: unknown): Promise<void> {
  const repo = await resolveRepository(arg);
  const cfg = getConfig(repo.rootUri);
  await repo.status();

  if (repo.state.mergeChanges.length > 0) {
    throw new UserError('Resolve the merge conflicts before splitting changes.');
  }
  const units = collectUnits(repo);
  if (units.length === 0) {
    throw new UserError('There are no changes to split.');
  }
  if (repo.state.indexChanges.length > 0) {
    const choice = await ui.warnModal(
      'Some changes are staged.',
      'Splitting uses all changes (staged, unstaged and untracked) and will re-stage files group by group. Nothing is discarded.',
      'Use All Changes',
    );
    if (choice !== 'Use All Changes') {
      return;
    }
  }

  const files = await allChanges(repo, units);
  const exclude = await confirmNoSecrets(files, cfg.ignoreGlobs, cfg.secretScan);
  const diff = filterDiffs(files, cfg.ignoreGlobs, cfg.maxDiffChars, exclude);
  const { ctx } = await resolveContext(repo, cfg, diff, 'changes');
  const prompt = buildSplitPrompt(ctx, units);

  const groups = await withCliProgress('Commitwise: planning commits', async (token, report) => {
    let check = validatePlan(structuredOf(await callClaude(repo, cfg, prompt, token)), units);
    if (!check.ok) {
      report('plan was incomplete; retrying');
      log().info(`Invalid split plan, retrying: ${check.errors.join(' ')}`);
      const retry = { ...prompt, user: `${prompt.user}\n\n${splitRetryFeedback(check.errors)}` };
      check = validatePlan(structuredOf(await callClaude(repo, cfg, retry, token)), units);
    }
    if (!check.ok) {
      throw new UserError(`Claude's commit plan was invalid: ${check.errors.slice(0, 3).join(' ')}`);
    }
    return check.groups.map((g) => ({ ...g, message: cleanMessage(g.message) }));
  });

  const approved = await reviewPlan(groups, units);
  if (!approved) {
    return;
  }
  await executePlan(repo, approved, units);
}

/** Every changed path as a unit; a staged rename is one unit covering both paths. */
export function collectUnits(repo: Repository): ChangeUnit[] {
  const units = new Map<string, ChangeUnit>();
  const s = repo.state;
  for (const c of s.indexChanges) {
    const p = relPath(repo, c.uri);
    const unit: ChangeUnit = { path: p };
    if (c.status === Status.INDEX_RENAMED && c.originalUri.fsPath !== c.uri.fsPath) {
      unit.oldPath = relPath(repo, c.originalUri);
    }
    units.set(p, unit);
  }
  const renamedFrom = new Set([...units.values()].map((u) => u.oldPath).filter(Boolean));
  for (const c of [...s.workingTreeChanges, ...(s.untrackedChanges ?? [])]) {
    const p = relPath(repo, c.uri);
    if (!units.has(p) && !renamedFrom.has(p)) {
      units.set(p, { path: p });
    }
  }
  return [...units.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Staged + unstaged changes vs HEAD (one git call) plus untracked file contents. */
async function allChanges(repo: Repository, units: ChangeUnit[]): Promise<FileDiff[]> {
  if (!repo.state.HEAD?.commit) {
    // No commits yet: `git diff HEAD` fails, and every file is new anyway, so
    // describe each one by what is on disk (what will be committed).
    return readAsNewFiles(repo, units.map((u) => vscode.Uri.file(absPath(repo, u.path))));
  }
  const files = splitDiff(await git(repo, ['diff', 'HEAD', '--no-color', '--no-ext-diff', '-M']));
  files.push(...(await readUntracked(repo, untrackedChanges(repo))));
  return files;
}

// ---------------------------------------------------------------- review UI

type Item = PickItem & { group?: number };

/** Lets the user edit messages, move files, or drop groups. Returns undefined on cancel. */
export async function reviewPlan(initial: PlanGroup[], units: ChangeUnit[]): Promise<PlanGroup[] | undefined> {
  let groups = initial.map((g) => ({ files: [...g.files], message: g.message }));
  const dropped: string[] = [];
  for (;;) {
    groups = groups.filter((g) => g.files.length > 0);
    if (groups.length === 0) {
      void ui.info('Commitwise: every group was dropped; nothing to commit.');
      return undefined;
    }
    const items: Item[] = [
      { id: 'commit', label: `$(check) Commit ${groups.length} group${groups.length === 1 ? '' : 's'}`, alwaysShow: true },
      { id: 'cancel', label: '$(close) Cancel', alwaysShow: true },
      { id: 'sep', label: 'Planned commits (select one to edit)', kind: vscode.QuickPickItemKind.Separator },
      ...groups.map((g, i) => ({
        id: `group-${i}`,
        group: i,
        label: `${i + 1}. ${g.message.split('\n')[0] ?? ''}`,
        detail: g.files.join(', '),
      })),
    ];
    if (dropped.length > 0) {
      items.push({ id: 'dropped', label: `Left uncommitted: ${dropped.join(', ')}`, kind: vscode.QuickPickItemKind.Separator });
    }
    const choice = await ui.pick(items, { placeHolder: 'Review the commit plan', ignoreFocusOut: true, matchOnDetail: true });
    if (!choice || choice.id === 'cancel') {
      return undefined;
    }
    if (choice.id === 'commit') {
      return groups;
    }
    if (choice.group !== undefined) {
      await editGroup(groups, choice.group, dropped, units);
    }
  }
}

async function editGroup(groups: PlanGroup[], index: number, dropped: string[], _units: ChangeUnit[]): Promise<void> {
  const g = groups[index];
  if (!g) {
    return;
  }
  const action = await ui.pick(
    [
      { id: 'edit', label: '$(edit) Edit message' },
      { id: 'move', label: '$(arrow-swap) Move a file to another commit' },
      { id: 'drop', label: '$(trash) Drop this commit (leave its files uncommitted)' },
      { id: 'back', label: '$(arrow-left) Back' },
    ],
    { placeHolder: g.message.split('\n')[0] ?? '' },
  );
  if (action?.id === 'edit') {
    const msg = await ui.input({ value: g.message, prompt: 'Commit message (use \\n for a new line)', ignoreFocusOut: true });
    if (msg?.trim()) {
      g.message = msg.replace(/\\n/g, '\n').trim();
    }
  } else if (action?.id === 'drop') {
    dropped.push(...g.files);
    groups.splice(index, 1);
  } else if (action?.id === 'move') {
    const file = await ui.pick(g.files.map((f) => ({ id: f, label: f })), { placeHolder: 'File to move' });
    if (!file) {
      return;
    }
    const target = await ui.pick(
      [
        ...groups.map((t, i) => ({ id: `group-${i}`, label: `${i + 1}. ${t.message.split('\n')[0] ?? ''}`, i })).filter((t) => t.i !== index),
        { id: 'new', label: '$(add) New commit', i: -1 },
      ],
      { placeHolder: `Move ${file.id} to…` },
    );
    if (!target) {
      return;
    }
    g.files = g.files.filter((f) => f !== file.id);
    if (target.i === -1) {
      const message = await ui.input({ prompt: `Message for the new commit containing ${file.id}`, ignoreFocusOut: true });
      groups.push({ files: [file.id], message: message?.trim() || `chore: update ${file.id}` });
    } else {
      groups[target.i]?.files.push(file.id);
    }
  }
}

// ---------------------------------------------------------------- execution

/**
 * For each group: unstage everything, stage the group's files, commit.
 * Stops at the first failure; never discards changes or pushes.
 */
export async function executePlan(repo: Repository, groups: PlanGroup[], units: ChangeUnit[]): Promise<void> {
  const made: string[] = [];
  let failure: { index: number; error: unknown } | undefined;
  let stoppedEarly = false;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Commitwise: committing', cancellable: true },
    async (progress, token) => {
      for (const [i, g] of groups.entries()) {
        if (token.isCancellationRequested) {
          stoppedEarly = true;
          return;
        }
        progress.report({ message: `${i + 1}/${groups.length}: ${g.message.split('\n')[0] ?? ''}`, increment: 100 / groups.length });
        let step = 'unstaging files';
        try {
          await repo.status();
          const staged = repo.state.indexChanges.flatMap((c) => [c.uri.fsPath, c.originalUri.fsPath]);
          if (staged.length > 0) {
            await unstage(repo, [...new Set(staged)]);
          }
          step = 'staging files';
          await repo.add(pathsToStage(g.files, units).map((p) => absPath(repo, p)));
          step = 'committing';
          await repo.commit(g.message);
          made.push(g.message.split('\n')[0] ?? '');
          log().info(`Committed ${g.files.length} file(s): ${g.message.split('\n')[0] ?? ''}`);
        } catch (error) {
          failure = { index: i, error: new Error(`${step}: ${describeGitError(error)}`) };
          return;
        }
      }
    },
  );

  const remaining = groups.length - made.length;
  if (failure) {
    const reason = failure.error instanceof Error ? failure.error.message : String(failure.error);
    log().error(`Split stopped at commit ${failure.index + 1}: ${reason}`);
    void ui.error(
      `Commitwise made ${made.length} of ${groups.length} commits, then commit ${failure.index + 1} failed: ${reason}. ` +
        `The remaining ${remaining} group(s) are still in your working tree (the failed group's files may be staged). Nothing was discarded or pushed.`,
    );
  } else if (stoppedEarly) {
    void ui.warn(
      `Commitwise stopped after ${made.length} of ${groups.length} commits. The rest are still in your working tree.`,
    );
  } else {
    void ui.info(`Commitwise created ${made.length} commit${made.length === 1 ? '' : 's'}. Nothing was pushed.`);
  }
}

/**
 * Unstages paths. With no commits yet, the git extension's `revert` runs
 * `git rm --cached`, which refuses files that were edited after staging;
 * `git reset` handles an unborn HEAD fine and never touches the working tree.
 */
async function unstage(repo: Repository, absPaths: string[]): Promise<void> {
  if (repo.state.HEAD?.commit) {
    await repo.revert(absPaths);
    return;
  }
  const rels = absPaths.map((p) => relPath(repo, vscode.Uri.file(p)));
  await git(repo, ['reset', '-q', '--', ...rels]);
  await repo.status();
}

/** Git extension errors carry git's own stderr, which says far more than the message. */
function describeGitError(error: unknown): string {
  const e = error as { message?: string; stderr?: string } | undefined;
  const stderr = e?.stderr?.trim().split('\n').pop();
  return stderr || e?.message || String(error);
}
