/** First match of `pattern` in the branch name, e.g. "feature/ABC-123-login" → "ABC-123". */
export function extractTicket(branch: string | undefined, pattern: string): string | undefined {
  if (!branch || !pattern) {
    return undefined;
  }
  try {
    return new RegExp(pattern).exec(branch)?.[0];
  } catch {
    return undefined;
  }
}
