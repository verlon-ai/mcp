import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetGate } from '../../src/tools/get-gate.js';

const { gatesGet } = vi.hoisted(() => ({ gatesGet: vi.fn() }));

vi.mock('@verlon-ai/admin', () => ({
  VerlonAdmin: class MockVerlonAdmin {
    gates = { get: gatesGet };
  },
}));

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface RegisteredTool {
  title?: string;
  annotations?: {
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
  };
  handler: (args: { gateId: string }, extra: unknown) => Promise<ToolResult>;
}

function getRegisteredGetGate(): RegisteredTool {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerGetGate(server);
  const registered = (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools;
  const tool = registered['get_gate'];
  if (!tool) throw new Error('get_gate not registered');
  return tool;
}

describe('get_gate tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERLON_API_KEY = 'sk-vrln-test';
  });

  it('returns the gate JSON on success', async () => {
    const gateId = '11111111-1111-1111-1111-111111111111';
    gatesGet.mockResolvedValue({
      id: gateId,
      name: 'Support bot',
      description: 'Customer support',
      model: 'claude-sonnet-4-6',
      taskType: 'chat',
    });

    const tool = getRegisteredGetGate();
    const result = await tool.handler({ gateId }, {});

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(gateId);
    expect(parsed.name).toBe('Support bot');
  });

  it('returns isError when the admin client rejects', async () => {
    gatesGet.mockRejectedValue(new Error('Not Found'));
    const tool = getRegisteredGetGate();
    const result = await tool.handler(
      { gateId: '22222222-2222-2222-2222-222222222222' },
      {}
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to get gate');
    expect(result.content[0].text).toContain('Not Found');
  });

  it('advertises required metadata for MCP Registry', () => {
    const tool = getRegisteredGetGate();
    expect(tool.title).toBe('Get Verlon Gate');
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });
});
