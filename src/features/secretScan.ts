import { FileDiff } from '../git/diffParse';
import { matchesAny } from '../git/glob';
import { scanDiffs, SecretHit } from '../safety/secretDetector';
import { UserError } from '../ui/errors';
import { ui } from '../ui/prompts';

export const SEND_ANYWAY = 'Send Anyway';
export const EXCLUDE_FILES = 'Exclude Those Files';

/**
 * Scans the diff text that would be sent (not ignored, not binary) before
 * anything leaves the machine. Returns paths to send by name only; throws if
 * the user cancels.
 */
export async function confirmNoSecrets(
  files: FileDiff[],
  ignoreGlobs: string[],
  enabled: boolean,
  opts: { agent?: boolean } = {},
): Promise<Set<string>> {
  if (!enabled) {
    return new Set();
  }
  const sendable = files.filter((f) => !f.binary && !matchesAny(f.path, ignoreGlobs));
  const hits = scanDiffs(sendable);
  if (hits.length === 0) {
    return new Set();
  }
  // In agent mode Claude reads the repo itself, so files can't be held back.
  const choice = opts.agent
    ? await ui.warnModal(
        'Possible secrets found in the changes Claude is about to read.',
        `${formatHits(hits, 15, false)}\n\nIn agent mode Claude reads the changes itself, so files can't be excluded (.env and key files are always blocked). Switch commitwise.mode to "fast" to send other files by name only.`,
        SEND_ANYWAY,
      )
    : await ui.warnModal(
        'Possible secrets found in the changes Commitwise is about to send to Claude.',
        formatHits(hits),
        SEND_ANYWAY,
        EXCLUDE_FILES,
      );
  if (choice === SEND_ANYWAY) {
    return new Set();
  }
  if (choice === EXCLUDE_FILES) {
    return new Set(hits.map((h) => h.path));
  }
  throw new UserError('Cancelled: nothing was sent to Claude.');
}

export function formatHits(hits: SecretHit[], max = 15, excludeHint = true): string {
  const lines = hits
    .slice(0, max)
    .map((h) => `${h.path}${h.line ? `:${h.line}` : ''}: ${h.kind} ${h.masked}`);
  if (hits.length > max) {
    lines.push(`…and ${hits.length - max} more`);
  }
  if (excludeHint) {
    lines.push('', '"Exclude Those Files" sends only their names, not their contents.');
  }
  return lines.join('\n');
}
