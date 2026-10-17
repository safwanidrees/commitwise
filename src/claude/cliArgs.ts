/**
 * Builds the `claude -p` argument list. Every flag here was checked against
 * `claude --help` (CLI 2.1.296).
 */
export function buildArgs(opts: { model?: string; system: string; schema?: object; inRepo: boolean }): string[] {
  const args = [
    '-p',
    '--output-format', 'json',
    ...(opts.model ? ['--model', opts.model] : []),
    // No tools: Claude answers only from the prompt; it can't run git or edit files.
    '--tools', '',
    '--no-session-persistence',
    '--strict-mcp-config',
    // Neutral mode loads no settings files, so the user's global CLAUDE.md and
    // hooks don't leak in. In-repo mode loads the project's settings/CLAUDE.md.
    '--setting-sources', opts.inRepo ? 'project' : '',
    '--settings', JSON.stringify({ disableAllHooks: true }),
    '--system-prompt', opts.system,
  ];
  if (opts.schema) {
    args.push('--json-schema', JSON.stringify(opts.schema));
  }
  return args;
}

/** Git commands agent mode may run. Everything else is denied (`dontAsk`). */
export const AGENT_ALLOWED_BASH = ['Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)'];

/** Denied even inside the allowed commands/tools above. */
export const AGENT_DENIED = [
  'Read(./.env*)',
  'Read(./**/.env*)',
  'Read(./**/*.pem)',
  'Read(./**/*.key)',
  'Read(./**/id_rsa*)',
  'Read(./**/id_ed25519*)',
  // "Read-only" git commands that can still write files or run programs.
  'Bash(git * --output*)',
  'Bash(git * --ext-diff*)',
];

/**
 * Agent mode: Claude investigates the repo itself, like asking in chat, but
 * with read-only tools only. Verified against CLI 2.1.296: Edit/Write are
 * unavailable, non-allowed Bash is denied without prompting, and the Read
 * denies also block Grep.
 */
export function buildAgentArgs(opts: { model?: string; appendSystem: string }): string[] {
  return [
    '-p',
    '--output-format', 'json',
    ...(opts.model ? ['--model', opts.model] : []),
    '--tools', 'Read', 'Grep', 'Glob', 'Bash',
    '--allowedTools', ...AGENT_ALLOWED_BASH,
    '--disallowedTools', ...AGENT_DENIED,
    '--permission-mode', 'dontAsk',
    '--no-session-persistence',
    '--strict-mcp-config',
    // Like chat in this repo: project CLAUDE.md/settings apply, user-level ones don't.
    '--setting-sources', 'project',
    // includeCoAuthoredBy: Claude Code's own prompt otherwise adds an AI co-author trailer.
    '--settings', JSON.stringify({ disableAllHooks: true, includeCoAuthoredBy: false }),
    // Keep Claude Code's own system prompt (what chat uses) and add our rules.
    '--append-system-prompt', opts.appendSystem,
  ];
}
