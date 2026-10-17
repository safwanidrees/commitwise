import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Repository } from '../../src/git/gitTypes';
import { getRepo, git, lastSeen, resetRepo, scriptUi, testApi, write } from './helpers';

/**
 * Opt-in smoke test against the real `claude` CLI (uses your subscription; sends
 * only this fixture's toy diff). Run with COMMITWISE_REAL_CLAUDE=1.
 */
(process.env['COMMITWISE_REAL_CLAUDE'] === '1' ? describe : describe.skip)('Real claude CLI', function () {
  this.timeout(180000);
  let repo: Repository;

  before(async () => {
    await testApi();
    await vscode.workspace.getConfiguration('commitwise').update('claudePath', undefined, vscode.ConfigurationTarget.Global);
    repo = await getRepo();
  });

  beforeEach(async () => {
    resetRepo();
    repo.inputBox.value = '';
    await scriptUi({});
  });

  it('setup check reports ready with the real CLI', async () => {
    await vscode.commands.executeCommand('commitwise.checkSetup');
    console.log('    real setup:', lastSeen());
    assert.match(lastSeen().join('\n'), /Commitwise is ready: Claude Code \d+\.\d+\.\d+ is installed and signed in/);
  });

  it('generate produces a message', async () => {
    write('file1.txt', 'content 1\nnow with a second line about refunds\n');
    git('add', '.');
    await vscode.commands.executeCommand('commitwise.generate', { rootUri: repo.rootUri });
    console.log('    real message:', JSON.stringify(repo.inputBox.value), lastSeen());
    assert.ok(repo.inputBox.value.length > 0);
  });

  it('options returns structured alternatives', async () => {
    write('file1.txt', 'refund logic\n');
    git('add', '.');
    let labels: string[] = [];
    await scriptUi({ pick: [(items) => { labels = items.map((i) => (i as unknown as { label: string }).label); return items[0]?.id; }] });
    await vscode.commands.executeCommand('commitwise.generateOptions', { rootUri: repo.rootUri });
    console.log('    real options:', JSON.stringify(labels), lastSeen());
    assert.equal(labels.length, 3);
  });

  it('split plans valid groups', async () => {
    write('src/refund.ts', 'export function refund(id: string) { return id; }\n');
    write('src/refund.test.ts', "import { refund } from './refund';\nrefund('x');\n");
    write('docs/refunds.md', '# Refunds\nHow refunds work.\n');
    let groups: string[] = [];
    await scriptUi({ pick: [(items) => { groups = items.filter((i) => i.id.startsWith('group-')).map((i) => `${(i as unknown as { label: string }).label} [${(i as unknown as { detail: string }).detail}]`); return 'cancel'; }] });
    await vscode.commands.executeCommand('commitwise.splitCommits', { rootUri: repo.rootUri });
    console.log('    real plan:', JSON.stringify(groups), lastSeen());
    assert.ok(groups.length >= 1);
  });

  it('split handles 30+ mixed changes', async () => {
    for (const area of ['auth', 'billing', 'search']) {
      for (const part of ['service', 'controller', 'model', 'routes']) {
        write(`src/${area}/${part}.ts`, `// ${area} ${part}\nexport const ${area}${part[0]?.toUpperCase()}${part.slice(1)} = '${area}-${part}';\n`);
        write(`test/${area}/${part}.test.ts`, `import { ${area}${part[0]?.toUpperCase()}${part.slice(1)} } from '../../src/${area}/${part}';\n`);
      }
    }
    for (const doc of ['setup', 'auth', 'billing', 'search']) {
      write(`docs/${doc}.md`, `# ${doc}\n`);
    }
    write('package.json', '{ "name": "demo", "dependencies": { "zod": "^3.0.0" } }\n');
    write('package-lock.json', '{ "lockfileVersion": 3 }\n');
    write('.github/workflows/ci.yml', 'name: ci\non: push\n');
    let groups: string[] = [];
    await scriptUi({ pick: [(items) => { groups = items.filter((i) => i.id.startsWith('group-')).map((i) => `${(i as unknown as { label: string }).label} [${(i as unknown as { detail: string }).detail}]`); return 'cancel'; }] });
    await vscode.commands.executeCommand('commitwise.splitCommits', { rootUri: repo.rootUri });
    console.log('    real 33-file plan:\n      ' + groups.join('\n      '), lastSeen());
    assert.ok(groups.length >= 3);
  });

  it('agent mode explores the repo and returns a detailed message', async () => {
    const cfg = vscode.workspace.getConfiguration('commitwise');
    await cfg.update('mode', 'agent', vscode.ConfigurationTarget.Global);
    try {
      write('src/refund.ts', [
        'export interface Refund { orderId: string; amountCents: number; reason: string }',
        'export function validateRefund(r: Refund, paidCents: number): string[] {',
        '  const errors: string[] = [];',
        "  if (r.amountCents <= 0) errors.push('amount must be positive');",
        "  if (r.amountCents > paidCents) errors.push('refund exceeds amount paid');",
        "  if (!r.reason.trim()) errors.push('reason is required');",
        '  return errors;',
        '}',
        '',
      ].join('\n'));
      write('file3.txt', 'content 3\nreceipts now show refunds\n');
      await vscode.commands.executeCommand('commitwise.generate', { rootUri: repo.rootUri });
      console.log('    real agent message:\n      ' + repo.inputBox.value.split('\n').join('\n      '), lastSeen());
      assert.ok(repo.inputBox.value.length > 0);
      assert.equal(git('status', '--porcelain').trim().split('\n').length, 2, 'agent changed nothing on disk');
    } finally {
      await cfg.update('mode', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
