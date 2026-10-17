# Generate a commit message

1. Make some changes in a git repository.
2. Open **Source Control** (`⌃⇧G` / `Ctrl+Shift+G`).
3. Click **✨** in the Source Control title bar. If you don't see it, hover over the panel or look in its `…` menu.

Claude reads your changes, much as when you ask Claude Code in chat, and writes the message into the commit box. You review it and commit as usual. Commitwise **never commits or pushes on its own**.

If nothing is staged, all uncommitted changes are described.

Before anything is read, Commitwise warns you if your changes appear to contain secrets (API keys, private keys, `.env` files).
