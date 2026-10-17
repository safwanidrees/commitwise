/** A change unit: one path, or a rename's new path plus the old path it replaces. */
export interface ChangeUnit {
  path: string;
  oldPath?: string;
}

export interface PlanGroup {
  files: string[];
  message: string;
}

export type PlanCheck = { ok: true; groups: PlanGroup[] } | { ok: false; errors: string[] };

/** Validates Claude's plan: every unit exactly once, nothing unknown, messages non-empty. */
export function validatePlan(raw: unknown, units: ChangeUnit[]): PlanCheck {
  const errors: string[] = [];
  const commits = (raw as { commits?: unknown } | null)?.commits;
  if (!Array.isArray(commits)) {
    return { ok: false, errors: ['Response must be an object with a "commits" array.'] };
  }
  const known = new Set(units.map((u) => u.path));
  const seen = new Map<string, number>();
  const groups: PlanGroup[] = [];
  commits.forEach((c: unknown, i) => {
    const g = c as { files?: unknown; message?: unknown };
    const files = Array.isArray(g.files) ? g.files.filter((f): f is string => typeof f === 'string') : [];
    const message = typeof g.message === 'string' ? g.message.trim() : '';
    if (files.length === 0) {
      errors.push(`Commit ${i + 1} has no files.`);
    }
    if (!message) {
      errors.push(`Commit ${i + 1} has an empty message.`);
    }
    for (const f of files) {
      if (!known.has(f)) {
        errors.push(`Unknown path "${f}" in commit ${i + 1}.`);
      } else if (seen.has(f)) {
        errors.push(`"${f}" appears in both commit ${(seen.get(f) ?? 0) + 1} and commit ${i + 1}.`);
      } else {
        seen.set(f, i);
      }
    }
    groups.push({ files, message });
  });
  const missing = [...known].filter((p) => !seen.has(p));
  if (missing.length > 0) {
    errors.push(`Missing from every commit: ${missing.map((m) => `"${m}"`).join(', ')}.`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, groups };
}

/** Expands unit paths to every path git must stage (renames need both sides). */
export function pathsToStage(files: string[], units: ChangeUnit[]): string[] {
  const byPath = new Map(units.map((u) => [u.path, u]));
  return files.flatMap((f) => {
    const u = byPath.get(f);
    return u?.oldPath ? [f, u.oldPath] : [f];
  });
}
