import { execFile } from 'node:child_process';
import { Repository } from './gitTypes';
import { getGitApi } from './gitApi';

/**
 * Runs git directly, using the same binary as VS Code's Git extension. Used
 * only where the extension API has no equivalent or falls short: a single
 * combined diff against HEAD and unstaging in a repo with no commits (commit
 * splitting), and branch comparisons (PR description).
 */
export async function git(repo: Repository, args: string[]): Promise<string> {
  const gitPath = (await getGitApi()).git.path;
  return new Promise((resolve, reject) => {
    execFile(
      gitPath,
      args,
      { cwd: repo.rootUri.fsPath, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`git ${args[0]} failed: ${stderr.trim() || err.message}`));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

export async function refExists(repo: Repository, ref: string): Promise<boolean> {
  try {
    await git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
