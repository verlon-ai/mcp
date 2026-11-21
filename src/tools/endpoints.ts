import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { VerlonApi, VerlonApiError } from '../lib/api.js';
import { envClient, type ClientFor } from '../lib/client.js';
import {
  ENDPOINT_TYPES,
  EndpointError,
  createEndpoint,
  getEndpoint,
  listEndpoints,
} from '../lib/endpoints.js';

function json(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** A failure the calling model can act on: the API's message, and its
 * suggested name when it gave one. */
function failure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const details =
    err instanceof VerlonApiError || err instanceof EndpointError
      ? err.details
      : undefined;
  const suggestion =
    typeof details?.suggestion === 'string' ? details.suggestion : null;
  const text =
    suggestion && !message.includes(suggestion)
      ? `${message} Suggested name: ${suggestion}`
      : message;
  return { isError: true, content: [{ type: 'text', text }] };
}

/** `list_endpoints` and `get_endpoint`: read-only. */
export function registerEndpointReads(
  server: McpServer,
  client: ClientFor = envClient
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'list_endpoints',
    {
      title: 'List Verlon Endpoints',
      description:
        'List the account’s endpoints: the named model setups its code ' +
        'calls. Each has a name, what it does, a type (chat, embeddings, …) ' +
        'and a model. Optionally only one project’s. Read-only.',
      inputSchema: { projectId: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ projectId }: { projectId?: string }, extra: unknown) => {
      try {
        const api = new VerlonApi(client(extra));
        return json({ endpoints: await listEndpoints(api, projectId) });
      } catch (err) {
        return failure(err);
      }
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'get_endpoint',
    {
      title: 'Get Verlon Endpoint',
      description:
        'Fetch one endpoint by its name: what it does, its type and its ' +
        'model. Read-only.',
      inputSchema: { name: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ name }: { name: string }, extra: unknown) => {
      try {
        const api = new VerlonApi(client(extra));
        return json(await getEndpoint(api, name));
      } catch (err) {
        return failure(err);
      }
    }
  );
}

/** `create_endpoint`: a write, registered with the other write tools. */
export function registerCreateEndpoint(
  server: McpServer,
  client: ClientFor = envClient
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'create_endpoint',
    {
      title: 'Create Verlon Endpoint',
      description:
        'Create an endpoint: a named model setup the code calls instead of ' +
        'a model id. Name it for its job (lowercase letters, digits and ' +
        'hyphens, e.g. "support-summarizer"). The type defaults to the ' +
        'model’s own type; call list_models for model ids. Calling it again ' +
        'with the same name, model and type returns the endpoint it made ' +
        '(existing: true). A taken or invalid name is refused with a ' +
        'suggested name to retry with.',
      inputSchema: {
        name: z.string(),
        model: z.string(),
        type: z.enum(ENDPOINT_TYPES).optional(),
        description: z
          .string()
          .optional()
          .describe('What the endpoint does, in one sentence'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (
      args: {
        name: string;
        model: string;
        type?: string;
        description?: string;
      },
      extra: unknown
    ) => {
      try {
        const api = new VerlonApi(client(extra));
        return json(await createEndpoint(api, args));
      } catch (err) {
        return failure(err);
      }
    }
  );
}
