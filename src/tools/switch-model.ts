import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createAdminClient } from '../lib/client.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const switchModelInputSchema = {
  model: z.string(),
  gateId: z.string().optional(),
};

interface ConnectorGate {
  id: string;
  name: string;
  model?: string | null;
  connector?: string | null;
}

/**
 * Register the `switch_model` tool — hot-swap which model a coding
 * gate routes to. The gate is resolved server-side per request, so a
 * running Claude Code session picks the new model up on its next turn
 * with no restart.
 *
 * This is the first write tool (gated behind `--enable-writes`), and
 * deliberately the narrowest one: it changes a single field the user
 * can flip back from the dashboard in one click. The deterministic
 * paths (`verlon switch`, the dashboard) remain primary; this exists
 * so "switch my model to gpt-4o" works conversationally.
 */
export function registerSwitchModel(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'switch_model',
    {
      title: 'Switch Gate Model',
      description:
        'Switch which model a Verlon coding gate routes to. Takes effect on ' +
        'the NEXT turn of any running session — no restart. If gateId is ' +
        'omitted, the account’s Claude Code connector gate is used. Use ' +
        'list_models for valid model ids.',
      inputSchema: switchModelInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ model, gateId }: { model: string; gateId?: string }) => {
      if (gateId && !UUID_RE.test(gateId)) {
        return errorResult(
          `Invalid gateId: "${gateId}" is not a UUID. Omit it to use your Claude Code connector gate.`
        );
      }
      try {
        const admin = createAdminClient();

        let targetId = gateId;
        if (!targetId) {
          const gates = (await admin.gates.list()) as ConnectorGate[];
          const connectors = gates.filter(
            (g) => g.connector === 'claude-code'
          );
          if (connectors.length === 0) {
            return errorResult(
              'No Claude Code connector gate found on this account. Run `verlon connect claude-code` first, or pass gateId explicitly.'
            );
          }
          if (connectors.length > 1) {
            const listing = connectors
              .map((g) => `- ${g.name} (${g.id}) → ${g.model ?? 'unset'}`)
              .join('\n');
            return errorResult(
              `Multiple Claude Code gates found — call again with the gateId of the one to switch:\n${listing}`
            );
          }
          targetId = connectors[0].id;
        }

        const before = (await admin.gates.get(targetId)) as ConnectorGate;
        if (before.model === model) {
          return textResult(
            `Gate "${before.name}" already routes to ${model} — nothing changed.`
          );
        }
        const after = (await admin.gates.update(targetId, {
          model,
        } as never)) as ConnectorGate;
        return textResult(
          `Switched gate "${after.name}" (${targetId}): ${before.model} → ${after.model}. ` +
            'Takes effect on the next turn of any running session — no restart needed.'
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/unsupported model/i.test(message)) {
          return errorResult(
            `${message}. Call list_models for the valid model ids.`
          );
        }
        return errorResult(`Failed to switch model: ${message}`);
      }
    }
  );
}

function textResult(text: string) {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text: string) {
  return { isError: true, content: [{ type: 'text', text }] };
}
