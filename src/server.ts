import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerListGates } from './tools/list-gates.js';
import { registerGetGate } from './tools/get-gate.js';
import { registerListLogs } from './tools/list-logs.js';
import { registerGetRecommendations } from './tools/get-recommendations.js';
import { registerListExperiments } from './tools/list-experiments.js';
import { registerListModels } from './tools/list-models.js';
import { registerSwitchModel } from './tools/switch-model.js';

export const VERLON_MCP_VERSION = '0.4.0';

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

export function createServer(opts: ServerOptions = {}): McpServer {
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
  registerListModels(server);

  // Write tools — explicit opt-in only. switch_model is deliberately
  // the narrowest possible first write (one reversible field); the
  // broader create/update/delete surface stays in MCP Phase D.
  if (opts.enableWrites) {
    registerSwitchModel(server);
  }

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
