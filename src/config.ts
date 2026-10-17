import * as vscode from 'vscode';
import { DEFAULT_IGNORE_GLOBS } from './config.defaults';

export { DEFAULT_IGNORE_GLOBS };

export interface Config {
  claudePath: string;
  model: string;
  timeoutSeconds: number;
  guidelinesPath: string;
  guidelinesMaxBytes: number;
  useHistoryStyle: boolean;
  historyCommitCount: number;
  ignoreGlobs: string[];
  maxDiffChars: number;
  ticketRegex: string;
  useUnstagedIfNothingStaged: boolean;
  secretScan: boolean;
  optionsCount: number;
  runInRepoDirectory: boolean;
  mode: 'fast' | 'agent';
  agentModel: string;
  agentTimeoutSeconds: number;
}

/** Reads settings fresh each call, scoped to the repo so folder settings apply. */
export function getConfig(scope?: vscode.Uri): Config {
  const c = vscode.workspace.getConfiguration('commitwise', scope);
  return {
    claudePath: c.get('claudePath', ''),
    model: c.get('model', 'haiku'),
    timeoutSeconds: Math.max(5, c.get('timeoutSeconds', 60)),
    guidelinesPath: c.get('guidelinesPath', ''),
    guidelinesMaxBytes: Math.max(1000, c.get('guidelinesMaxBytes', 16000)),
    useHistoryStyle: c.get('useHistoryStyle', true),
    historyCommitCount: Math.max(5, c.get('historyCommitCount', 30)),
    ignoreGlobs: c.get('ignoreGlobs', DEFAULT_IGNORE_GLOBS),
    maxDiffChars: Math.max(2000, c.get('maxDiffChars', 60000)),
    ticketRegex: c.get('ticketRegex', '[A-Z][A-Z0-9]+-\\d+'),
    useUnstagedIfNothingStaged: c.get('useUnstagedIfNothingStaged', true),
    secretScan: c.get('secretScan', true),
    optionsCount: Math.min(10, Math.max(2, c.get('optionsCount', 3))),
    runInRepoDirectory: c.get('runInRepoDirectory', false),
    mode: c.get<string>('mode', 'agent') === 'fast' ? 'fast' : 'agent',
    agentModel: c.get('agentModel', ''),
    agentTimeoutSeconds: Math.max(30, c.get('agentTimeoutSeconds', 180)),
  };
}
