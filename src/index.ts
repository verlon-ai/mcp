/**
 * The library entry: build the Verlon MCP server to host it yourself.
 * The `verlon-mcp` binary (`src/bin.ts`) runs it over stdio.
 *
 * A host passes `client`: the credentials each call runs with.
 */
export {
  createServer,
  runStdio,
  VERLON_MCP_VERSION,
  type ServerOptions,
} from './server.js';
export { type ClientFor, MissingAuthError } from './lib/client.js';
export { VerlonApiError, type VerlonCredentials } from './lib/api.js';
