import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CommitwiseTestApi } from '../../src/extension';
import type { API, GitExtension, Repository } from '../../src/git/gitTypes';
import type { Ui } from '../../src/ui/prompts';

export const REPO = process.env['COMMITWISE_FIXTURE_REPO'] ?? '';
export const FAKE_CLAUDE = process.env['COMMITWISE_FAKE_CLAUDE'] ?? '';

export interface FakeCall {
  args: string[];
  stdin: string;
}

export interface FakeReply {
  result?: string;
  structured?: unknown;
  isError?: boolean;
  apiStatus?: number;
  sleepMs?: number;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'commitwise-fake-'));
const LOG = path.join(scratch, 'calls.jsonl');
const QUEUE = path.join(scratch, 'queue.json');
// The extension spawns the fake with this process's environment.
process.env['FAKE_CLAUDE_LOG'] = LOG;
process.env['FAKE_CLAUDE_QUEUE'] = QUEUE;

export function queueReplies(...replies: FakeReply[]): void {
  fs.writeFileSync(QUEUE, JSON.stringify(replies));
  fs.rmSync(LOG, { force: true });
}

export function calls(): FakeCall[] {
  if (!fs.existsSync(LOG)) {
    return [];
  }
  return fs
    .readFileSync(LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeCall);
}

export function argValue(call: FakeCall | undefined, flag: string): string | undefined {
  if (!call) {
    return undefined;
  }
  const i = call.args.indexOf(flag);
  return i >= 0 ? call.args[i + 1] : undefined;
}

export function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
}

export function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(REPO, rel)), { recursive: true });
  fs.writeFileSync(path.join(REPO, rel), content);
}

let baseCommit: string | undefined;

/** Back to a clean `main` at the fixture's original commit, other branches deleted. */
export function resetRepo(): void {
  baseCommit ??= git('rev-parse', 'main').trim();
  git('checkout', '-q', '-f', 'main');
  git('reset', '-q', '--hard', baseCommit);
  git('clean', '-q', '-fdx', '-e', 'empty-repo'); // the nested no-commits repo cleans itself up
  for (const b of git('branch', '--format=%(refname:short)').split('\n').filter((x) => x && x !== 'main')) {
    git('branch', '-q', '-D', b);
  }
  fs.rmSync(path.join(REPO, '.git', 'hooks', 'pre-commit'), { force: true });
}

/** The git API plus `openRepository`, which the extension itself doesn't need. */
export async function gitApi(): Promise<API & { openRepository(root: vscode.Uri): Promise<Repository | null> }> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    throw new Error('vscode.git missing');
  }
  return (ext.isActive ? ext.exports : await ext.activate()).getAPI(1) as API & {
    openRepository(root: vscode.Uri): Promise<Repository | null>;
  };
}

export async function getRepo(): Promise<Repository> {
  const git = await gitApi();
  for (let i = 0; i < 100; i++) {
    const repo = git.repositories.find((r) => r.rootUri.fsPath === REPO);
    if (repo) {
      await repo.status();
      return repo;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`git extension never opened ${REPO}`);
}

export async function testApi(): Promise<CommitwiseTestApi> {
  const ext = vscode.extensions.getExtension<CommitwiseTestApi>('safwanmamji.commitwise');
  if (!ext) {
    throw new Error('extension not found');
  }
  return ext.isActive ? ext.exports : ext.activate();
}

let current: string[] = [];
export const lastSeen = (): string[] => current;

/** Scripted UI: each prompt type answers from its own queue; unexpected prompts fail. */
export async function scriptUi(answers: {
  warnModal?: (string | undefined)[];
  pick?: ((items: { id: string }[]) => string | undefined)[];
  input?: (string | undefined)[];
  info?: (string | undefined)[];
  error?: (string | undefined)[];
}): Promise<{ seen: string[] }> {
  current = [];
  // Notifications (info/warn/error) are recorded; they only need answers when a test scripts one.
  const answer = (q: (string | undefined)[] | undefined): string | undefined => q?.shift();
  const seen = current;
  const next = <T>(q: T[] | undefined, kind: string): T => {
    if (!q || q.length === 0) {
      throw new Error(`Unexpected ${kind} prompt`);
    }
    return q.shift() as T;
  };
  const ui: Partial<Ui> = {
    async warnModal(message) {
      seen.push(`warn:${message}`);
      return next(answers.warnModal, 'warnModal');
    },
    async pick(items, options) {
      seen.push(`pick:${options.placeHolder ?? ''}`);
      const chooser = next(answers.pick, 'pick');
      const id = chooser(items);
      return items.find((i) => i.id === id);
    },
    async input(options) {
      seen.push(`input:${options.prompt ?? ''}`);
      return next(answers.input, 'input');
    },
    async info(message) {
      seen.push(`info:${message}`);
      return answer(answers.info);
    },
    async warn(message) {
      seen.push(`warn:${message}`);
      return undefined;
    },
    async error(message) {
      seen.push(`error:${message}`);
      return answer(answers.error);
    },
  };
  (await testApi()).setUiForTesting(ui);
  return { seen };
}

export async function useFakeClaude(): Promise<void> {
  await vscode.workspace.getConfiguration('commitwise').update('claudePath', FAKE_CLAUDE, vscode.ConfigurationTarget.Global);
  // Most tests exercise fast mode; agent-mode tests opt in.
  await vscode.workspace.getConfiguration('commitwise').update('mode', 'fast', vscode.ConfigurationTarget.Global);
}
