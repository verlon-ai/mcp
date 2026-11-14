import { VerlonAdmin } from '@verlon-ai/admin';

const DEFAULT_BASE_URL = 'https://api.verlon.ai';

/**
 * Thrown when MCP tool handlers can't construct the admin client because
 * required auth env vars are missing. Distinct from generic Errors so the
 * tool handler can surface a targeted `isError` result with the recovery
 * hint (which env var to set in the MCP client config).
 */
export class MissingAuthError extends Error {
  constructor() {
    super(
      'VERLON_API_KEY is required. Set it under `env` in your MCP client config — ' +
        'see https://docs.verlon.ai for the Claude Code / Cursor install snippets.'
    );
    this.name = 'MissingAuthError';
  }
}

/**
 * Build a `VerlonAdmin` client from the process environment. Mirrors
 * the CLI's `getVerlonClient` precedence rules but skips the saved-profile
 * fallback — MCP servers run as a spawned subprocess and only see env
 * vars passed in by the MCP client config (e.g. Claude Code's
 * `mcpServers.*.env`), so there's no human-interactive `verlon login`
 * profile to fall back on.
 */
export function createAdminClient(): VerlonAdmin {
  const apiKey = process.env.VERLON_API_KEY;
  if (!apiKey) {
    throw new MissingAuthError();
  }
  const baseUrl = process.env.VERLON_BASE_URL || DEFAULT_BASE_URL;
  return new VerlonAdmin({ apiKey, baseUrl });
}

/**
 * How a tool gets its client for one call. The default reads the process
 * environment (one key per server process: the npm `verlon-mcp` binary).
 * A host serving many people, like Verlon's own MCP gateway, passes a
 * factory that builds the client for the person behind each call, from
 * that call's request (`extra.requestInfo`).
 */
export type ClientFor = (extra: unknown) => VerlonAdmin;

export const envClient: ClientFor = () => createAdminClient();

/** The API base URL the public, keyless tools (`list_models`) read. */
export function envBaseUrl(): string {
  return process.env.VERLON_BASE_URL || DEFAULT_BASE_URL;
}
