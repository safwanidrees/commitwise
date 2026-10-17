import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import { childPath, locateClaude } from '../claude/cliLocator';
import { compareVersions, installCommand, MIN_CLI_VERSION, parseAuthStatus, parseVersion } from '../claude/setupInfo';
import { getConfig } from '../config';
import { log } from '../ui/log';
import { ui } from '../ui/prompts';

export const WALKTHROUGH_ID = 'safwanmamji.commitwise#commitwise.gettingStarted';

export type SetupState =
  | { ok: false; problem: 'NOT_INSTALLED' }
  | { ok: false; problem: 'OUTDATED'; version: string; path: string }
  | { ok: false; problem: 'NOT_LOGGED_IN'; version: string; path: string }
  | { ok: true; version: string; path: string; method?: string | undefined };

/** Checks install, version and sign-in without using any Claude usage. */
export async function inspectSetup(): Promise<SetupState> {
  const path = await locateClaude(getConfig().claudePath);
  if (!path) {
    await setContexts(false, false);
    return { ok: false, problem: 'NOT_INSTALLED' };
  }
  const version = parseVersion(await run(path, ['--version'])) ?? '0.0.0';
  if (compareVersions(version, MIN_CLI_VERSION) < 0) {
    await setContexts(true, false);
    return { ok: false, problem: 'OUTDATED', version, path };
  }
  const auth = parseAuthStatus(await run(path, ['auth', 'status']));
  await setContexts(true, auth?.loggedIn === true);
  if (!auth?.loggedIn) {
    return { ok: false, problem: 'NOT_LOGGED_IN', version, path };
  }
  return { ok: true, version, path, method: auth.method };
}

/** `Commitwise: Check Setup`: reports the state and offers the fix. */
export async function checkSetup(): Promise<void> {
  const s = await inspectSetup();
  log().info(`Setup check: ${JSON.stringify(s)}`);
  if (s.ok) {
    void ui.info(`Commitwise is ready: Claude Code ${s.version} is installed and signed in. Click ✨ in Source Control to generate a message.`);
    return;
  }
  await offerFix(s.problem, 'version' in s ? s.version : undefined);
}

/** Shows what is wrong and runs the chosen fix. Shared with CLI error handling. */
export async function offerFix(problem: 'NOT_INSTALLED' | 'OUTDATED' | 'NOT_LOGGED_IN', version?: string): Promise<void> {
  if (problem === 'NOT_INSTALLED') {
    const choice = await ui.error(
      'Commitwise uses the Claude Code CLI with your Claude subscription, but it is not installed (or could not be found).',
      'Install Claude Code',
      'Setup Guide',
      'Set Path',
    );
    if (choice === 'Install Claude Code') {
      await installClaude();
    } else if (choice === 'Setup Guide') {
      await openWalkthrough();
    } else if (choice === 'Set Path') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'commitwise.claudePath');
    }
  } else if (problem === 'OUTDATED') {
    const choice = await ui.error(
      `Claude Code ${version ?? ''} is too old for Commitwise (needs ${MIN_CLI_VERSION} or newer).`.replace('  ', ' '),
      'Update Claude Code',
    );
    if (choice === 'Update Claude Code') {
      await terminalWith('Update Claude Code', 'update');
    }
  } else {
    const choice = await ui.error('Claude Code is installed but not signed in.', 'Sign In');
    if (choice === 'Sign In') {
      await signIn();
    }
  }
}

/** Opens a terminal with the official install command typed in (the user presses Enter). */
export async function installClaude(): Promise<void> {
  const term = vscode.window.createTerminal('Install Claude Code');
  term.show();
  term.sendText(installCommand(process.platform), false);
  void ui.info('Press Enter in the terminal to install Claude Code. When it finishes, run "Commitwise: Check Setup".', 'Check Setup').then(
    async (c) => {
      if (c === 'Check Setup') {
        await checkSetup();
      }
    },
  );
}

export async function signIn(): Promise<void> {
  await terminalWith('Claude sign-in', 'auth login');
  void ui.info('Press Enter in the terminal and finish signing in in your browser, then run "Commitwise: Check Setup".', 'Check Setup').then(
    async (c) => {
      if (c === 'Check Setup') {
        await checkSetup();
      }
    },
  );
}

export async function openWalkthrough(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false);
}

async function terminalWith(name: string, subcommand: string): Promise<void> {
  const path = (await locateClaude(getConfig().claudePath)) ?? 'claude';
  const term = vscode.window.createTerminal(name);
  term.show();
  // Typed, not run: the user presses Enter.
  term.sendText(`${quote(path)} ${subcommand}`, false);
}

function quote(p: string): string {
  return /^[\w./~:\\-]+$/.test(p) ? p : `"${p.replace(/"/g, '\\"')}"`;
}

async function setContexts(installed: boolean, signedIn: boolean): Promise<void> {
  // Drive the walkthrough's completion checkmarks.
  await vscode.commands.executeCommand('setContext', 'commitwise.cliInstalled', installed);
  await vscode.commands.executeCommand('setContext', 'commitwise.signedIn', signedIn);
}

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { timeout: 15000, env: { ...process.env, PATH: safePath(binary) }, encoding: 'utf8' },
      (_err, stdout, stderr) => resolve(`${stdout}${stderr}`),
    );
  });
}

function safePath(binary: string): string {
  try {
    return childPath(binary);
  } catch {
    return process.env['PATH'] ?? '';
  }
}
