import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolveRepository } from '../git/gitApi';
import { recentMessages } from '../git/gitLog';
import { buildGuidelinesFromHistoryPrompt } from '../prompt/promptBuilder';
import { cleanMessage } from '../prompt/validator';
import { showError, UserError } from '../ui/errors';
import { ui } from '../ui/prompts';
import { withCliProgress } from '../ui/progress';
import { callClaude } from './claudeCall';
import { guidelinesTarget, openFile } from './createGuidelines';

const SAMPLE = 50;

export async function guidelinesFromHistory(arg?: unknown): Promise<void> {
  try {
    await run(arg);
  } catch (err) {
    await showError(err);
  }
}

async function run(arg: unknown): Promise<void> {
  const repo = await resolveRepository(arg);
  const cfg = getConfig(repo.rootUri);
  const messages = await recentMessages(repo, SAMPLE);
  if (messages.length < 5) {
    throw new UserError(`Need at least 5 commits to learn from; found ${messages.length}.`);
  }
  const draft = await withCliProgress(`Commitwise: analysing ${messages.length} commits`, async (token) =>
    cleanMessage((await callClaude(repo, cfg, buildGuidelinesFromHistoryPrompt(messages), token)).text),
  );

  // Show as an unsaved document so the user can review and edit before saving.
  const doc = await vscode.workspace.openTextDocument({ content: `${draft}\n`, language: 'markdown' });
  await vscode.window.showTextDocument(doc);
  const target = guidelinesTarget(repo.rootUri.fsPath, cfg.guidelinesPath);
  const rel = path.relative(repo.rootUri.fsPath, target);
  const choice = await ui.info(
    `Review the generated guidelines, then save them as ${rel}.`,
    'Save',
    'Discard',
  );
  if (choice !== 'Save') {
    return;
  }
  if (fs.existsSync(target)) {
    const overwrite = await ui.warnModal(`${rel} already exists.`, 'Replace it with the generated guidelines?', 'Replace');
    if (overwrite !== 'Replace') {
      return;
    }
  }
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, doc.getText());
  // Close the untitled draft without a save prompt, then open the real file.
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  await openFile(target);
}
