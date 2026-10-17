import * as assert from 'node:assert/strict';
import { buildAgentArgs, buildArgs } from '../../src/claude/cliArgs';
import { classifyFailure, parseCliJson } from '../../src/claude/cliOutput';

// Shapes captured from claude 2.1.278–2.1.296.
const OK = '{"type":"result","subtype":"success","is_error":false,"api_error_status":null,"result":"feat(auth): add logout function"}';
const LOGGED_OUT = '{"type":"result","subtype":"success","is_error":true,"api_error_status":null,"result":"Not logged in · Please run /login"}';
const BAD_MODEL = '{"type":"result","is_error":true,"api_error_status":404,"result":"There\'s an issue with the selected model (x). It may not exist or you may not have access to it."}';

describe('parseCliJson', () => {
  it('extracts the result', () => {
    assert.deepEqual(parseCliJson(OK), { text: 'feat(auth): add logout function', isError: false, apiStatus: null, structured: undefined, denials: 0 });
  });
  it('finds the JSON after other output lines', () => {
    assert.equal(parseCliJson(`[claude-code:unrecognized_model] {"model":"x"}\n${BAD_MODEL}`)?.apiStatus, 404);
  });
  it('returns structured output', () => {
    const r = parseCliJson('{"type":"result","is_error":false,"result":"","structured_output":{"options":["a"]}}');
    assert.deepEqual(r?.structured, { options: ['a'] });
  });
  it('returns undefined for non-JSON', () => {
    assert.equal(parseCliJson('error: unknown option'), undefined);
  });
});

describe('classifyFailure', () => {
  it('spawn ENOENT → NOT_INSTALLED', () => {
    assert.equal(classifyFailure({ spawnErrorCode: 'ENOENT', stderr: '' }), 'NOT_INSTALLED');
  });
  it('real logged-out output → NOT_LOGGED_IN', () => {
    const p = parseCliJson(LOGGED_OUT);
    assert.equal(classifyFailure({ stderr: '', resultText: p?.text ?? '', apiStatus: p?.apiStatus ?? null }), 'NOT_LOGGED_IN');
  });
  it('401 / expired token → NOT_LOGGED_IN', () => {
    assert.equal(classifyFailure({ stderr: '', apiStatus: 401 }), 'NOT_LOGGED_IN');
    assert.equal(classifyFailure({ stderr: 'OAuth token has expired' }), 'NOT_LOGGED_IN');
  });
  it('usage limits → USAGE_LIMIT', () => {
    assert.equal(classifyFailure({ stderr: '', apiStatus: 429 }), 'USAGE_LIMIT');
    assert.equal(classifyFailure({ stderr: '', resultText: 'Claude AI usage limit reached|1760000000' }), 'USAGE_LIMIT');
    assert.equal(classifyFailure({ stderr: '', resultText: "You've hit your limit · resets 5pm" }), 'USAGE_LIMIT');
  });
  it('anything else → UNKNOWN', () => {
    const p = parseCliJson(BAD_MODEL);
    assert.equal(classifyFailure({ stderr: '', resultText: p?.text ?? '', apiStatus: p?.apiStatus ?? null }), 'UNKNOWN');
  });
  it('unknown flags → OUTDATED (CLI too old)', () => {
    assert.equal(classifyFailure({ stderr: "error: unknown option '--x'" }), 'OUTDATED');
  });
});

describe('buildArgs', () => {
  it('disables tools, sessions, MCP, hooks and settings files in neutral mode', () => {
    const a = buildArgs({ model: 'haiku', system: 'SYS', inRepo: false });
    assert.deepEqual(a.slice(0, 5), ['-p', '--output-format', 'json', '--model', 'haiku']);
    assert.equal(a[a.indexOf('--tools') + 1], '');
    assert.equal(a[a.indexOf('--setting-sources') + 1], '');
    assert.ok(a.includes('--no-session-persistence') && a.includes('--strict-mcp-config'));
    assert.equal(a[a.indexOf('--settings') + 1], '{"disableAllHooks":true}');
    assert.equal(a[a.indexOf('--system-prompt') + 1], 'SYS');
    assert.ok(!a.includes('--json-schema') && !a.includes('--bare'));
  });
  it('loads project settings in repo mode and passes a schema', () => {
    const a = buildArgs({ model: 'sonnet', system: 'S', inRepo: true, schema: { type: 'object' } });
    assert.equal(a[a.indexOf('--setting-sources') + 1], 'project');
    assert.equal(a[a.indexOf('--json-schema') + 1], '{"type":"object"}');
  });
});

describe('buildAgentArgs', () => {
  const values = (a: string[], flag: string): string[] => {
    const i = a.indexOf(flag);
    const out: string[] = [];
    for (let j = i + 1; j < a.length && !(a[j] ?? '').startsWith('--'); j++) {
      out.push(a[j] ?? '');
    }
    return out;
  };

  it('allows only read-only tools and git read commands, never asking', () => {
    const a = buildAgentArgs({ appendSystem: 'RULES' });
    assert.deepEqual(values(a, '--tools'), ['Read', 'Grep', 'Glob', 'Bash']);
    assert.deepEqual(values(a, '--allowedTools'), ['Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)']);
    assert.ok(values(a, '--disallowedTools').includes('Read(./**/.env*)'));
    assert.ok(values(a, '--disallowedTools').includes('Bash(git * --output*)'));
    assert.equal(a[a.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.equal(a[a.indexOf('--setting-sources') + 1], 'project');
    assert.equal(a[a.indexOf('--append-system-prompt') + 1], 'RULES');
    assert.deepEqual(JSON.parse(a[a.indexOf('--settings') + 1] ?? ''), { disableAllHooks: true, includeCoAuthoredBy: false });
    assert.ok(!a.includes('--system-prompt') && !a.includes('--bare') && !a.includes('Edit') && !a.includes('Write'));
  });

  it('omits --model when empty so the CLI default (chat model) is used', () => {
    assert.ok(!buildAgentArgs({ appendSystem: 'x' }).includes('--model'));
    const a = buildAgentArgs({ model: 'opus', appendSystem: 'x' });
    assert.equal(a[a.indexOf('--model') + 1], 'opus');
  });
});
