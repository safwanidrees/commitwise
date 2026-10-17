#!/usr/bin/env node
// Stand-in for the `claude` CLI in integration tests. Never contacts any service.
// - Appends {args, stdin} as a JSON line to $FAKE_CLAUDE_LOG.
// - Replies with the next entry of the JSON array in $FAKE_CLAUDE_QUEUE:
//   { result?: string, structured?: any, isError?: boolean, exit?: number, sleepMs?: number }
const fs = require('fs');

// Setup checks (no stdin): `--version` and `auth status`.
const argv = process.argv.slice(2);
if (argv[0] === '--version') {
  process.stdout.write(`${process.env.FAKE_CLAUDE_VERSION || '2.1.296'} (Claude Code)\n`);
  process.exit(0);
}
if (argv[0] === 'auth' && argv[1] === 'status') {
  const loggedIn = process.env.FAKE_CLAUDE_LOGGED_OUT !== '1';
  process.stdout.write(JSON.stringify({ loggedIn, authMethod: loggedIn ? 'claude.ai' : 'none' }, null, 2) + '\n');
  process.exit(loggedIn ? 0 : 1);
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  if (process.env.FAKE_CLAUDE_LOG) {
    fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, stdin, cwd: process.cwd() }) + '\n');
  }
  let next = { result: 'chore: fake default message' };
  const q = process.env.FAKE_CLAUDE_QUEUE;
  if (q && fs.existsSync(q)) {
    const queue = JSON.parse(fs.readFileSync(q, 'utf8'));
    if (queue.length > 0) {
      next = queue.shift();
      fs.writeFileSync(q, JSON.stringify(queue));
    }
  }
  const reply = () => {
    const out = {
      type: 'result',
      subtype: 'success',
      is_error: !!next.isError,
      api_error_status: next.apiStatus ?? null,
      result: next.result ?? '',
    };
    if (next.structured !== undefined) {
      out.structured_output = next.structured;
    }
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(next.exit ?? (next.isError ? 1 : 0));
  };
  setTimeout(reply, next.sleepMs ?? 0);
});
