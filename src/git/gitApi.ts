import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { UserError } from '../ui/errors';
import { ui } from '../ui/prompts';
import { FileDiff, splitDiff, untrackedFileDiff } from './diffParse';
import { API, Change, GitExtension, Repository, Status } from './gitTypes';

/** Untracked files larger than this are sent by name only. */
const MAX_UNTRACKED_BYTES = 512 * 1024;

export async function getGitApi(): Promise<API> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    throw new UserError('The built-in Git extension is not available.');
  }
  const exports = ext.isActive ? ext.exports : await ext.activate();
  if (!exports.enabled) {
    throw new UserError('Git is disabled (setting "git.enabled").');
  }
  return exports.getAPI(1);
}

/**
 * The repo to act on: the one whose SCM title button was clicked, else the
 * active editor's, else the only one, else ask.
 */
export async function resolveRepository(arg?: unknown): Promise<Repository> {
  const repo = await findRepository(arg);
  await repo.status(); // HEAD/branch and change lists can be stale otherwise
  return repo;
}

async function findRepository(arg: unknown): Promise<Repository> {
  const api = await getGitApi();
  const rootUri = (arg as { rootUri?: unknown } | undefined)?.rootUri;
  if (rootUri instanceof vscode.Uri) {
    const repo = api.getRepository(rootUri);
    if (repo) {
      return repo;
    }
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.scheme === 'file') {
    const repo = api.getRepository(active);
    if (repo) {
      return repo;
    }
  }
  const repos = api.repositories;
  if (repos.length === 1 && repos[0]) {
    return repos[0];
  }
  if (repos.length === 0) {
    throw new UserError('No git repository is open.');
  }
  const picked = await ui.pick(
    repos.map((r) => ({ id: r.rootUri.toString(), label: path.basename(r.rootUri.fsPath), description: r.rootUri.fsPath, repo: r })),
    { placeHolder: 'Choose a repository' },
  );
  if (!picked) {
    throw new UserError('No repository selected.');
  }
  return picked.repo;
}

export function relPath(repo: Repository, uri: vscode.Uri): string {
  return path.relative(repo.rootUri.fsPath, uri.fsPath).split(path.sep).join('/');
}

export function absPath(repo: Repository, rel: string): string {
  return path.join(repo.rootUri.fsPath, ...rel.split('/'));
}

export function untrackedChanges(repo: Repository): Change[] {
  const s = repo.state;
  return [...s.workingTreeChanges.filter((c) => c.status === Status.UNTRACKED), ...(s.untrackedChanges ?? [])];
}

export interface ChangeSet {
  files: FileDiff[];
  /** Human description used in the prompt, e.g. "staged changes". */
  source: string;
}

/** Staged diff, or (per setting) unstaged + untracked when nothing is staged. */
export async function getChangesForMessage(repo: Repository, useUnstaged: boolean): Promise<ChangeSet | undefined> {
  await repo.status();
  if (repo.state.indexChanges.length > 0) {
    return { files: splitDiff(await repo.diff(true)), source: 'staged changes' };
  }
  if (!useUnstaged) {
    return undefined;
  }
  const files = splitDiff(await repo.diff(false));
  files.push(...(await readUntracked(repo, untrackedChanges(repo))));
  return files.length > 0 ? { files, source: 'unstaged changes' } : undefined;
}

export function readUntracked(repo: Repository, changes: Change[]): Promise<FileDiff[]> {
  return readAsNewFiles(repo, changes.map((c) => c.uri));
}

/** Synthesises "new file" diffs from what is on disk now. Missing files are skipped. */
export async function readAsNewFiles(repo: Repository, uris: vscode.Uri[]): Promise<FileDiff[]> {
  const out: FileDiff[] = [];
  for (const uri of uris) {
    const rel = relPath(repo, uri);
    try {
      const stat = await fs.promises.stat(uri.fsPath);
      if (!stat.isFile()) {
        continue;
      }
      if (stat.size > MAX_UNTRACKED_BYTES) {
        out.push({ path: rel, text: `diff --git a/${rel} b/${rel}\nnew file (${stat.size} bytes, not shown)`, binary: true });
        continue;
      }
      out.push(untrackedFileDiff(rel, await fs.promises.readFile(uri.fsPath)));
    } catch {
      // vanished between status and read
    }
  }
  return out;
}

/** Replaces the commit box text, offering Undo when something was overwritten. */
export function setCommitMessage(repo: Repository, message: string): void {
  const previous = repo.inputBox.value;
  repo.inputBox.value = message;
  if (previous.trim() && previous !== message) {
    void ui.info('Commitwise replaced the commit message.', 'Undo').then((choice) => {
      if (choice === 'Undo' && repo.inputBox.value === message) {
        repo.inputBox.value = previous;
      }
    });
  }
}
