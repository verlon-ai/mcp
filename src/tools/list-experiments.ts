import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createAdminClient } from '../lib/client.js';

const listExperimentsInputSchema = {
  gateId: z.string().optional(),
  status: z.string().optional(),
  projectId: z.string().optional(),
};

/**
 * Register the `list_experiments` tool — enumerate experiments
 * (shadow + split) on the account, optionally filtered.
 *
 * Returns experiment id, name, status, variants, goal metric, and
 * configuration as JSON. Read-only.
 */
export function registerListExperiments(server: McpServer): void {
  // See get-gate.ts for why this is cast — TS2589 workaround.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'list_experiments',
    {
      title: 'List Verlon Experiments',
      description:
        'List experiments (shadow + split tests) in the authenticated Verlon AI ' +
        'account. Optional filters: `gateId` (restrict to one gate), `status` ' +
        '(e.g. `running`, `completed`, `draft`), `projectId`. Returns each ' +
        "experiment's id, name, status, test type, variants, goal metric, and " +
        'configuration as JSON. Read-only.',
      inputSchema: listExperimentsInputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args: { gateId?: string; status?: string; projectId?: string }) => {
      try {
        const admin = createAdminClient();
        const experiments = await admin.experiments.list(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { count: experiments.length, experiments },
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
              text: `Failed to list experiments: ${message}`,
            },
          ],
        };
      }
    }
  );
}
