# Manual testing checklist

Automated:
- `npm test`: unit tests plus integration tests against a fixture repo and a fake `claude`.
- `npm run test:min`: the same on VS Code 1.85.0.
- `COMMITWISE_REAL_CLAUDE=1 npm run test:integration`: adds smoke tests that use the real CLI.

The checks below need human eyes or real-world state. Press **F5**, then open a git repo in the dev host.

## 1. Scaffold
- [ ] ✨ appears in the Source Control title bar for git repos only. The tooltip reads "Generate Commit Message".
- [ ] The `…` menu shows "Generate Commit Message Options…" and "Split Changes into Commits…".

## 2. Git plumbing
- [ ] Stage one file and change another without staging it. Only the staged change is described.
- [ ] Unstage everything. The unstaged and untracked changes are described.
- [ ] Open two repos (multi-root). Click ✨ on the second one: its message is filled in, not the first's.
- [ ] Type a draft, then click ✨. The draft is replaced, and **Undo** in the notification restores it.

## 3. Claude CLI
- [ ] A progress bar shows on the Source Control view, along with a notification that has **Cancel**. Cancel stops it silently.
- [ ] Set `commitwise.claudePath` to `/nope` and temporarily rename your real `claude`. You get **Install Claude Code** / **Set Path**.
- [ ] Logged out: you get "not signed in" with **Open Terminal**, which types `claude` without running it.
  - Check without logging out: the unit tests use the CLI's real logged-out output, `Not logged in · Please run /login`.
- [ ] Set `commitwise.timeoutSeconds` to 5 and `commitwise.model` to `opus` on a big diff. You get the timeout message with **Increase Timeout**.
- [ ] Set `commitwise.model` to a bogus name. The CLI's own error text appears, with **Show Log**.

## 4. Guidelines
- [ ] Run "Create Commit Guidelines File". `COMMIT_GUIDELINES.md` opens with the Format / Allowed types / Rules / Examples sections.
- [ ] Add "Every subject must start with an emoji" to it, then generate. The emoji appears.
- [ ] Set `pattern: '^XYZ '`. Generate: Output › Commitwise logs a retry, then a warning appears.

## 5. Style & context
- [ ] Delete the guidelines and generate in a repo with a distinctive history. The message matches that history.
- [ ] On branch `feature/ABC-123-x`, the message includes `ABC-123`. On `main`, no ticket ID is invented.
- [ ] "Generate Guidelines from Commit History" opens a draft. Edit it, then **Save**. The saved file has your edits.

## 6. Safety & choice
- [ ] Add `const k = "AKIA` + `IOSFODNN7EXAMPLE"` (joined) to a file. The modal lists `file:line` with the value masked.
  - **Cancel**: nothing is sent (Output › Commitwise shows no "Running claude").
- [ ] "Generate Commit Message Options…" shows N options. Picking one fills the box.

## 7. Splitting
- [ ] Make 30+ mixed changes. The plan groups related files, and "Commit N groups" creates N commits.
- [ ] In review: edit a message, move a file to another or new commit, and drop a commit. The result matches your edits, and dropped files stay uncommitted.
- [ ] Add a failing `.git/hooks/pre-commit`. The split stops at that commit, the error says how many commits were made, and no changes are lost.

## 8. Packaging
- [ ] `npm run vsix`, then install the `.vsix` in a clean VS Code profile and in Cursor. ✨ works in both.
