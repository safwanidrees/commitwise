export type PatternCheck =
  | { ok: true; invalidPattern?: string }
  | { ok: false; subject: string };

/** Checks the message's first line against the guidelines' `pattern` regex. */
export function checkSubject(message: string, pattern: string | undefined): PatternCheck {
  if (!pattern) {
    return { ok: true };
  }
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch (e) {
    return { ok: true, invalidPattern: e instanceof Error ? e.message : String(e) };
  }
  const subject = message.split('\n')[0] ?? '';
  return re.test(subject) ? { ok: true } : { ok: false, subject };
}

export function retryFeedback(pattern: string, previous: string): string {
  return [
    'Your previous answer was:',
    '<previous>',
    previous,
    '</previous>',
    `Its subject line did not match the required pattern \`${pattern}\`.`,
    'Return a corrected commit message only.',
  ].join('\n');
}

/** Defensive cleanup: code fences, wrapping quotes, "Here is…" preambles. */
export function cleanMessage(raw: string): string {
  let t = raw.trim();
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(t);
  if (fence) {
    t = (fence[1] ?? '').trim();
  }
  const firstLine = t.split('\n')[0] ?? '';
  if (/^(here('s| is)\b.*|(suggested )?commit message):?$/i.test(firstLine.trim())) {
    t = t.slice(firstLine.length).trim();
    const inner = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(t);
    if (inner) {
      t = (inner[1] ?? '').trim();
    }
  }
  t = stripAttribution(t);
  for (const q of ['"', "'", '`']) {
    if (t.length >= 2 && t.startsWith(q) && t.endsWith(q) && !t.slice(1, -1).includes(q)) {
      t = t.slice(1, -1).trim();
    }
  }
  return t;
}

/** Removes AI attribution lines (Co-Authored-By: Claude …, "Generated with Claude Code"). */
export function stripAttribution(message: string): string {
  return message
    .split('\n')
    .filter(
      (l) =>
        !/^\s*co-authored-by:.*(claude|anthropic)/i.test(l) &&
        !/generated (with|by) \[?claude/i.test(l),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
