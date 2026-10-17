# Commitwise: AI commit messages with Claude

Write great git commit messages with the **Claude subscription you already have**. Commitwise works through Claude Code on your machine, so there's **no API key and no extra account**.

Click **✨** in Source Control. Claude reads your changes, much as when you ask Claude Code in chat, and writes the message into the commit box. You review it and commit.

```
feat(exchange): add binance spot order adapter

- place and cancel limit/market orders via ccxt
- map exchange errors to domain OrderRejected events
- retry rate-limited requests with backoff
```

## Get started

1. **Install this extension.** A *Get started* guide opens automatically.
2. **Install Claude Code**, if you don't have it. The guide's **Install Claude Code** button types the official command into a terminal for you:
   - macOS / Linux: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`
3. **Sign in once** with **Commitwise: Sign In to Claude Code**, or run `claude auth login`. This needs a Claude Pro, Max, Team or Enterprise plan.
4. Click **✨** in Source Control.

**Commitwise: Check Setup** confirms everything is ready without using any of your Claude usage.

## Features

- **Reads your changes like chat does.** In the default **agent** mode, Claude runs `git status` and `git diff` and opens files to understand what changed and why.
- **Follows your team's rules.** Add a `COMMIT_GUIDELINES.md` to the repo and every message follows it: format, scopes, required body, and an optional subject-line regex that's checked automatically.
- **Learns your repo's style** from recent commits when there are no guidelines.
- **Ticket IDs from branch names.** It reads `feature/ABC-123-login` → `ABC-123` and never invents one.
- **Secret scan first.** Private keys, cloud and API tokens, JWTs, hard-coded passwords and `.env` files trigger a warning *before* Claude sees anything.
- **Several options to pick from**, **split a big change into logical commits** (you review the plan first), and **PR descriptions**.
- **Never commits or pushes on its own.** Splitting commits only after you approve the plan, and it never pushes.

## Commands

| Command | Where |
|---|---|
| Generate Commit Message | ✨ in the Source Control title bar |
| Generate Commit Message Options… | Source Control `…` menu |
| Split Changes into Commits… | Source Control `…` menu |
| Create Commit Guidelines File | Command Palette |
| Generate Guidelines from Commit History | Command Palette |
| Generate PR Description | Command Palette |
| Check Setup / Install Claude Code / Sign In / Getting Started | Command Palette |

Can't see ✨? Hover over the Source Control panel (VS Code hides header buttons until you hover), or look in its `…` menu.

## Agent mode vs fast mode

| | `agent` (default) | `fast` |
|---|---|---|
| How | Claude explores the changes itself with **read-only** tools | Commitwise sends a trimmed diff |
| Model | your Claude Code default (`commitwise.agentModel` to change) | `commitwise.model` (`haiku`) |
| Time | about 10–90 s | a few seconds |

Agent mode can only run `git status`, `git diff`, `git log` and `git show`, plus read and search files. It cannot edit, write, delete, commit or push, and any other command is refused. `.env`, `*.pem`, `*.key` and SSH key files are blocked from reading.

## Commit guidelines

Commitwise reads the first file it finds: the `commitwise.guidelinesPath` setting, `COMMIT_GUIDELINES.md`, `.github/commit-guidelines.md`, or `.vscode/commit-guidelines.md`. It's plain markdown, and it overrides every default style. Optional frontmatter enforces the subject line:

```markdown
---
pattern: '^(feat|fix|docs|chore)(\([a-z-]+\))?: .{1,72}$'
---
# Commit Guidelines
- Always include a body with 2–5 bullet points.
```

## Settings

| Setting | Default | |
|---|---|---|
| `commitwise.mode` | `agent` | `agent` or `fast` |
| `commitwise.agentModel` | `""` | Agent mode model; empty = Claude Code default |
| `commitwise.model` | `haiku` | Fast mode model |
| `commitwise.agentTimeoutSeconds` / `timeoutSeconds` | `180` / `60` | |
| `commitwise.claudePath` | `""` | Path to `claude`; empty = auto-detect |
| `commitwise.guidelinesPath` | `""` | Custom guidelines file |
| `commitwise.useHistoryStyle` | `true` | Learn style from recent commits |
| `commitwise.ticketRegex` | `[A-Z][A-Z0-9]+-\d+` | Ticket pattern in branch names |
| `commitwise.secretScan` | `true` | Warn about secrets before sending |
| `commitwise.ignoreGlobs` | lockfiles, generated and build output | Fast mode: sent by name only |
| `commitwise.optionsCount` | `3` | Alternatives offered |

## Privacy

Your changes and guidelines go to Anthropic **through your own Claude Code CLI under your own account**. That's the same path as running `claude` in a terminal. Commitwise itself sends no telemetry and stores no credentials. Claude Code runs with hooks and MCP servers disabled and keeps no session history. AI attribution lines (Co-Authored-By: Claude …) are never added to your messages.

## Requirements

- VS Code 1.85+, Cursor or Windsurf, with the built-in Git extension.
- Claude Code CLI 2.1.296+, signed in (Commitwise offers a one-click update if yours is older).

## Known limitations

- Windows needs the native `claude.exe` install; the npm `claude.cmd` shim is not supported. Windows and Linux are less tested than macOS.
- Agent mode applies to **Generate Commit Message**; options, splitting and PR descriptions use fast mode.
- The secret scan is pattern-based and catches common formats, not everything.

---

Commitwise is an independent project and is not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.

Source, issues and contributing: [github.com/safwanidrees/commitwise](https://github.com/safwanidrees/commitwise)
