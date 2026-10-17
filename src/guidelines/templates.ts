export const GUIDELINES_TEMPLATE = `---
# Optional: a regex the first line of every commit message must match.
# Single-quote it. Delete this block if you don't want automatic checking.
pattern: '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\([a-z0-9-]+\\))?!?: .{1,72}$'
---
# Commit Guidelines

These rules are read by Commitwise every time it writes a commit message.
Edit them freely; changes apply on the next generation.

## Format

\`\`\`
<type>(<scope>): <short summary>

<optional body: what changed and why, wrapped at 72 columns>

<optional footer: BREAKING CHANGE: ..., Refs: ABC-123>
\`\`\`

## Allowed types

- **feat**: a new feature
- **fix**: a bug fix
- **docs**: documentation only
- **style**: formatting, no code change
- **refactor**: code change that neither fixes a bug nor adds a feature
- **perf**: performance improvement
- **test**: adding or fixing tests
- **build**: build system or dependencies
- **ci**: CI configuration
- **chore**: other maintenance
- **revert**: reverts a previous commit

## Rules

- Summary in the imperative mood ("add", not "added"), lowercase, no trailing period.
- Summary at most 72 characters.
- Scope is the affected module or area, in kebab-case. Omit it if the change is broad.
- Add a body only when the reason for the change isn't obvious from the summary.
- Put ticket IDs in the footer as \`Refs: ABC-123\`.

## Examples

- \`feat(auth): add password reset via email\`
- \`fix(cart): prevent negative quantities\`
- \`docs: explain local setup on Windows\`
- \`refactor(api): extract retry logic into helper\`
`;
