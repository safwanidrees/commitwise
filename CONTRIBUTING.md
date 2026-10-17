# Contributing

```sh
npm install
npm run compile          # typecheck + lint + bundle
npm run test:unit
npm test                 # unit + integration (fake claude; downloads VS Code into .vscode-test/)
npm run test:min         # integration against VS Code 1.85.0
npm run test:cursor      # integration inside Cursor (macOS path)
COMMITWISE_REAL_CLAUDE=1 npm run test:integration   # adds smoke tests against your real claude CLI
npm run vsix             # build the .vsix
```

Press **F5** to launch an Extension Development Host. The manual checklist is in `TESTING.md`.

New-user test (no Claude Code installed), macOS/Linux:

```sh
mkdir -p /tmp/cw-node /tmp/cw-home && ln -sf "$(readlink -f "$(which node)")" /tmp/cw-node/node
npm run compile-tests && node esbuild.mjs
COMMITWISE_NO_CLI=1 HOME=/tmp/cw-home PATH=/usr/bin:/bin:/tmp/cw-node node out/test/integration/runTest.js
```

Releases: see `PUBLISHING.md`.
