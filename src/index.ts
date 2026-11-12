/**
 * The library entry: build the Verlon MCP server to host it yourself.
 * The `verlon-mcp` binary (`src/bin.ts`) runs it over stdio.
 *
 * `VerlonAdmin` is the admin client class these tools use, re-exported so
 * a host's `client` factory builds exactly this one (two copies of the
 * package are different classes to TypeScript).
 */
export {
  createServer,
  runStdio,
  VERLON_MCP_VERSION,
  type ServerOptions,
} from './server.js';
export { type ClientFor, MissingAuthError } from './lib/client.js';
export { VerlonAdmin } from '@verlon-ai/admin';
