import * as assert from 'node:assert/strict';
import { isBinaryContent, splitDiff, unquote, untrackedFileDiff } from '../../src/git/diffParse';

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export {};
diff --git a/old name.ts b/new name.ts
similarity index 90%
rename from old name.ts
rename to new name.ts
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
diff --git "a/caf\\303\\251.md" "b/caf\\303\\251.md"
--- "a/caf\\303\\251.md"
+++ "b/caf\\303\\251.md"
@@ -1 +1 @@
-x
+y
`;

describe('splitDiff', () => {
  const files = splitDiff(DIFF);

  it('splits into one entry per file', () => {
    assert.deepEqual(
      files.map((f) => f.path),
      ['src/a.ts', 'new name.ts', 'gone.txt', 'img.png', 'café.md'],
    );
  });

  it('records renames', () => {
    assert.equal(files[1]?.oldPath, 'old name.ts');
  });

  it('uses the old path for deletions', () => {
    assert.equal(files[2]?.path, 'gone.txt');
    assert.equal(files[2]?.oldPath, undefined);
  });

  it('detects binary files', () => {
    assert.equal(files[3]?.binary, true);
    assert.equal(files[0]?.binary, false);
  });

  it('keeps each section text', () => {
    assert.ok(files[0]?.text.includes('+const b = 2;'));
    assert.ok(!files[0]?.text.includes('rename'));
  });

  it('returns nothing for an empty diff', () => {
    assert.deepEqual(splitDiff(''), []);
  });
});

describe('unquote', () => {
  it('decodes octal UTF-8 escapes', () => {
    assert.equal(unquote('"caf\\303\\251"'), 'café');
  });
  it('leaves plain strings alone', () => {
    assert.equal(unquote('plain.txt'), 'plain.txt');
  });
});

describe('untrackedFileDiff', () => {
  it('builds a new-file diff with added lines', () => {
    const d = untrackedFileDiff('n.txt', Buffer.from('one\ntwo\n'));
    assert.equal(d.binary, false);
    assert.ok(d.text.includes('@@ -0,0 +1,2 @@\n+one\n+two'));
  });
  it('marks NUL-containing content as binary', () => {
    assert.equal(isBinaryContent(Buffer.from([1, 0, 2])), true);
    assert.equal(untrackedFileDiff('b.bin', Buffer.from([0])).binary, true);
  });
});
