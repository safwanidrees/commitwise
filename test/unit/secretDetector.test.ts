import * as assert from 'node:assert/strict';
import { untrackedFileDiff } from '../../src/git/diffParse';
import { addedLines, isEnvFile, mask, scanDiffs, scanLine } from '../../src/safety/secretDetector';

// Built at runtime so this file itself doesn't trip secret scanners.
const AWS = 'AKIA' + 'IOSFODNN7EXAMPLE';
const GH = 'ghp_' + 'a'.repeat(36);

describe('scanLine', () => {
  const positives: [string, string][] = [
    ['-----BEGIN RSA PRIVATE KEY-----', 'Private key'],
    ['-----BEGIN OPENSSH PRIVATE KEY-----', 'Private key'],
    [`const k = "${AWS}";`, 'AWS access key'],
    [`token: ${GH}`, 'GitHub token'],
    ['SLACK=xoxb-' + '1234567890-abcdefghij', 'Slack token'],
    ['key=AIza' + 'B'.repeat(35), 'Google API key'],
    ['stripe("sk_live_' + '4'.repeat(24) + '")', 'Stripe key'],
    ['auth = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"', 'JWT'],
  ];
  for (const [line, kind] of positives) {
    it(`detects ${kind}`, () => {
      assert.equal(scanLine(line)?.kind, kind);
    });
  }

  it('detects generic secret assignments', () => {
    assert.match(scanLine('const api_key = "s3cr3t-value-123456";')?.kind ?? '', /api_key/);
    assert.match(scanLine('DB_PASSWORD: "hunter2hunter2hunter2"')?.kind ?? '', /PASSWORD/);
  });

  it('ignores placeholders and short values', () => {
    assert.equal(scanLine('api_key = "${API_KEY_FROM_ENV}"'), undefined);
    assert.equal(scanLine('password = "your_password_here"'), undefined);
    assert.equal(scanLine('token = "abc"'), undefined);
    assert.equal(scanLine('const tokenizer = new Tokenizer();'), undefined);
  });

  it('masks the value', () => {
    const hit = scanLine(`k = "${AWS}"`);
    assert.equal(hit?.masked, 'AKIA…(20 chars)');
    assert.ok(!hit?.masked.includes('EXAMPLE'));
  });
});

describe('scanDiffs', () => {
  it('scans added lines only, with new-file line numbers', () => {
    const text = [
      'diff --git a/c.ts b/c.ts',
      '--- a/c.ts',
      '+++ b/c.ts',
      '@@ -10,3 +10,3 @@',
      ' keep',
      `-const old = "${AWS}";`,
      `+const fresh = "${AWS}";`,
      ' keep',
    ].join('\n');
    const hits = scanDiffs([{ path: 'c.ts', text, binary: false }]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.line, 11);
    assert.equal(hits[0]?.kind, 'AWS access key');
  });

  it('flags .env files but not templates', () => {
    assert.equal(isEnvFile('.env'), true);
    assert.equal(isEnvFile('config/.env.local'), true);
    assert.equal(isEnvFile('.env.example'), false);
    assert.equal(isEnvFile('environment.ts'), false);
    const hits = scanDiffs([untrackedFileDiff('.env', Buffer.from('A=1\n'))]);
    assert.equal(hits[0]?.kind, 'Environment file');
  });

  it('finds a fake AWS key in an untracked file', () => {
    const hits = scanDiffs([untrackedFileDiff('cfg.js', Buffer.from(`a\nb\nconst key = '${AWS}'\n`))]);
    assert.deepEqual(hits.map((h) => [h.path, h.line]), [['cfg.js', 3]]);
  });
});

describe('helpers', () => {
  it('addedLines handles multiple hunks', () => {
    const lines = addedLines('@@ -1 +1,2 @@\n a\n+b\n@@ -9 +10,2 @@\n+c\n d');
    assert.deepEqual(lines, [
      { line: 2, text: 'b' },
      { line: 10, text: 'c' },
    ]);
  });
  it('mask hides short values entirely', () => {
    assert.equal(mask('abc'), '****');
  });
});
