import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrontmatter, truncateBytes } from './frontmatter';

export const DEFAULT_GUIDELINES_FILE = 'COMMIT_GUIDELINES.md';

export interface Guidelines {
  /** Repo-relative path of the file used. */
  path: string;
  /** Markdown body (frontmatter removed), truncated to the byte cap. */
  content: string;
  /** Regex the subject line must match, from frontmatter `pattern`. */
  pattern?: string;
}

export function guidelinesCandidates(customPath: string): string[] {
  return [customPath, DEFAULT_GUIDELINES_FILE, '.github/commit-guidelines.md', '.vscode/commit-guidelines.md'].filter(
    Boolean,
  );
}

/** Read fresh every time so edits apply to the very next generation. */
export async function loadGuidelines(
  root: string,
  customPath: string,
  maxBytes: number,
  warn: (message: string) => void = () => undefined,
): Promise<Guidelines | undefined> {
  for (const rel of guidelinesCandidates(customPath)) {
    let raw: string;
    try {
      raw = await fs.promises.readFile(path.resolve(root, rel), 'utf8');
    } catch {
      continue;
    }
    const { data, body } = parseFrontmatter(raw);
    const { text, truncated } = truncateBytes(body, maxBytes);
    if (truncated) {
      warn(`${rel} is larger than commitwise.guidelinesMaxBytes (${maxBytes}); the rest was ignored.`);
    }
    const g: Guidelines = { path: rel, content: text };
    if (data['pattern']) {
      g.pattern = data['pattern'];
    }
    return g;
  }
  return undefined;
}
