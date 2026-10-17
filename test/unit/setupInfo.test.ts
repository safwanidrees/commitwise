import * as assert from 'node:assert/strict';
import { compareVersions, installCommand, MIN_CLI_VERSION, parseAuthStatus, parseVersion } from '../../src/claude/setupInfo';

describe('setupInfo', () => {
  it('parses the CLI version output', () => {
    assert.equal(parseVersion('2.1.296 (Claude Code)'), '2.1.296');
    assert.equal(parseVersion('garbage'), undefined);
  });

  it('compares versions numerically', () => {
    assert.ok(compareVersions('2.1.296', MIN_CLI_VERSION) >= 0);
    assert.ok(compareVersions('2.1.295', MIN_CLI_VERSION) < 0);
    assert.ok(compareVersions('2.1.99', '2.1.278') < 0);
    assert.ok(compareVersions('2.10.0', '2.9.9') > 0);
    assert.equal(compareVersions('2.1.278', '2.1.278'), 0);
  });

  it('reads real `claude auth status` output in both states', () => {
    // Shapes captured from CLI 2.1.296 (email/paths trimmed).
    assert.deepEqual(parseAuthStatus('{\n  "loggedIn": true,\n  "authMethod": "claude.ai",\n  "apiProvider": "firstParty"\n}'), {
      loggedIn: true,
      method: 'claude.ai',
    });
    assert.deepEqual(parseAuthStatus('{"loggedIn": false, "authMethod": "none"}'), { loggedIn: false, method: 'none' });
    assert.equal(parseAuthStatus('error: unknown command'), undefined);
  });

  it('uses the official install command per platform', () => {
    assert.equal(installCommand('darwin'), 'curl -fsSL https://claude.ai/install.sh | bash');
    assert.equal(installCommand('linux'), 'curl -fsSL https://claude.ai/install.sh | bash');
    assert.equal(installCommand('win32'), 'irm https://claude.ai/install.ps1 | iex');
  });
});
