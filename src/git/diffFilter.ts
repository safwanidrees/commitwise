import { FileDiff } from './diffParse';
import { matchesAny } from './glob';

export interface OmittedFile {
  path: string;
  reason: 'ignored' | 'binary' | 'excluded';
}

export interface FilterResult {
  /** Files whose (possibly truncated) diff text is sent to Claude. */
  included: FileDiff[];
  /** Files sent by name only. */
  omitted: OmittedFile[];
  /** Paths whose diff text was shortened to fit the budget. */
  truncated: string[];
}

/**
 * Drops ignored and binary files (keeping their names) and fits the remaining
 * diff text into `maxChars`, sharing the budget fairly so one huge file can't
 * crowd out the rest.
 */
export function filterDiffs(
  files: FileDiff[],
  ignoreGlobs: string[],
  maxChars: number,
  excludedPaths: ReadonlySet<string> = new Set(),
): FilterResult {
  const omitted: OmittedFile[] = [];
  const kept: FileDiff[] = [];
  for (const f of files) {
    if (excludedPaths.has(f.path)) {
      omitted.push({ path: f.path, reason: 'excluded' });
    } else if (f.binary) {
      omitted.push({ path: f.path, reason: 'binary' });
    } else if (matchesAny(f.path, ignoreGlobs)) {
      omitted.push({ path: f.path, reason: 'ignored' });
    } else {
      kept.push(f);
    }
  }

  const alloc = allocateBudget(kept.map((f) => f.text.length), maxChars);
  const truncated: string[] = [];
  const included = kept.map((f, i) => {
    const limit = alloc[i] ?? 0;
    if (f.text.length <= limit) {
      return f;
    }
    truncated.push(f.path);
    return { ...f, text: truncateText(f.text, limit) };
  });
  return { included, omitted, truncated };
}

/** Water-filling: small items get their full size, big ones split what's left. */
export function allocateBudget(sizes: number[], budget: number): number[] {
  const order = sizes.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s);
  const out = new Array<number>(sizes.length).fill(0);
  let remaining = budget;
  order.forEach(({ s, i }, k) => {
    const share = Math.floor(remaining / (order.length - k));
    const take = Math.min(s, share);
    out[i] = take;
    remaining -= take;
  });
  return out;
}

export function truncateText(text: string, limit: number): string {
  const cut = text.slice(0, Math.max(0, limit));
  const lastNl = cut.lastIndexOf('\n');
  const kept = lastNl > 0 ? cut.slice(0, lastNl) : cut;
  return `${kept}\n[... truncated ${text.length - kept.length} chars ...]`;
}
