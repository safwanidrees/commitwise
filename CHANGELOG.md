# Changelog

## 0.3.0 (first public preview)

- Getting Started walkthrough: install Claude Code, sign in, generate.
- Commitwise: Check Setup, Install Claude Code, Sign In to Claude Code (free checks, no Claude usage).
- Clear guidance when the Claude Code CLI is missing, signed out or too old.
- Agent mode is now the default.

## 0.2.0 (unreleased)

- Agent mode (`commitwise.mode: "agent"`): Claude investigates the changes itself with read-only tools, like asking Claude Code in chat, using your default Claude Code model.
- AI attribution lines (Co-Authored-By: Claude, "Generated with Claude Code") are never added to messages.

## 0.1.1 (unreleased)

- Split Changes into Commits… now works in a repository with no commits yet.
- When a split stops on an error, the message says which step failed and shows git's own error text.

## 0.1.0 (unreleased)

- ✨ Generate Commit Message from staged changes (falls back to unstaged + untracked).
- Team guidelines file with optional `pattern` frontmatter and one automatic retry.
- Learns style from recent commits; Conventional Commits as the final fallback.
- Ticket IDs from branch names; never invented.
- Secret scan before sending, with Cancel / Send Anyway / Exclude Those Files.
- Generate Commit Message Options…
- Split Changes into Commits… with plan review (edit, move, drop) and safe stop on failure.
- Create Commit Guidelines File; Generate Guidelines from Commit History.
- Generate PR Description.
