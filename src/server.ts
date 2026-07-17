import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerListGates } from './tools/list-gates.js';
import { registerGetGate } from './tools/get-gate.js';
import { registerListLogs } from './tools/list-logs.js';
import { registerGetRecommendations } from './tools/get-recommendations.js';
import { registerListExperiments } from './tools/list-experiments.js';

export const VERLON_MCP_VERSION = '0.3.2';

export interface ServerOptions {
  /**
   * When true, register the write-capable tools (create/update/delete
   * gates, run chat, start experiment). Default false — read-only.
   * Wired through from the `--enable-writes` CLI flag.
   *
   * Phase 1: no write tools exist yet, so this flag is accepted but
   * doesn't gate anything. Write tools land in Phase 3.
   */
  enableWrites?: boolean;
}

export function createServer(_opts: ServerOptions = {}): McpServer {
  const server = new McpServer({
    name: 'verlon',
    version: VERLON_MCP_VERSION,
  });

  // Read tools (always registered).
  registerListGates(server);
  registerGetGate(server);
  registerListLogs(server);
  registerGetRecommendations(server);
  registerListExperiments(server);

  // Future: if (_opts.enableWrites) { registerCreateGate(server); ... }

  return server;
}

export async function runStdio(opts: ServerOptions = {}): Promise<void> {
  const server = createServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // CRITICAL: stdout is reserved for MCP protocol traffic on stdio
  // transport. All logging must go to stderr; otherwise the host
  // (Claude Code / Cursor) parses log lines as malformed protocol
  // messages and the server appears broken.
  process.stderr.write(
    `@verlon-ai/mcp ${VERLON_MCP_VERSION} listening on stdio` +
      (opts.enableWrites ? ' (writes enabled)' : ' (read-only)') +
      '\n'
  );
}
