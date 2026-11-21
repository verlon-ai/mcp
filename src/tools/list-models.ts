import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { envBaseUrl } from '../lib/client.js';
import { ENDPOINT_TYPES } from '../lib/endpoints.js';


const listModelsInputSchema = {
  provider: z.string().optional(),
  type: z.enum(ENDPOINT_TYPES).optional(),
};

interface RegistryModel {
  type: string;
  provider: string;
  isAvailable?: boolean;
  deprecated?: boolean;
  pricing?: { input?: number; output?: number };
  benchmarks?: { intelligence?: number; coding?: number };
}

/**
 * Register the `list_models` tool — the models Verlon serves, of one
 * type (chat by default), from the live registry (public endpoint, no
 * auth). The calling model uses it to name a valid id for
 * `create_endpoint` or `switch_model`.
 */
export function registerListModels(
  server: McpServer,
  baseUrlFor: () => string = envBaseUrl
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'list_models',
    {
      title: 'List Routable Models',
      description:
        'List the models Verlon serves, with live pricing (USD per 1M ' +
        'tokens) and capability scores. Chat models unless type names ' +
        'another (embeddings, image, …). Optionally filter by provider ' +
        '(openai, anthropic, google, mistral). Read-only.',
      inputSchema: listModelsInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({
      provider,
      type = 'chat',
    }: {
      provider?: string;
      type?: string;
    }) => {
      const baseUrl = baseUrlFor().replace(/\/+$/, '');
      try {
        const res = await fetch(`${baseUrl}/v1/registry`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as {
          models?: Record<string, RegistryModel>;
        };
        const filter = provider?.toLowerCase();
        const models = Object.entries(payload.models ?? {})
          .filter(
            ([, m]) =>
              m.type === type &&
              m.isAvailable !== false &&
              m.deprecated !== true &&
              (!filter || m.provider?.toLowerCase() === filter)
          )
          .map(([id, m]) => ({
            id,
            provider: m.provider,
            inputPerM: m.pricing?.input ?? null,
            outputPerM: m.pricing?.output ?? null,
            intelligence: m.benchmarks?.intelligence ?? null,
            coding: m.benchmarks?.coding ?? null,
          }))
          .sort(
            (a, b) =>
              a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id)
          );
        return {
          content: [{ type: 'text', text: JSON.stringify(models, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to load the model registry from ${baseUrl}: ${message}`,
            },
          ],
        };
      }
    }
  );
}
