import { FileDiff } from '../git/diffParse';

export interface SecretHit {
  path: string;
  /** Line number in the new file; 0 for whole-file hits (e.g. .env). */
  line: number;
  kind: string;
  masked: string;
}

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'Private key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { kind: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { kind: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: 'Slack webhook', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/ },
  { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'Stripe key', re: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/ },
  { kind: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: 'OpenAI API key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { kind: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
];

const ASSIGNMENT =
  /([A-Za-z0-9_.-]*(?:api[_-]?key|secret|passw(?:or)?d|token|access[_-]?key)[A-Za-z0-9_.-]*)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i;

const PLACEHOLDER = /\$\{|process\.env|<[^>]*>|x{4,}|\*{4,}|your[_-]|changeme|example|placeholder|dummy/i;

/** `.env`, `.env.local`, … but not the templates people intentionally commit. */
export function isEnvFile(path: string): boolean {
  const base = path.split('/').pop() ?? '';
  return /^\.env(\..+)?$/.test(base) && !/\.(example|sample|template|dist)$/.test(base);
}

export function mask(value: string): string {
  return value.length <= 8 ? '****' : `${value.slice(0, 4)}…(${value.length} chars)`;
}

/** Scans only added (`+`) lines of each file diff. */
export function scanDiffs(files: FileDiff[]): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const f of files) {
    if (isEnvFile(f.path)) {
      hits.push({ path: f.path, line: 0, kind: 'Environment file', masked: '(whole file)' });
    }
    for (const { line, text } of addedLines(f.text)) {
      const hit = scanLine(text);
      if (hit) {
        hits.push({ path: f.path, line, ...hit });
      }
    }
  }
  return hits;
}

export function scanLine(text: string): { kind: string; masked: string } | undefined {
  for (const { kind, re } of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      return { kind, masked: mask(m[0]) };
    }
  }
  const a = ASSIGNMENT.exec(text);
  if (a && a[2] && !PLACEHOLDER.test(a[2])) {
    return { kind: `Hard-coded ${a[1]}`, masked: mask(a[2]) };
  }
  return undefined;
}

/** Yields added lines with their line numbers in the new file. */
export function addedLines(diffText: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let lineNo = 0;
  let inHunk = false;
  for (const l of diffText.split('\n')) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      lineNo = Number(h[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (l.startsWith('+')) {
      out.push({ line: lineNo, text: l.slice(1) });
      lineNo++;
    } else if (l.startsWith(' ')) {
      lineNo++;
    } else if (l.startsWith('diff --git ')) {
      inHunk = false;
    }
  }
  return out;
}
