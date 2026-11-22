import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerListGates } from './tools/list-gates.js';
import { registerGetGate } from './tools/get-gate.js';
import { registerListLogs } from './tools/list-logs.js';
import { registerListModels } from './tools/list-models.js';
import { registerSwitchModel } from './tools/switch-model.js';
import {
  registerCreateEndpoint,
  registerEndpointReads,
} from './tools/endpoints.js';
import { envBaseUrl, envClient, type ClientFor } from './lib/client.js';

export const VERLON_MCP_VERSION = '0.8.0';

export interface ServerOptions {
  /**
   * When true, register the write tools (`switch_model`,
   * `create_endpoint`).
   * Default false — read-only. Wired through from the
   * `--enable-writes` CLI flag.
   */
  enableWrites?: boolean;
  /**
   * The credentials for one tool call. Default: from the process
   * environment (`VERLON_API_KEY`, `VERLON_BASE_URL`). A host serving
   * many people passes one built from each call's request.
   */
  client?: ClientFor;
  /** The API base URL for the keyless tools. Default: the environment. */
  baseUrl?: () => string;
}

export function createServer(opts: ServerOptions = {}): McpServer {
  const server = new McpServer({
    name: 'verlon',
    version: VERLON_MCP_VERSION,
  });

  // Read tools (always registered).
  const client = opts.client ?? envClient;
  registerEndpointReads(server, client);
  registerListGates(server, client);
  registerGetGate(server, client);
  registerListLogs(server, client);
  registerListModels(server, opts.baseUrl ?? envBaseUrl);

  // Write tools: explicit opt-in only. They create or change, never
  // delete: switch_model changes one reversible field, and
  // create_endpoint adds an endpoint (the same call again returns it).
  if (opts.enableWrites) {
    registerSwitchModel(server, client);
    registerCreateEndpoint(server, client);
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
