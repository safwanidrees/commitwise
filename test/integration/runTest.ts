import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/** A throwaway repo with a few commits so history style has something to learn. */
function createFixtureRepo(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'commitwise-it-')));
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  // A nested repo created by one test; keep it out of the fixture's own status.
  fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), 'empty-repo/\n');
  const subjects = [
    'PAY-1 Add payment form',
    'PAY-2 Validate card number',
    'PAY-3 Show receipt page',
    'PAY-4 Fix rounding in totals',
    'PAY-5 Add refund endpoint',
    'PAY-6 Update payment docs',
  ];
  subjects.forEach((s, i) => {
    fs.writeFileSync(path.join(dir, `file${i}.txt`), `content ${i}\n`);
    git('add', '.');
    git('commit', '-q', '-m', s);
  });
  return dir;
}

async function main(): Promise<void> {
  // When launched from a VS Code terminal this is inherited and makes the test
  // instance start as plain Node ("bad option: --extensionTestsPath").
  delete process.env['ELECTRON_RUN_AS_NODE'];
  // Compiled to out/test/integration, so the repo root is three levels up.
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', '..');
  const extensionTestsPath = path.resolve(__dirname, 'index');
  const repo = createFixtureRepo();
  try {
    const executable = process.env['VSCODE_TEST_EXECUTABLE'];
    await runTests({
      // VSCODE_TEST_EXECUTABLE runs the suite in another VS Code-based editor
      // (e.g. /Applications/Cursor.app/Contents/MacOS/Cursor); otherwise
      // VSCODE_TEST_VERSION=1.85.0 tests the minimum supported engine.
      ...(executable ? { vscodeExecutablePath: executable } : { version: process.env['VSCODE_TEST_VERSION'] ?? 'stable' }),
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        ...(process.env['COMMITWISE_NO_CLI'] === '1' ? { COMMITWISE_NO_CLI: '1' } : {}),
        COMMITWISE_FIXTURE_REPO: repo,
        COMMITWISE_FAKE_CLAUDE: path.join(extensionDevelopmentPath, 'test', 'fixtures', 'fake-claude.js'),
      },
      launchArgs: [repo, '--disable-extensions'],
    });
  } catch (err) {
    console.error('Integration tests failed', err);
    process.exit(1);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

void main();
