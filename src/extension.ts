import * as vscode from 'vscode';
import { createGuidelines } from './features/createGuidelines';
import { generateMessage } from './features/generateMessage';
import { generateOptions } from './features/generateOptions';
import { guidelinesFromHistory } from './features/guidelinesFromHistory';
import { prDescription } from './features/prDescription';
import { checkSetup, installClaude, openWalkthrough, signIn } from './features/setup';
import { splitCommits } from './features/splitCommits';
import { setUiForTesting } from './ui/prompts';

export interface CommitwiseTestApi {
  setUiForTesting: typeof setUiForTesting;
}

export function activate(context: vscode.ExtensionContext): CommitwiseTestApi {
  const commands: [string, (arg?: unknown) => Promise<void>][] = [
    ['commitwise.generate', generateMessage],
    ['commitwise.generateOptions', generateOptions],
    ['commitwise.splitCommits', splitCommits],
    ['commitwise.createGuidelines', createGuidelines],
    ['commitwise.guidelinesFromHistory', guidelinesFromHistory],
    ['commitwise.prDescription', prDescription],
    ['commitwise.checkSetup', checkSetup],
    ['commitwise.installClaude', installClaude],
    ['commitwise.signIn', signIn],
    ['commitwise.openWalkthrough', openWalkthrough],
  ];
  for (const [id, handler] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }
  // Exposed only so integration tests can script prompts; not a public API.
  return { setUiForTesting };
}

export function deactivate(): void {
  // Disposables are released via context.subscriptions.
}
