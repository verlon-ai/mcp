import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createAdminClient } from '../lib/client.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const listLogsInputSchema = {
  gate: z.string().optional(),
  since: z.string().optional(),
  success: z.boolean().optional(),
  limit: z.number().int().positive().max(MAX_LIMIT).optional(),
};

/**
 * Register the `list_logs` tool — fetch recent request logs.
 *
 * Optional filters: `gate` (UUID or name), `since` (ISO 8601), `success`
 * (true/false), `limit` (1..100, default 20). Returns log rows as JSON.
 * Read-only.
 */
export function registerListLogs(server: McpServer): void {
  // See get-gate.ts for why this is cast — TS2589 workaround for the
  // SDK's deep generic inference around non-empty inputSchema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'list_logs',
    {
      title: 'List Verlon Request Logs',
      description:
        'List recent request logs across the authenticated account. Returns ' +
        'timestamp, gate, model, cost, latency, success/failure, and request id ' +
        'for each log row. Optional filters: gate (UUID or name), since (ISO 8601), ' +
        'success (true/false), limit (1-100, default 20). Read-only.',
      inputSchema: listLogsInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args: {
      gate?: string;
      since?: string;
      success?: boolean;
      limit?: number;
    }) => {
      const { gate, since, success, limit } = args;
      const effectiveLimit = limit ?? DEFAULT_LIMIT;
      try {
        const admin = createAdminClient();
        const logs = await admin.logs.list({
          gate,
          since,
          success,
          limit: effectiveLimit,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { count: logs.length, limit: effectiveLimit, logs },
                null,
                2
              ),
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
              text: `Failed to list logs: ${message}`,
            },
          ],
        };
      }
    }
  );
}
