import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createAdminClient } from '../lib/client.js';

/**
 * Register the `list_gates` tool — the Phase 1 read-only entry point.
 *
 * Returns each gate's summary fields (id, name, description, model,
 * taskType, createdAt) as a JSON text content block. Per MCP spec
 * (SEP-1303), API failures surface as `isError: true` text content so
 * the calling model can self-correct, not as protocol-level errors.
 */
export function registerListGates(server: McpServer): void {
  server.registerTool(
    'list_gates',
    {
      title: 'List Verlon Gates',
      description:
        "List all gates in the authenticated Verlon AI account. Each gate's summary " +
        '(id, name, description, primary model, task type, creation date) is returned ' +
        'as JSON. Read-only.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const admin = createAdminClient();
        const gates = await admin.gates.list();

        const summary = gates.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description ?? null,
          model: g.model,
          taskType: g.taskType,
          taskSubtype: g.taskSubtype ?? null,
          createdAt:
            g.createdAt instanceof Date
              ? g.createdAt.toISOString()
              : g.createdAt,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { count: summary.length, gates: summary },
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
              text: `Failed to list gates: ${message}`,
            },
          ],
        };
      }
    }
  );
}
