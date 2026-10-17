import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Manifest {
  main: string;
  engines: { vscode: string };
  extensionDependencies?: string[];
  contributes: {
    commands: { command: string; icon?: string }[];
    menus: Record<string, { command: string; group?: string; when?: string }[]>;
  };
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'),
) as Manifest;

describe('package.json manifest', () => {
  it('targets VS Code ^1.85.0 and bundles to dist/', () => {
    assert.equal(manifest.engines.vscode, '^1.85.0');
    assert.equal(manifest.main, './dist/extension.js');
  });

  it('depends on the built-in git extension', () => {
    assert.ok(manifest.extensionDependencies?.includes('vscode.git'));
  });

  it('contributes commitwise.generate with a sparkle icon', () => {
    const cmd = manifest.contributes.commands.find((c) => c.command === 'commitwise.generate');
    assert.ok(cmd);
    assert.equal(cmd.icon, '$(sparkle)');
  });

  it('shows the generate button in the git SCM title bar only', () => {
    const item = manifest.contributes.menus['scm/title']?.find(
      (m) => m.command === 'commitwise.generate',
    );
    assert.ok(item);
    assert.equal(item.group, 'navigation');
    assert.equal(item.when, 'scmProvider == git');
  });

  it('walkthrough steps reference existing commands and media files', () => {
    const m = manifest as unknown as {
      contributes: { commands: { command: string }[]; walkthroughs: { steps: { description: string; media: { markdown: string } }[] }[] };
    };
    const known = new Set(m.contributes.commands.map((c) => c.command));
    for (const step of m.contributes.walkthroughs[0]?.steps ?? []) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', '..', '..', step.media.markdown)), step.media.markdown);
      for (const [, cmd] of step.description.matchAll(/\(command:(commitwise\.[\w]+)/g)) {
        assert.ok(known.has(cmd ?? ''), `${cmd} is contributed`);
      }
    }
  });

  it('defaults to agent mode', () => {
    const props = (manifest as unknown as { contributes: { configuration: { properties: Record<string, { default: unknown }> } } })
      .contributes.configuration.properties;
    assert.equal(props['commitwise.mode']?.default, 'agent');
  });
});
