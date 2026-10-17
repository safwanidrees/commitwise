import * as vscode from 'vscode';
import { ui } from './prompts';
import { CliError } from '../claude/cliRunner';
import { offerFix } from '../features/setup';
import { log } from './log';

/** A failure the user can act on, shown as a plain error message. */
export class UserError extends Error {}

export async function showError(err: unknown): Promise<void> {
  if (err instanceof CliError) {
    await showCliError(err);
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (!(err instanceof UserError)) {
    log().error(err instanceof Error ? (err.stack ?? message) : message);
  }
  void ui.error(`Commitwise: ${message}`);
}

async function showCliError(err: CliError): Promise<void> {
  log().error(`claude CLI failed (${err.kind}): ${err.message}${err.detail ? `\n${err.detail}` : ''}`);
  switch (err.kind) {
    case 'CANCELLED':
      return;
    case 'NOT_INSTALLED':
    case 'NOT_LOGGED_IN':
    case 'OUTDATED':
      await offerFix(err.kind);
      return;
    case 'USAGE_LIMIT':
      void ui.error(
        `Claude usage limit reached. Try again later or switch \`commitwise.model\`. ${err.message}`.trim(),
      );
      return;
    case 'TIMEOUT': {
      const choice = await ui.error(
        'Claude took too long to respond and was stopped.',
        'Increase Timeout',
      );
      if (choice === 'Increase Timeout') {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'commitwise.timeoutSeconds');
      }
      return;
    }
    case 'UNKNOWN': {
      const choice = await ui.error(`Claude CLI failed: ${err.message}`, 'Show Log');
      if (choice === 'Show Log') {
        log().show();
      }
      return;
    }
  }
}
