import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { log } from '../ui/log';

const IS_WINDOWS = process.platform === 'win32';
// Only native executables: a Windows .cmd shim would need a shell, which would
// expose the prompt arguments to shell interpretation.
const NAMES = IS_WINDOWS ? ['claude.exe'] : ['claude'];

let cache: { key: string; path: string } | undefined;

/** Finds the claude binary. Cached per session, keyed by the claudePath setting. */
export async function locateClaude(settingPath: string): Promise<string | undefined> {
  if (cache && cache.key === settingPath && (await isExecutable(cache.path))) {
    return cache.path;
  }
  for (const candidate of candidates(settingPath)) {
    if (await isExecutable(candidate)) {
      log().info(`Using claude at ${candidate}`);
      cache = { key: settingPath, path: candidate };
      return candidate;
    }
  }
  if (settingPath) {
    log().warn(`commitwise.claudePath "${settingPath}" is not an executable file.`);
  }
  return undefined;
}

function* candidates(settingPath: string): Generator<string> {
  const home = os.homedir();
  if (settingPath) {
    yield settingPath.replace(/^~(?=$|[\\/])/, home);
  }
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean)) {
    for (const name of NAMES) {
      yield path.join(dir, name);
    }
  }
  for (const dir of commonDirs(home)) {
    for (const name of NAMES) {
      yield path.join(dir, name);
    }
  }
  const bundled = bundledBinary();
  if (bundled) {
    yield bundled;
  }
}

/** Install locations VS Code's PATH often misses (e.g. macOS apps launched from the Dock). */
export function commonDirs(home: string): string[] {
  const dirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
  ];
  if (IS_WINDOWS) {
    return dirs;
  }
  dirs.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.bun', 'bin'),
  );
  const nvm = path.join(home, '.nvm', 'versions', 'node');
  try {
    const versions = fs.readdirSync(nvm).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    dirs.push(...versions.map((v) => path.join(nvm, v, 'bin')));
  } catch {
    // no nvm
  }
  return dirs;
}

/** The binary shipped inside the official Claude Code VS Code extension. */
function bundledBinary(): string | undefined {
  const ext = vscode.extensions.getExtension('anthropic.claude-code');
  if (!ext) {
    return undefined;
  }
  return path.join(ext.extensionPath, 'resources', 'native-binary', IS_WINDOWS ? 'claude.exe' : 'claude');
}

async function isExecutable(p: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(p);
    if (!stat.isFile()) {
      return false;
    }
    await fs.promises.access(p, IS_WINDOWS ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** PATH for the child: npm-installed `claude` is a `#!/usr/bin/env node` script. */
export function childPath(binary: string): string {
  const extra = [path.dirname(fs.realpathSync.native(binary)), path.dirname(binary), ...commonDirs(os.homedir())];
  return [...extra, process.env['PATH'] ?? ''].filter(Boolean).join(path.delimiter);
}
