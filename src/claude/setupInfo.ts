/** Oldest CLI the flags in cliArgs.ts were verified against. */
export const MIN_CLI_VERSION = '2.1.296';

/** "2.1.296 (Claude Code)" → "2.1.296". */
export function parseVersion(output: string): string | undefined {
  return /(\d+\.\d+\.\d+)/.exec(output)?.[1];
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

/** Parses `claude auth status` (JSON with `loggedIn`). Undefined if unreadable. */
export function parseAuthStatus(output: string): { loggedIn: boolean; method?: string } | undefined {
  try {
    const d = JSON.parse(output.slice(output.indexOf('{'))) as { loggedIn?: unknown; authMethod?: unknown };
    if (typeof d.loggedIn !== 'boolean') {
      return undefined;
    }
    return typeof d.authMethod === 'string' ? { loggedIn: d.loggedIn, method: d.authMethod } : { loggedIn: d.loggedIn };
  } catch {
    return undefined;
  }
}

/** The official install command for this platform (from code.claude.com/docs/en/setup). */
export function installCommand(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash';
}
