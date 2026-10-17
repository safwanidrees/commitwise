import * as assert from 'node:assert/strict';
import { extractTicket } from '../../src/git/branchTicket';
import { checkSubject, cleanMessage, retryFeedback } from '../../src/prompt/validator';

describe('checkSubject', () => {
  it('passes with no pattern', () => {
    assert.deepEqual(checkSubject('anything', undefined), { ok: true });
  });
  it('tests only the first line', () => {
    assert.equal(checkSubject('feat: x\n\nbody', '^feat: \\w+$').ok, true);
    assert.deepEqual(checkSubject('Feat x', '^feat: '), { ok: false, subject: 'Feat x' });
  });
  it('reports an invalid pattern instead of throwing', () => {
    const r = checkSubject('x', '(');
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.invalidPattern);
  });
  it('retry feedback names the pattern and previous answer', () => {
    const f = retryFeedback('^feat', 'Added stuff');
    assert.ok(f.includes('`^feat`') && f.includes('Added stuff'));
  });
});

describe('cleanMessage', () => {
  const cases: [string, string][] = [
    ['feat: x', 'feat: x'],
    ['  feat: x\n', 'feat: x'],
    ['```\nfeat: x\n```', 'feat: x'],
    ['```text\nfeat: x\n\nbody\n```', 'feat: x\n\nbody'],
    ['"feat: x"', 'feat: x'],
    ['`feat: x`', 'feat: x'],
    ['Here is the commit message:\n\nfeat: x', 'feat: x'],
    ['Commit message:\n```\nfeat: x\n```', 'feat: x'],
    ['fix: handle "quoted" names', 'fix: handle "quoted" names'],
    ['feat: x\n\n- body\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', 'feat: x\n\n- body'],
    ['feat: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)', 'feat: x'],
    ['feat: x\n\nCo-authored-by: Jane Doe <jane@example.com>', 'feat: x\n\nCo-authored-by: Jane Doe <jane@example.com>'],
  ];
  for (const [input, expected] of cases) {
    it(JSON.stringify(input), () => assert.equal(cleanMessage(input), expected));
  }
});

describe('extractTicket', () => {
  const re = '[A-Z][A-Z0-9]+-\\d+';
  it('finds the first ticket', () => {
    assert.equal(extractTicket('feature/ABC-123-login', re), 'ABC-123');
    assert.equal(extractTicket('PROJ2-9_and_X-1', re), 'PROJ2-9');
  });
  it('returns undefined when absent or misconfigured', () => {
    assert.equal(extractTicket('main', re), undefined);
    assert.equal(extractTicket(undefined, re), undefined);
    assert.equal(extractTicket('ABC-1', ''), undefined);
    assert.equal(extractTicket('ABC-1', '('), undefined);
  });
});
