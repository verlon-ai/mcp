#!/usr/bin/env node
import { runStdio } from './server.js';

function parseArgs(argv: string[]): { enableWrites: boolean; help: boolean } {
  return {
    enableWrites: argv.includes('--enable-writes'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printHelp(): void {
  process.stderr.write(
    `@verlon-ai/mcp — Model Context Protocol server for Verlon AI

Usage:
  verlon-mcp [--enable-writes]

Flags:
  --enable-writes   Register write-capable tools (create/update/delete gates,
                    run chat, start experiment). Omit for read-only operation
                    (the safe default; a misaligned agent can't destroy
                    resources). Phase 3+ feature; ignored in 0.1.x.
  --help, -h        Show this message.

Environment:
  VERLON_API_KEY    Required. The API key the server authenticates with.
  VERLON_BASE_URL   Optional. Defaults to https://api.verlon.ai. Use to
                    target a self-hosted Verlon instance.

This server speaks the Model Context Protocol over stdio. It is intended to
be spawned as a subprocess by an MCP client (Claude Code, Cursor, Cline,
etc.). See https://docs.verlon.ai for install snippets.
`
  );
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

runStdio({ enableWrites: args.enableWrites }).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fatal: ${message}\n`);
  process.exit(1);
});
