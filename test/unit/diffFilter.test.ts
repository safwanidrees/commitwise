import * as assert from 'node:assert/strict';
import { DEFAULT_IGNORE_GLOBS } from '../../src/config.defaults';
import { allocateBudget, filterDiffs, truncateText } from '../../src/git/diffFilter';
import { FileDiff } from '../../src/git/diffParse';
import { globToRegExp, matchesAny } from '../../src/git/glob';

const fd = (path: string, size = 10, binary = false): FileDiff => ({ path, text: 'x'.repeat(size), binary });

describe('globToRegExp', () => {
  const cases: [string, string, boolean][] = [
    ['**/*.lock', 'Cargo.lock', true],
    ['**/*.lock', 'a/b/Gemfile.lock', true],
    ['**/*.lock', 'a/lock.ts', false],
    ['**/dist/**', 'dist/x.js', true],
    ['**/dist/**', 'pkg/dist/a/b.js', true],
    ['**/dist/**', 'distance.ts', false],
    ['*.md', 'README.md', true],
    ['*.md', 'docs/README.md', false],
    ['src/?.ts', 'src/a.ts', true],
    ['**/*.{png,jpg}', 'img/a.jpg', true],
    ['**/package-lock.json', 'package-lock.json', true],
  ];
  for (const [glob, path, expected] of cases) {
    it(`${glob} ${expected ? 'matches' : 'does not match'} ${path}`, () => {
      assert.equal(globToRegExp(glob).test(path), expected);
    });
  }

  it('default ignore globs cover lockfiles and generated dart', () => {
    for (const p of ['pubspec.lock', 'yarn.lock', 'lib/a.g.dart', 'lib/a.freezed.dart', 'web/app.min.js', 'build/out.txt']) {
      assert.ok(matchesAny(p, DEFAULT_IGNORE_GLOBS), p);
    }
    assert.ok(!matchesAny('lib/main.dart', DEFAULT_IGNORE_GLOBS));
  });
});

describe('filterDiffs', () => {
  it('omits ignored, binary and excluded files by name', () => {
    const r = filterDiffs(
      [fd('src/a.ts'), fd('yarn.lock'), fd('logo.png', 10, true), fd('.env')],
      ['**/yarn.lock'],
      1000,
      new Set(['.env']),
    );
    assert.deepEqual(r.included.map((f) => f.path), ['src/a.ts']);
    assert.deepEqual(r.omitted, [
      { path: 'yarn.lock', reason: 'ignored' },
      { path: 'logo.png', reason: 'binary' },
      { path: '.env', reason: 'excluded' },
    ]);
  });

  it('truncates big files to fit the budget but keeps small ones whole', () => {
    const big = { path: 'big.ts', text: Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'), binary: false };
    const r = filterDiffs([fd('small.ts', 50), big], [], 1000);
    assert.equal(r.included[0]?.text.length, 50);
    assert.ok((r.included[1]?.text.length ?? 0) <= 1000);
    assert.ok(r.included[1]?.text.includes('[... truncated'));
    assert.deepEqual(r.truncated, ['big.ts']);
  });
});

describe('allocateBudget', () => {
  it('gives small items everything and splits the rest', () => {
    assert.deepEqual(allocateBudget([10, 1000, 1000], 310), [10, 150, 150]);
  });
  it('never exceeds the budget', () => {
    const a = allocateBudget([500, 700, 900, 50], 1000);
    assert.ok(a.reduce((x, y) => x + y, 0) <= 1000);
  });
});

describe('truncateText', () => {
  it('cuts at a line boundary and says how much was dropped', () => {
    const t = truncateText('aaa\nbbb\nccc', 6);
    assert.equal(t, 'aaa\n[... truncated 8 chars ...]');
  });
});
