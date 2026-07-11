import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createAdminClient } from '../lib/client.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getGateInputSchema = { gateId: z.string() };

/**
 * Register the `get_gate` tool — fetch a single gate by id.
 *
 * Returns the full gate config (model, fallbacks, taskType, spending
 * limits, sub-gates, orchestration) as a JSON text content block.
 * API failures surface as `isError: true` per SEP-1303 so the calling
 * model can self-correct.
 */
export function registerGetGate(server: McpServer): void {
  // Cast through `unknown` works around an SDK type-inference issue
  // (TS2589 "Type instantiation is excessively deep") that triggers
  // when a non-empty `inputSchema` is combined with the SDK's union
  // Zod-v3-or-v4 schema typing. The runtime call is correct; only
  // the static type inference is overdeep.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'get_gate',
    {
      title: 'Get Verlon Gate',
      description:
        'Fetch the full configuration of a specific Verlon AI gate by its UUID. ' +
        'Returns model, fallback chain, task type, spending limits, sub-gates, ' +
        'and orchestration settings as JSON. Read-only.',
      inputSchema: getGateInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ gateId }: { gateId: string }) => {
      if (!UUID_RE.test(gateId)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Invalid gateId: "${gateId}" is not a UUID. Pass the gate's UUID (e.g. "11111111-1111-1111-1111-111111111111").`,
            },
          ],
        };
      }
      try {
        const admin = createAdminClient();
        const gate = await admin.gates.get(gateId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(gate, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to get gate ${gateId}: ${message}`,
            },
          ],
        };
      }
    }
  );
}
