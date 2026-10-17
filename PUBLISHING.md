# Publishing Commitwise

You do the one-time setup. After that, every release is `git tag vX.Y.Z && git push --tags`, and GitHub Actions tests and publishes to both stores.

## One-time setup (about 15 minutes)

### 1. VS Code Marketplace publisher `safwanmamji`
1. Go to <https://marketplace.visualstudio.com/manage> and sign in with a Microsoft account.
2. **Create publisher**: ID `safwanmamji` (it must match `"publisher"` in package.json), with any display name.
3. Create a Personal Access Token at <https://dev.azure.com>: User settings → Personal access tokens → New token.
   - Organization: **All accessible organizations**
   - Scopes: **Custom defined → Marketplace → Manage**
4. Copy the token. You'll use it as `VSCE_PAT`.

### 2. Open VSX namespace (Cursor, Windsurf, VSCodium)
1. Sign in at <https://open-vsx.org> with GitHub, then link an Eclipse account and sign the Publisher Agreement (profile page).
2. Settings → **Access Tokens** → generate one. You'll use it as `OVSX_PAT`.
3. Create the namespace once: `npx ovsx create-namespace safwanmamji -p <OVSX_PAT>`

### 3. Add both tokens to the GitHub repo
`gh secret set VSCE_PAT -R safwanidrees/commitwise` and `gh secret set OVSX_PAT -R safwanidrees/commitwise`. Each command asks you to paste the token.

## Releasing

1. Update `"version"` in package.json and add a CHANGELOG entry.
2. Commit, then `git tag v0.3.0 && git push && git push --tags` (use the new version).
3. The **Release** workflow runs the tests, publishes to the Marketplace and Open VSX, and attaches the `.vsix` to a GitHub release.

Within a few minutes the extension appears under **Extensions → search "Commitwise"** in VS Code, Cursor and Windsurf.

## Publishing by hand (alternative)

```sh
npm run vsix
npx @vscode/vsce publish --packagePath commitwise-0.3.0.vsix -p <VSCE_PAT>
npx ovsx publish commitwise-0.3.0.vsix -p <OVSX_PAT>
```

## Before each release

- `npm test`, `npm run test:min` and `npm run test:cursor` all pass.
- `COMMITWISE_REAL_CLAUDE=1 npm run test:integration` passes (real CLI smoke tests).
- Click ✨ once in a real repo using the freshly built `.vsix`.
