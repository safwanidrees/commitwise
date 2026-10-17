import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ui } from '../ui/prompts';
import { getConfig } from '../config';
import { resolveRepository } from '../git/gitApi';
import { DEFAULT_GUIDELINES_FILE, loadGuidelines } from '../guidelines/guidelinesLoader';
import { GUIDELINES_TEMPLATE } from '../guidelines/templates';
import { showError } from '../ui/errors';

export async function createGuidelines(arg?: unknown): Promise<void> {
  try {
    const repo = await resolveRepository(arg);
    const cfg = getConfig(repo.rootUri);
    const root = repo.rootUri.fsPath;
    const existing = await loadGuidelines(root, cfg.guidelinesPath, cfg.guidelinesMaxBytes);
    if (existing) {
      await openFile(path.resolve(root, existing.path));
      void ui.info(`Commit guidelines already exist: ${existing.path}`);
      return;
    }
    const target = path.resolve(root, cfg.guidelinesPath || DEFAULT_GUIDELINES_FILE);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, GUIDELINES_TEMPLATE, { flag: 'wx' });
    await openFile(target);
  } catch (err) {
    await showError(err);
  }
}

export async function openFile(file: string): Promise<void> {
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
}

/** Where a new guidelines file should go for this repo. */
export function guidelinesTarget(root: string, customPath: string): string {
  return path.resolve(root, customPath || DEFAULT_GUIDELINES_FILE);
}
