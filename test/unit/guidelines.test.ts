import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { guidelinesCandidates, loadGuidelines } from '../../src/guidelines/guidelinesLoader';
import { parseFrontmatter, truncateBytes } from '../../src/guidelines/frontmatter';
import { GUIDELINES_TEMPLATE } from '../../src/guidelines/templates';
import { checkSubject } from '../../src/prompt/validator';

describe('parseFrontmatter', () => {
  it('reads key/value pairs and strips the block', () => {
    const r = parseFrontmatter("---\npattern: '^feat: .+$'\nother: x\n---\n# Body\n");
    assert.deepEqual(r.data, { pattern: '^feat: .+$', other: 'x' });
    assert.equal(r.body, '# Body\n');
  });

  it('handles quoting rules', () => {
    assert.equal(parseFrontmatter("---\np: 'it''s'\n---\n").data['p'], "it's");
    assert.equal(parseFrontmatter('---\np: "a\\\\d+"\n---\n').data['p'], 'a\\d+');
    assert.equal(parseFrontmatter('---\np: ^bare\\d$\n---\n').data['p'], '^bare\\d$');
  });

  it('ignores comments, CRLF and BOM', () => {
    const r = parseFrontmatter('﻿---\r\n# note\r\npattern: x\r\n---\r\nbody');
    assert.deepEqual(r.data, { pattern: 'x' });
    assert.equal(r.body, 'body');
  });

  it('returns the whole text when there is no frontmatter', () => {
    assert.deepEqual(parseFrontmatter('# Title\n---\n'), { data: {}, body: '# Title\n---\n' });
  });

  it('template pattern accepts conventional commits and rejects others', () => {
    const pattern = parseFrontmatter(GUIDELINES_TEMPLATE).data['pattern'];
    assert.ok(pattern);
    assert.equal(checkSubject('feat(auth): add login', pattern).ok, true);
    assert.equal(checkSubject('fix: handle null', pattern).ok, true);
    assert.equal(checkSubject('Added login', pattern).ok, false);
  });
});

describe('truncateBytes', () => {
  it('cuts on a character boundary', () => {
    const r = truncateBytes('aé€', 4); // 1 + 2 + 3 bytes
    assert.equal(r.text, 'aé');
    assert.equal(r.truncated, true);
  });
  it('leaves short text alone', () => {
    assert.deepEqual(truncateBytes('abc', 10), { text: 'abc', truncated: false });
  });
});

describe('loadGuidelines', () => {
  const make = (files: Record<string, string>): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-'));
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
  };

  it('lists custom path, root, .github, .vscode in order', () => {
    assert.deepEqual(guidelinesCandidates('docs/commits.md'), [
      'docs/commits.md',
      'COMMIT_GUIDELINES.md',
      '.github/commit-guidelines.md',
      '.vscode/commit-guidelines.md',
    ]);
  });

  it('first match wins', async () => {
    const dir = make({ '.github/commit-guidelines.md': 'github', '.vscode/commit-guidelines.md': 'vscode' });
    assert.equal((await loadGuidelines(dir, '', 16000))?.path, '.github/commit-guidelines.md');
    fs.writeFileSync(path.join(dir, 'COMMIT_GUIDELINES.md'), 'root');
    assert.equal((await loadGuidelines(dir, '', 16000))?.content, 'root');
    fs.writeFileSync(path.join(dir, 'custom.md'), 'custom');
    assert.equal((await loadGuidelines(dir, 'custom.md', 16000))?.content, 'custom');
  });

  it('returns the pattern and body without frontmatter', async () => {
    const dir = make({ 'COMMIT_GUIDELINES.md': "---\npattern: '^x'\n---\nRules" });
    assert.deepEqual(await loadGuidelines(dir, '', 16000), { path: 'COMMIT_GUIDELINES.md', content: 'Rules', pattern: '^x' });
  });

  it('truncates and warns past the byte cap', async () => {
    const dir = make({ 'COMMIT_GUIDELINES.md': 'a'.repeat(5000) });
    const warnings: string[] = [];
    const g = await loadGuidelines(dir, '', 1000, (m) => warnings.push(m));
    assert.equal(g?.content.length, 1000);
    assert.equal(warnings.length, 1);
  });

  it('returns undefined when there is no file', async () => {
    assert.equal(await loadGuidelines(make({}), '', 16000), undefined);
  });
});
