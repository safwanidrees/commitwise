// Minimal subset of the built-in Git extension API (vscode.git, API v1).
// Full source: https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
import type { Uri, Event } from 'vscode';

// Values mirror the git extension's numeric Status enum. A plain object (not a
// const enum) so esbuild can bundle it.
export const Status = {
  INDEX_MODIFIED: 0,
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  INDEX_COPIED: 4,
  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
  IGNORED: 8,
  INTENT_TO_ADD: 9,
  INTENT_TO_RENAME: 10,
  TYPE_CHANGED: 11,
  ADDED_BY_US: 12,
  ADDED_BY_THEM: 13,
  DELETED_BY_US: 14,
  DELETED_BY_THEM: 15,
  BOTH_ADDED: 16,
  BOTH_DELETED: 17,
  BOTH_MODIFIED: 18,
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface Change {
  readonly uri: Uri;
  readonly originalUri: Uri;
  readonly renameUri: Uri | undefined;
  readonly status: Status;
}

export interface Branch {
  readonly name?: string;
  readonly commit?: string;
}

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly parents: string[];
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly mergeChanges: Change[];
  readonly indexChanges: Change[];
  readonly workingTreeChanges: Change[];
  /** Present in newer VS Code when `git.untrackedChanges` is "separate". */
  readonly untrackedChanges?: Change[];
  readonly onDidChange: Event<void>;
}

export interface InputBox {
  value: string;
}

export interface LogOptions {
  readonly maxEntries?: number;
}

export interface CommitOptions {
  all?: boolean | 'tracked';
}

export interface Repository {
  readonly rootUri: Uri;
  readonly inputBox: InputBox;
  readonly state: RepositoryState;
  status(): Promise<void>;
  diff(cached?: boolean): Promise<string>;
  add(paths: string[]): Promise<void>;
  /** Unstages the given paths (git reset HEAD -- paths). */
  revert(paths: string[]): Promise<void>;
  commit(message: string, opts?: CommitOptions): Promise<void>;
  log(options?: LogOptions): Promise<Commit[]>;
}

export interface API {
  readonly git: { readonly path: string };
  readonly repositories: Repository[];
  getRepository(uri: Uri): Repository | null;
}

export interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): API;
}
