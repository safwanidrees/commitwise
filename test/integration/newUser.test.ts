import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { getRepo, lastSeen, resetRepo, scriptUi, testApi, write } from './helpers';

/**
 * A brand-new user without Claude Code. Runs only when the suite is launched
 * with a HOME and PATH that contain no `claude` (COMMITWISE_NO_CLI=1).
 */
(process.env['COMMITWISE_NO_CLI'] === '1' ? describe : describe.skip)('New user without Claude Code', function () {
  this.timeout(30000);

  before(async () => {
    await testApi();
    await vscode.workspace.getConfiguration('commitwise').update('claudePath', undefined, vscode.ConfigurationTarget.Global);
  });

  it('Check Setup explains it is missing and Install types the official command', async () => {
    await scriptUi({ error: ['Install Claude Code'] });
    await vscode.commands.executeCommand('commitwise.checkSetup');
    const seen = lastSeen().join('\n');
    assert.match(seen, /error:Commitwise uses the Claude Code CLI with your Claude subscription, but it is not installed/);
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(vscode.window.terminals.some((t) => t.name === 'Install Claude Code'), 'install terminal opened');
    assert.match(lastSeen().join('\n'), /info:Press Enter in the terminal to install Claude Code/);
  });

  it('clicking ✨ without Claude Code gives the guided install fix, not a raw error', async () => {
    resetRepo();
    write('file1.txt', 'a change\n');
    const repo = await getRepo();
    await scriptUi({});
    await vscode.commands.executeCommand('commitwise.generate', { rootUri: repo.rootUri });
    assert.match(lastSeen().join('\n'), /error:Commitwise uses the Claude Code CLI with your Claude subscription, but it is not installed/);
    resetRepo();
  });
});
