import * as vscode from 'vscode';

/**
 * Shows progress on the Source Control view and as a cancellable notification.
 * (A Source Control-location progress can't show a Cancel button by itself.)
 */
export function withCliProgress<T>(
  title: string,
  task: (token: vscode.CancellationToken, report: (message: string) => void) => Promise<T>,
): Thenable<T> {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, () =>
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      (progress, token) => task(token, (message) => progress.report({ message })),
    ),
  );
}
