import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListGates } from '../../src/tools/list-gates.js';

const { gatesList } = vi.hoisted(() => ({
  gatesList: vi.fn(),
}));

vi.mock('@verlon-ai/admin', () => ({
  VerlonAdmin: class MockVerlonAdmin {
    gates = { list: gatesList };
  },
}));

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface RegisteredTool {
  title?: string;
  description?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  handler: (args: unknown, extra: unknown) => Promise<ToolResult>;
}

function getRegisteredListGates(): RegisteredTool {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerListGates(server);

  // McpServer.registerTool exposes the registered tool via the server's
  // internal `_registeredTools` map. The SDK doesn't have a stable "call
  // this tool by name" method outside a transport, so we reach in
  // directly.
  const registered = (
    server as unknown as {
      _registeredTools: Record<string, RegisteredTool>;
    }
  )._registeredTools;
  const tool = registered['list_gates'];
  if (!tool) throw new Error('list_gates not registered');
  return tool;
}

function createServerWithListGates(): {
  invokeListGates: () => Promise<ToolResult>;
} {
  const tool = getRegisteredListGates();
  return { invokeListGates: () => tool.handler({}, {}) };
}

describe('list_gates tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERLON_API_KEY = 'sk-vrln-test';
    delete process.env.VERLON_BASE_URL;
  });

  it('returns JSON content with gate summaries on success', async () => {
    gatesList.mockResolvedValue([
      {
        id: 'g1',
        name: 'Support bot',
        description: 'Customer support',
        model: 'claude-sonnet-4-6',
        taskType: 'chat',
        taskSubtype: null,
        createdAt: new Date('2026-05-01T00:00:00Z'),
      },
      {
        id: 'g2',
        name: 'Code reviewer',
        description: null,
        model: 'claude-opus-4-7',
        taskType: 'chat',
        taskSubtype: 'reasoning',
        createdAt: new Date('2026-05-15T00:00:00Z'),
      },
    ]);

    const { invokeListGates } = createServerWithListGates();
    const result = await invokeListGates();

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.gates[0]).toMatchObject({
      id: 'g1',
      name: 'Support bot',
      description: 'Customer support',
      model: 'claude-sonnet-4-6',
      taskType: 'chat',
      taskSubtype: null,
      createdAt: '2026-05-01T00:00:00.000Z',
    });
    expect(parsed.gates[1]).toMatchObject({
      id: 'g2',
      description: null,
      taskSubtype: 'reasoning',
    });
  });

  it('returns isError with helpful message when VERLON_API_KEY is missing', async () => {
    delete process.env.VERLON_API_KEY;

    const { invokeListGates } = createServerWithListGates();
    const result = await invokeListGates();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('VERLON_API_KEY is required');
    expect(result.content[0].text).toContain('MCP client config');
  });

  it('surfaces underlying admin client errors as isError content', async () => {
    gatesList.mockRejectedValue(new Error('Unauthorized'));

    const { invokeListGates } = createServerWithListGates();
    const result = await invokeListGates();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Failed to list gates: Unauthorized');
  });

  it('handles empty gate list', async () => {
    gatesList.mockResolvedValue([]);

    const { invokeListGates } = createServerWithListGates();
    const result = await invokeListGates();

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(0);
    expect(parsed.gates).toEqual([]);
  });

  it('advertises required metadata for MCP Registry submission', () => {
    // Registry + Claude Directory both require tools to carry a title and
    // annotations (readOnlyHint / openWorldHint). Asserting on these
    // prevents a future SDK upgrade or refactor from silently stripping
    // them and breaking submission.
    const tool = getRegisteredListGates();
    expect(tool.title).toBe('List Verlon Gates');
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });
});
