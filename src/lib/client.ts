import { DEFAULT_BASE_URL, type VerlonCredentials } from './api.js';

/**
 * Thrown when MCP tool handlers have no credentials because
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
 * The credentials in the process environment. MCP servers run as a
 * spawned subprocess and only see env vars passed in by the MCP client
 * config (e.g. Claude Code's `mcpServers.*.env`), so there's no
 * `verlon login` profile to fall back on.
 */
export function envCredentials(): VerlonCredentials {
  const apiKey = process.env.VERLON_API_KEY;
  if (!apiKey) {
    throw new MissingAuthError();
  }
  return { apiKey, baseUrl: process.env.VERLON_BASE_URL || DEFAULT_BASE_URL };
}

/**
 * Whose credentials a tool call runs with. The default reads the process
 * environment (one key per server process: the npm `verlon-mcp` binary).
 * A host serving many people, like Verlon's own MCP gateway, passes a
 * function that returns the credentials of the person behind each call,
 * from that call's request (`extra.requestInfo`). A host needs no client
 * package: the tools make their own requests.
 */
export type ClientFor = (extra: unknown) => VerlonCredentials;

export const envClient: ClientFor = () => envCredentials();

/** The API base URL the public, keyless tools (`list_models`) read. */
export function envBaseUrl(): string {
  return process.env.VERLON_BASE_URL || DEFAULT_BASE_URL;
}
