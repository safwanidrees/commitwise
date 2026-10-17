/**
 * Minimal glob → RegExp for ignore patterns, matched against repo-relative
 * forward-slash paths. Supports `**`, `*`, `?`, and `{a,b}`.
 */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  let i = 0;
  let inBrace = false;
  while (i < glob.length) {
    const ch = glob[i] as string;
    if (ch === '*' && glob[i + 1] === '*') {
      const atStart = i === 0 || glob[i - 1] === '/';
      const followedBySlash = glob[i + 2] === '/';
      if (atStart && followedBySlash) {
        re += '(?:.*/)?';
        i += 3;
      } else {
        re += '.*';
        i += 2;
      }
    } else if (ch === '*') {
      re += '[^/]*';
      i++;
    } else if (ch === '?') {
      re += '[^/]';
      i++;
    } else if (ch === '{') {
      inBrace = true;
      re += '(?:';
      i++;
    } else if (ch === '}' && inBrace) {
      inBrace = false;
      re += ')';
      i++;
    } else if (ch === ',' && inBrace) {
      re += '|';
      i++;
    } else {
      re += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((g) => {
    try {
      return globToRegExp(g).test(path);
    } catch {
      return false;
    }
  });
}
