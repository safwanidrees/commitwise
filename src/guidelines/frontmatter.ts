export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * Minimal YAML-style frontmatter: `---` fenced `key: value` lines at the top.
 * Values may be bare, 'single-quoted' ('' escapes a quote) or "double-quoted"
 * (\\ and \" escapes). No nesting, lists or multi-line values.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  if (!m) {
    return { data: {}, body: normalized };
  }
  const data: Record<string, string> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    const kv = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (kv?.[1] !== undefined && !line.trimStart().startsWith('#')) {
      data[kv[1]] = parseValue(kv[2] ?? '');
    }
  }
  return { data, body: normalized.slice(m[0].length) };
}

function parseValue(raw: string): string {
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return raw;
}

/** Truncates to at most `maxBytes` UTF-8 bytes without splitting a character. */
export function truncateBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) {
    return { text, truncated: false };
  }
  return { text: buf.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/, ''), truncated: true };
}
