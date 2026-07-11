import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createAdminClient } from '../lib/client.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getRecommendationsInputSchema = { gateId: z.string() };

/**
 * Register the `get_recommendations` tool — Cortex's intelligence
 * report for a specific gate.
 *
 * Returns themes, drift detection, and actionable optimization
 * recommendations as JSON. The report field is null when Cortex has
 * not produced a run for the gate yet (e.g. brand-new gate with no
 * traffic).
 */
export function registerGetRecommendations(server: McpServer): void {
  // See get-gate.ts for why this is cast — TS2589 workaround.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'get_recommendations',
    {
      title: 'Get Verlon Gate Recommendations',
      description:
        "Fetch Cortex's intelligence report for a specific Verlon AI gate: " +
        'themes observed in recent sessions, drift detection, and actionable ' +
        'optimization recommendations. Returns `{ report: null }` when no run ' +
        'has been produced yet (typically a brand-new gate with no traffic). ' +
        'Read-only.',
      inputSchema: getRecommendationsInputSchema,
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
              text: `Invalid gateId: "${gateId}" is not a UUID. Pass the gate's UUID.`,
            },
          ],
        };
      }
      try {
        const admin = createAdminClient();
        const report = await admin.recommendations.forGate(gateId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report, null, 2),
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
              text: `Failed to get recommendations for gate ${gateId}: ${message}`,
            },
          ],
        };
      }
    }
  );
}
