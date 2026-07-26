import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const DEFAULT_BASE_URL = 'https://api.verlon.ai';

const listModelsInputSchema = {
  provider: z.string().optional(),
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
 * Register the `list_models` tool — the chat models a gate can route
 * to, from the live registry (public endpoint, no auth). Companion to
 * `switch_model`: the calling model uses this to name a valid id.
 */
export function registerListModels(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'list_models',
    {
      title: 'List Routable Models',
      description:
        'List the chat models a Verlon gate can route to, with live ' +
        'pricing (USD per 1M tokens) and capability scores. Optionally ' +
        'filter by provider (openai, anthropic, google, mistral). Read-only.',
      inputSchema: listModelsInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ provider }: { provider?: string }) => {
      const baseUrl = (
        process.env.VERLON_BASE_URL || DEFAULT_BASE_URL
      ).replace(/\/+$/, '');
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
              m.type === 'chat' &&
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
