import * as vscode from 'vscode';

export interface PickItem extends vscode.QuickPickItem {
  /** Stable identifier so callers (and tests) don't depend on labels. */
  id: string;
}

/**
 * Every interactive prompt goes through this object so integration tests can
 * script the answers. Production code never replaces it.
 */
export interface Ui {
  warnModal(message: string, detail: string, ...buttons: string[]): Promise<string | undefined>;
  pick<T extends PickItem>(items: T[], options: vscode.QuickPickOptions): Promise<T | undefined>;
  input(options: vscode.InputBoxOptions): Promise<string | undefined>;
  info(message: string, ...buttons: string[]): Promise<string | undefined>;
  warn(message: string, ...buttons: string[]): Promise<string | undefined>;
  error(message: string, ...buttons: string[]): Promise<string | undefined>;
}

const defaultUi: Ui = {
  async warnModal(message, detail, ...buttons) {
    return vscode.window.showWarningMessage(message, { modal: true, detail }, ...buttons);
  },
  async pick(items, options) {
    return vscode.window.showQuickPick(items, options);
  },
  async input(options) {
    return vscode.window.showInputBox(options);
  },
  async info(message, ...buttons) {
    return vscode.window.showInformationMessage(message, ...buttons);
  },
  async warn(message, ...buttons) {
    return vscode.window.showWarningMessage(message, ...buttons);
  },
  async error(message, ...buttons) {
    return vscode.window.showErrorMessage(message, ...buttons);
  },
};

export let ui: Ui = defaultUi;

export function setUiForTesting(override: Partial<Ui> | undefined): void {
  ui = override ? { ...defaultUi, ...override } : defaultUi;
}
