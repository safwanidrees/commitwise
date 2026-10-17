import { Repository } from './gitTypes';

/** Uses the Git extension's `log` API; merges are skipped via the parents list. */
async function nonMergeMessages(repo: Repository, count: number): Promise<string[]> {
  try {
    const commits = await repo.log({ maxEntries: count * 3 });
    return commits
      .filter((c) => c.parents.length <= 1)
      .map((c) => c.message.trim())
      .filter(Boolean)
      .slice(0, count);
  } catch {
    return []; // e.g. no commits yet
  }
}

/** Recent commit subjects as style examples, or undefined if fewer than 5. */
export async function historyExamples(repo: Repository, count: number): Promise<string[] | undefined> {
  const subjects = (await nonMergeMessages(repo, count)).map((m) => m.split('\n')[0] ?? '');
  return subjects.length >= 5 ? subjects : undefined;
}

export async function recentMessages(repo: Repository, count: number): Promise<string[]> {
  return nonMergeMessages(repo, count);
}
