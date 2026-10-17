import * as assert from 'node:assert/strict';
import {
  buildAgentMessagePrompt,
  buildMessagePrompt,
  buildRewritePrompt,
  extractTaggedMessage,
  buildOptionsPrompt,
  buildSplitPrompt,
  MessageContext,
  renderDiff,
} from '../../src/prompt/promptBuilder';

const diff = {
  included: [{ path: 'a.ts', text: 'diff --git a/a.ts b/a.ts\n+x', binary: false }],
  omitted: [{ path: 'yarn.lock', reason: 'ignored' as const }, { path: 'logo.png', reason: 'binary' as const }],
  truncated: [],
};
const ctx = (over: Partial<MessageContext> = {}): MessageContext => ({
  style: { kind: 'default' },
  diff,
  source: 'staged changes',
  ...over,
});

describe('promptBuilder', () => {
  it('defaults to Conventional Commits', () => {
    const p = buildMessagePrompt(ctx());
    assert.match(p.system, /Conventional Commits/);
    assert.match(p.user, /staged changes/);
  });

  it('puts guidelines in the system prompt with override wording', () => {
    const p = buildMessagePrompt(ctx({ style: { kind: 'guidelines', path: 'COMMIT_GUIDELINES.md', content: 'Use emoji' } }));
    assert.match(p.system, /override all other style instructions/);
    assert.match(p.system, /Use emoji/);
    assert.doesNotMatch(p.system, /Conventional Commits:/);
  });

  it('uses history examples when given', () => {
    const p = buildMessagePrompt(ctx({ style: { kind: 'history', examples: ['JIRA-1 Fix thing'] } }));
    assert.match(p.system, /- JIRA-1 Fix thing/);
  });

  it('passes the ticket as a fact', () => {
    assert.match(buildMessagePrompt(ctx({ ticket: 'ABC-12' })).system, /ticket ID for this work is ABC-12.*\[ABC-12\]/s);
    assert.match(buildMessagePrompt(ctx()).system, /Never invent or guess ticket/);
  });

  it('lists omitted files by name only', () => {
    const r = renderDiff(diff);
    assert.match(r, /<diff>\ndiff --git a\/a.ts/);
    assert.match(r, /- yarn.lock\n- logo.png \(binary\)/);
  });

  it('options prompt requests a schema with N items', () => {
    const p = buildOptionsPrompt(ctx(), 4);
    assert.deepEqual((p.schema as { properties: { options: { minItems: number } } }).properties.options.minItems, 4);
  });

  it('split prompt lists every unit including renames', () => {
    const p = buildSplitPrompt(ctx(), [{ path: 'a.ts' }, { path: 'n.ts', oldPath: 'o.ts' }]);
    assert.match(p.user, /<files>\na.ts\nn.ts \(renamed from o.ts\)\n<\/files>/);
    assert.ok(p.schema);
  });
});

describe('agent prompts', () => {
  it('asks like chat and scopes to staged or uncommitted changes', () => {
    const u = buildAgentMessagePrompt(ctx(), 'uncommitted');
    assert.equal(u.user, 'Generate a commit message for the uncommitted code.');
    assert.match(u.system, /ALL uncommitted changes/);
    const s = buildAgentMessagePrompt(ctx({ style: { kind: 'guidelines', path: 'G.md', content: 'Use bullets' } }), 'staged');
    assert.match(s.system, /git diff --cached/);
    assert.match(s.system, /override all other style instructions[\s\S]*Use bullets/);
    assert.match(s.system, /<commit_message>/);
    assert.equal(s.schema, undefined);
  });

  it('extracts the last tagged message', () => {
    assert.equal(extractTaggedMessage('thinking...\n<commit_message>\nfeat: a\n\n- b\n</commit_message>'), 'feat: a\n\n- b');
    assert.equal(extractTaggedMessage('<commit_message>x</commit_message> then <commit_message>y</commit_message>'), 'y');
    assert.equal(extractTaggedMessage('no tags here'), undefined);
  });

  it('rewrite prompt carries the previous message and pattern', () => {
    const p = buildRewritePrompt(ctx(), 'Added stuff', '^feat');
    assert.match(p.user, /Added stuff[\s\S]*`\^feat`/);
  });
});
