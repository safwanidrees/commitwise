import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Repository } from '../../src/git/gitTypes';
import {
  argValue,
  calls,
  getRepo,
  gitApi,
  lastSeen,
  git,
  queueReplies,
  REPO,
  resetRepo,
  scriptUi,
  testApi,
  useFakeClaude,
  write,
} from './helpers';

// Built at runtime so this file itself doesn't trip secret scanners.
const FAKE_AWS_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE';

describe('Commitwise (fake claude, fixture repo)', function () {
  this.timeout(30000);
  let repo: Repository;
  const scm = (): { rootUri: vscode.Uri } => ({ rootUri: repo.rootUri });

  before(async () => {
    assert.ok(REPO, 'fixture repo env var missing');
    await testApi();
    await useFakeClaude();
    repo = await getRepo();
  });

  beforeEach(async () => {
    resetRepo();
    repo.inputBox.value = '';
    await repo.status();
    await scriptUi({});
  });

  afterEach(function () {
    if (this.currentTest?.state === 'failed') {
      console.log('UI seen during failed test:', lastSeen());
    }
  });

  after(async () => {
    (await testApi()).setUiForTesting(undefined);
  });

  it('setup check: ready, outdated and signed-out states', async () => {
    await vscode.commands.executeCommand('commitwise.checkSetup');
    assert.match(lastSeen().join('\n'), /info:Commitwise is ready: Claude Code 2\.1\.296 is installed and signed in/);

    process.env['FAKE_CLAUDE_LOGGED_OUT'] = '1';
    try {
      await scriptUi({});
      await vscode.commands.executeCommand('commitwise.checkSetup');
      assert.match(lastSeen().join('\n'), /error:Claude Code is installed but not signed in/);
    } finally {
      delete process.env['FAKE_CLAUDE_LOGGED_OUT'];
    }

    process.env['FAKE_CLAUDE_VERSION'] = '2.0.1';
    try {
      await scriptUi({});
      await vscode.commands.executeCommand('commitwise.checkSetup');
      assert.match(lastSeen().join('\n'), /error:Claude Code 2\.0\.1 is too old for Commitwise \(needs 2\.1\.296 or newer\)/);
    } finally {
      delete process.env['FAKE_CLAUDE_VERSION'];
    }
  });

  it('registers all commands', async () => {
    const all = await vscode.commands.getCommands(true);
    for (const c of [
      'commitwise.generate',
      'commitwise.generateOptions',
      'commitwise.splitCommits',
      'commitwise.createGuidelines',
      'commitwise.guidelinesFromHistory',
      'commitwise.prDescription',
      'commitwise.checkSetup',
      'commitwise.installClaude',
      'commitwise.signIn',
      'commitwise.openWalkthrough',
    ]) {
      assert.ok(all.includes(c), c);
    }
  });

  it('generate: writes the staged-change message into the commit box', async () => {
    write('file1.txt', 'changed\n');
    write('yarn.lock', 'lock contents\n');
    git('add', '.');
    queueReplies({ result: '```\nPAY-7 Change file one\n```' });
    await vscode.commands.executeCommand('commitwise.generate', scm());

    assert.equal(repo.inputBox.value, 'PAY-7 Change file one');
    const [call] = calls();
    assert.ok(call);
    assert.equal(argValue(call, '--tools'), '');
    assert.equal(argValue(call, '--model'), 'haiku');
    assert.match(call.stdin, /staged changes/);
    assert.match(call.stdin, /\+changed/);
    assert.match(call.stdin, /- yarn.lock/, 'ignored file listed by name');
    assert.doesNotMatch(call.stdin, /lock contents/, 'ignored file content not sent');
    // No guidelines file → learns from history.
    assert.match(argValue(call, '--system-prompt') ?? '', /- PAY-6 Update payment docs/);
  });

  it('generate: falls back to unstaged + untracked changes', async () => {
    write('brand-new.txt', 'hello new\n');
    queueReplies({ result: 'PAY-8 Add new file' });
    await vscode.commands.executeCommand('commitwise.generate', scm());
    assert.equal(repo.inputBox.value, 'PAY-8 Add new file');
    assert.match(calls()[0]?.stdin ?? '', /unstaged changes[\s\S]*\+hello new/);
  });

  it('generate: guidelines override style and a pattern mismatch retries once', async () => {
    write('COMMIT_GUIDELINES.md', "---\npattern: '^feat: '\n---\nAlways start with feat.\n");
    write('file2.txt', 'x\n');
    git('add', 'file2.txt');
    queueReplies({ result: 'Wrong format' }, { result: 'feat: right format' });
    await vscode.commands.executeCommand('commitwise.generate', scm());

    assert.equal(repo.inputBox.value, 'feat: right format');
    const [first, second] = calls();
    assert.match(argValue(first, '--system-prompt') ?? '', /override all other style instructions[\s\S]*Always start with feat/);
    assert.doesNotMatch(argValue(first, '--system-prompt') ?? '', /PAY-6/, 'history not used when guidelines exist');
    assert.match(second?.stdin ?? '', /did not match the required pattern `\^feat: `/);
  });

  it('generate: extracts the ticket from the branch name', async () => {
    git('checkout', '-q', '-b', 'feature/ABC-42-login');
    write('file3.txt', 'y\n');
    git('add', 'file3.txt');
    queueReplies({ result: 'msg' });
    await vscode.commands.executeCommand('commitwise.generate', scm());
    assert.match(argValue(calls()[0], '--system-prompt') ?? '', /ticket ID for this work is ABC-42/);
  });

  it('generate: keeps the old message recoverable (replaces it)', async () => {
    repo.inputBox.value = 'my draft';
    write('file4.txt', 'z\n');
    git('add', 'file4.txt');
    queueReplies({ result: 'new msg' });
    await vscode.commands.executeCommand('commitwise.generate', scm());
    assert.equal(repo.inputBox.value, 'new msg');
    assert.ok(lastSeen().includes('info:Commitwise replaced the commit message.'), 'Undo offered');
  });

  it('agent mode: Claude explores the repo itself with read-only tools', async () => {
    await vscode.workspace.getConfiguration('commitwise').update('mode', 'agent', vscode.ConfigurationTarget.Global);
    try {
      write('file1.txt', 'agent change\n');
      write('notes.md', 'new notes\n');
      queueReplies({ result: 'I looked at git diff and the files.\n<commit_message>\nPAY-13 Update file one\n\n- explain why\n</commit_message>' });
      await vscode.commands.executeCommand('commitwise.generate', scm());

      assert.equal(repo.inputBox.value, 'PAY-13 Update file one\n\n- explain why');
      const [call] = calls() as (ReturnType<typeof calls>[number] & { cwd: string })[];
      assert.ok(call);
      assert.equal(call.stdin, 'Generate a commit message for the uncommitted code.');
      assert.equal(fs.realpathSync(call.cwd), REPO, 'runs inside the repo');
      assert.equal(argValue(call, '--permission-mode'), 'dontAsk');
      assert.equal(argValue(call, '--tools'), 'Read');
      assert.ok(!call.args.includes('--model'), 'uses the CLI default model like chat');
      assert.match(argValue(call, '--append-system-prompt') ?? '', /- PAY-6 Update payment docs/, 'history style still applies');
      assert.doesNotMatch(call.stdin, /agent change/, 'diff is not pre-sent; Claude reads it');
    } finally {
      await vscode.workspace.getConfiguration('commitwise').update('mode', 'fast', vscode.ConfigurationTarget.Global);
    }
  });

  it('agent mode: pattern mismatch is fixed by a cheap tool-less rewrite', async () => {
    await vscode.workspace.getConfiguration('commitwise').update('mode', 'agent', vscode.ConfigurationTarget.Global);
    try {
      write('COMMIT_GUIDELINES.md', "---\npattern: '^feat: '\n---\nStart with feat.\n");
      write('file2.txt', 'x\n');
      git('add', 'file2.txt');
      queueReplies({ result: '<commit_message>\nWrong format\n</commit_message>' }, { result: 'feat: right format' });
      await vscode.commands.executeCommand('commitwise.generate', scm());
      assert.equal(repo.inputBox.value, 'feat: right format');
      const [first, second] = calls();
      assert.equal(first?.stdin, 'Generate a commit message for the staged changes.');
      assert.equal(argValue(second, '--tools'), '', 'rewrite runs without tools');
      assert.match(second?.stdin ?? '', /Wrong format[\s\S]*`\^feat: `/);
    } finally {
      await vscode.workspace.getConfiguration('commitwise').update('mode', 'fast', vscode.ConfigurationTarget.Global);
    }
  });

  it('agent mode: secret warning offers no exclude option', async () => {
    await vscode.workspace.getConfiguration('commitwise').update('mode', 'agent', vscode.ConfigurationTarget.Global);
    try {
      write('config.js', `const key = '${FAKE_AWS_KEY}';\n`);
      queueReplies({ result: 'unused' });
      const { seen } = await scriptUi({ warnModal: [undefined] });
      await vscode.commands.executeCommand('commitwise.generate', scm());
      assert.equal(calls().length, 0);
      assert.match(seen[0] ?? '', /secrets found in the changes Claude is about to read/);
    } finally {
      await vscode.workspace.getConfiguration('commitwise').update('mode', 'fast', vscode.ConfigurationTarget.Global);
    }
  });

  it('secret scan: Cancel sends nothing', async () => {
    write('config.js', `const key = '${FAKE_AWS_KEY}';\n`);
    git('add', 'config.js');
    queueReplies({ result: 'should not be used' });
    const { seen } = await scriptUi({ warnModal: [undefined] });
    await vscode.commands.executeCommand('commitwise.generate', scm());
    assert.equal(calls().length, 0, 'claude must not be called');
    assert.equal(repo.inputBox.value, '');
    assert.match(seen[0] ?? '', /Possible secrets/);
  });

  it('secret scan: Exclude sends the file name but not its content', async () => {
    write('config.js', `const key = '${FAKE_AWS_KEY}';\n`);
    write('file5.txt', 'safe change\n');
    git('add', '.');
    queueReplies({ result: 'PAY-9 Update config' });
    await scriptUi({ warnModal: ['Exclude Those Files'] });
    await vscode.commands.executeCommand('commitwise.generate', scm());
    const stdin = calls()[0]?.stdin ?? '';
    assert.doesNotMatch(stdin, /AKIA/);
    assert.match(stdin, /- config.js/);
    assert.match(stdin, /\+safe change/);
    assert.equal(repo.inputBox.value, 'PAY-9 Update config');
  });

  it('options: picks the chosen alternative', async () => {
    write('file1.txt', 'opt\n');
    git('add', '.');
    queueReplies({ structured: { options: ['one', 'two', 'three'] } });
    await scriptUi({ pick: [(items) => items[1]?.id] });
    await vscode.commands.executeCommand('commitwise.generateOptions', scm());
    assert.equal(repo.inputBox.value, 'two');
    assert.ok(argValue(calls()[0], '--json-schema'));
  });

  it('split: commits groups in order, including renames, deletions and untracked files', async () => {
    write('file0.txt', 'feature change\n');
    write('src/feature.ts', 'export const f = 1;\n');
    git('mv', 'file1.txt', 'renamed.txt');
    fs.rmSync(path.join(REPO, 'file2.txt'));
    write('README.md', '# docs\n');
    const before = Number(git('rev-list', '--count', 'HEAD').trim());
    queueReplies({
      structured: {
        commits: [
          { files: ['src/feature.ts', 'file0.txt'], message: 'PAY-10 Add feature' },
          { files: ['renamed.txt', 'file2.txt'], message: 'PAY-11 Tidy files' },
          { files: ['README.md'], message: 'PAY-12 Add readme' },
        ],
      },
    });
    const { seen } = await scriptUi({ warnModal: ['Use All Changes'], pick: [() => 'commit'] });
    await vscode.commands.executeCommand('commitwise.splitCommits', scm());

    assert.match(seen[0] ?? '', /Some changes are staged/);
    assert.equal(Number(git('rev-list', '--count', 'HEAD').trim()), before + 3);
    assert.equal(git('log', '-3', '--format=%s').trim(), 'PAY-12 Add readme\nPAY-11 Tidy files\nPAY-10 Add feature');
    assert.equal(git('show', '--name-status', '--format=', 'HEAD~1').trim().split('\n').sort().join('|'), 'D\tfile2.txt|R100\tfile1.txt\trenamed.txt');
    assert.equal(git('status', '--porcelain').trim(), '', 'working tree clean');
    assert.match(calls()[0]?.stdin ?? '', /<files>[\s\S]*renamed.txt \(renamed from file1.txt\)/);
  });

  it('split: retries an invalid plan once', async () => {
    write('file0.txt', 'a\n');
    write('file3.txt', 'b\n');
    queueReplies(
      { structured: { commits: [{ files: ['file0.txt'], message: 'one' }] } },
      { structured: { commits: [{ files: ['file0.txt', 'file3.txt'], message: 'both' }] } },
    );
    await scriptUi({ pick: [() => 'commit'] });
    await vscode.commands.executeCommand('commitwise.splitCommits', scm());
    assert.match(calls()[1]?.stdin ?? '', /Missing from every commit: "file3.txt"/);
    assert.equal(git('log', '-1', '--format=%s').trim(), 'both');
  });

  it('split: review can edit a message and drop a group; cancel makes no commits', async () => {
    write('file0.txt', 'a\n');
    write('file3.txt', 'b\n');
    const head = git('rev-parse', 'HEAD').trim();
    const plan = {
      structured: {
        commits: [
          { files: ['file0.txt'], message: 'first' },
          { files: ['file3.txt'], message: 'second' },
        ],
      },
    };
    queueReplies(plan);
    await scriptUi({ pick: [() => 'cancel'] });
    await vscode.commands.executeCommand('commitwise.splitCommits', scm());
    assert.equal(git('rev-parse', 'HEAD').trim(), head, 'cancel commits nothing');

    queueReplies(plan);
    await scriptUi({
      pick: [() => 'group-0', () => 'edit', () => 'group-1', () => 'drop', () => 'commit'],
      input: ['first, edited'],
    });
    await vscode.commands.executeCommand('commitwise.splitCommits', scm());
    assert.equal(git('log', '-1', '--format=%s').trim(), 'first, edited');
    assert.equal(git('rev-list', '--count', `${head}..HEAD`).trim(), '1');
    assert.match(git('status', '--porcelain'), /file3.txt/, 'dropped file left uncommitted');
  });

  it('split: a failing commit stops safely and keeps remaining changes', async () => {
    write('file0.txt', 'ok change\n');
    write('blocked.txt', 'hook rejects this\n');
    write('file4.txt', 'later change\n');
    const hook = path.join(REPO, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hook, '#!/bin/sh\ngit diff --cached --name-only | grep -q blocked.txt && exit 1\nexit 0\n');
    fs.chmodSync(hook, 0o755);
    const head = git('rev-parse', 'HEAD').trim();
    queueReplies({
      structured: {
        commits: [
          { files: ['file0.txt'], message: 'good one' },
          { files: ['blocked.txt'], message: 'will fail' },
          { files: ['file4.txt'], message: 'never reached' },
        ],
      },
    });
    await scriptUi({ pick: [() => 'commit'] });
    await vscode.commands.executeCommand('commitwise.splitCommits', scm());

    assert.equal(git('rev-list', '--count', `${head}..HEAD`).trim(), '1', 'only the first commit was made');
    assert.equal(git('log', '-1', '--format=%s').trim(), 'good one');
    assert.equal(fs.readFileSync(path.join(REPO, 'blocked.txt'), 'utf8'), 'hook rejects this\n');
    assert.equal(fs.readFileSync(path.join(REPO, 'file4.txt'), 'utf8'), 'later change\n');
    assert.match(lastSeen().join('\n'), /error:Commitwise made 1 of 3 commits, then commit 2 failed/);
  });

  it('split: works in a repo with no commits yet', async () => {
    // Inside the workspace: older git extensions (VS Code 1.85, Cursor) won't open repos outside it.
    const dir = path.join(REPO, 'empty-repo');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    const g = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    g('init', '-q', '-b', 'main');
    g('config', 'user.name', 'Test');
    g('config', 'user.email', 'test@example.com');
    g('config', 'commit.gpgsign', 'false');
    const put = (rel: string, content: string): void => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    };
    put('README.md', '# Engine\n');
    put('src/engine.ts', 'export const engine = 1;\n');
    put('src/exchange/binance.ts', 'export const binance = 2;\n');
    put('config/default.json', '{}\n');
    g('add', 'README.md'); // one staged new file...
    put('README.md', '# Engine\nMore docs.\n'); // ...then modified again

    const api = await gitApi();
    const empty = await api.openRepository(vscode.Uri.file(dir));
    assert.ok(empty, 'git extension opened the empty repo');
    await empty.status();
    queueReplies({
      structured: {
        commits: [
          { files: ['config/default.json', 'src/engine.ts', 'src/exchange/binance.ts'], message: 'feat: add engine core' },
          { files: ['README.md'], message: 'docs: add readme' },
        ],
      },
    });
    await scriptUi({ warnModal: ['Use All Changes'], pick: [() => 'commit'] });
    await vscode.commands.executeCommand('commitwise.splitCommits', { rootUri: empty.rootUri });

    assert.equal(g('log', '--format=%s').trim(), 'docs: add readme\nfeat: add engine core');
    assert.equal(g('status', '--porcelain').trim(), '', 'working tree clean');
    assert.equal(g('show', 'HEAD:README.md'), '# Engine\nMore docs.\n', 'latest on-disk content committed');
    const stdin = calls()[0]?.stdin ?? '';
    assert.match(stdin, /\+export const binance = 2;/, 'new files described from disk');
    assert.match(stdin, /\+More docs\./);
    assert.doesNotMatch(lastSeen().join('\n'), /error:/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('createGuidelines: writes the starter template', async () => {
    await vscode.commands.executeCommand('commitwise.createGuidelines', scm());
    const text = fs.readFileSync(path.join(REPO, 'COMMIT_GUIDELINES.md'), 'utf8');
    assert.match(text, /## Format[\s\S]*## Allowed types[\s\S]*## Rules[\s\S]*## Examples/);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('guidelinesFromHistory: drafts from commits and saves after review', async () => {
    queueReplies({ result: '# Commit Guidelines\n\n## Format\n\n`PAY-<n> <Summary>`\n' });
    await scriptUi({ info: ['Save'] });
    await vscode.commands.executeCommand('commitwise.guidelinesFromHistory', scm());
    assert.match(calls()[0]?.stdin ?? '', /PAY-1 Add payment form/);
    assert.match(fs.readFileSync(path.join(REPO, 'COMMIT_GUIDELINES.md'), 'utf8'), /PAY-<n> <Summary>/);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('prDescription: describes branch commits vs main', async () => {
    git('checkout', '-q', '-b', 'feature/PAY-99-refunds');
    write('refund.ts', 'export const refund = true;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'PAY-99 Add refunds');
    queueReplies({ result: 'Title: Add refunds\n\n## Summary\nAdds refunds.' });
    await scriptUi({ info: [undefined] });
    await vscode.commands.executeCommand('commitwise.prDescription', scm());
    const stdin = calls()[0]?.stdin ?? '';
    assert.match(stdin, /into main/);
    assert.match(stdin, /- PAY-99 Add refunds/);
    assert.match(stdin, /\+export const refund = true;/);
    assert.equal(vscode.window.activeTextEditor?.document.getText(), 'Title: Add refunds\n\n## Summary\nAdds refunds.\n');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
