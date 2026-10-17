/** One file's section of a unified `git diff`. */
export interface FileDiff {
  /** Repo-relative path, forward slashes. For deletions, the deleted path. */
  path: string;
  /** Previous path when the file was renamed. */
  oldPath?: string;
  text: string;
  binary: boolean;
}

/** Splits a multi-file unified diff into per-file sections. */
export function splitDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = diff.split('\n');
  let current: string[] | undefined;
  const flush = (): void => {
    if (current && current.length > 0) {
      files.push(parseSection(current));
    }
  };
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  flush();
  return files;
}

function parseSection(lines: string[]): FileDiff {
  let minus: string | undefined;
  let plus: string | undefined;
  let renameFrom: string | undefined;
  let renameTo: string | undefined;
  let binary = false;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      break;
    }
    if (line.startsWith('--- ')) {
      minus = stripPrefix(unquote(line.slice(4)));
    } else if (line.startsWith('+++ ')) {
      plus = stripPrefix(unquote(line.slice(4)));
    } else if (line.startsWith('rename from ')) {
      renameFrom = unquote(line.slice(12));
    } else if (line.startsWith('rename to ')) {
      renameTo = unquote(line.slice(10));
    } else if (/^Binary files .* differ$/.test(line) || line === 'GIT binary patch') {
      binary = true;
    }
  }
  if (lines.some((l) => l === 'GIT binary patch')) {
    binary = true;
  }
  const header = parseHeader(lines[0] ?? '');
  const path =
    renameTo ?? (plus && plus !== '/dev/null' ? plus : undefined) ??
    (minus && minus !== '/dev/null' ? minus : undefined) ?? header.b ?? header.a ?? '';
  const oldPath = renameFrom ?? (header.a && header.a !== path ? header.a : undefined);
  const result: FileDiff = { path, text: lines.join('\n').replace(/\n+$/, ''), binary };
  if (oldPath && oldPath !== path) {
    result.oldPath = oldPath;
  }
  return result;
}

/** Parses `diff --git a/X b/Y`. Unambiguous only for quoted paths or when X === Y. */
function parseHeader(line: string): { a?: string; b?: string } {
  const rest = line.slice('diff --git '.length);
  const quoted = /^"((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)"$/.exec(rest);
  if (quoted) {
    return { a: stripPrefix(unquote(`"${quoted[1]}"`)), b: stripPrefix(unquote(`"${quoted[2]}"`)) };
  }
  // a/<p> b/<p> with identical p: total length = 2 * len(p) + 5.
  if ((rest.length - 5) % 2 === 0) {
    const n = (rest.length - 5) / 2;
    const a = rest.slice(2, 2 + n);
    const b = rest.slice(n + 5);
    if (rest.startsWith('a/') && rest.slice(n + 2, n + 5) === ' b/' && a === b) {
      return { a, b };
    }
  }
  const idx = rest.lastIndexOf(' b/');
  if (rest.startsWith('a/') && idx > 0) {
    return { a: rest.slice(2, idx), b: rest.slice(idx + 3) };
  }
  return {};
}

function stripPrefix(p: string): string {
  return p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p;
}

/** Undoes git's C-style quoting of unusual paths ("a/caf\303\251.txt"). */
export function unquote(s: string): string {
  const t = s.replace(/\t$/, '');
  if (!(t.startsWith('"') && t.endsWith('"'))) {
    return t;
  }
  const bytes: number[] = [];
  const body = t.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = body[i + 1] ?? '';
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      const map: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\' };
      bytes.push(...Buffer.from(map[next] ?? next, 'utf8'));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Builds a synthetic "new file" diff for an untracked file's content. */
export function untrackedFileDiff(path: string, content: Buffer): FileDiff {
  if (isBinaryContent(content)) {
    return { path, text: `diff --git a/${path} b/${path}\nnew file\nBinary file`, binary: true };
  }
  const text = content.toString('utf8');
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = body.length === 0 ? [] : body.split('\n');
  const out = [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
  ];
  if (lines.length > 0) {
    out.push(`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`));
  }
  return { path, text: out.join('\n'), binary: false };
}

/** Same heuristic git uses: a NUL byte in the first 8000 bytes means binary. */
export function isBinaryContent(content: Buffer): boolean {
  return content.subarray(0, 8000).includes(0);
}
