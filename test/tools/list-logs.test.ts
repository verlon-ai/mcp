import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListLogs } from '../../src/tools/list-logs.js';

const { logsList } = vi.hoisted(() => ({ logsList: vi.fn() }));

vi.mock('@verlon-ai/admin', () => ({
  VerlonAdmin: class MockVerlonAdmin {
    logs = { list: logsList };
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
  handler: (
    args: Record<string, unknown>,
    extra: unknown
  ) => Promise<ToolResult>;
}

function getRegisteredListLogs(): RegisteredTool {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerListLogs(server);
  const registered = (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools;
  const tool = registered['list_logs'];
  if (!tool) throw new Error('list_logs not registered');
  return tool;
}

describe('list_logs tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERLON_API_KEY = 'sk-vrln-test';
  });

  it('returns logs as JSON with count and limit', async () => {
    logsList.mockResolvedValue([
      {
        id: 'r1',
        gate: 'g1',
        model: 'claude-haiku-4-5',
        cost: 0.001,
        success: true,
      },
      {
        id: 'r2',
        gate: 'g1',
        model: 'claude-haiku-4-5',
        cost: 0.002,
        success: true,
      },
    ]);
    const tool = getRegisteredListLogs();
    const result = await tool.handler({ gate: 'g1', limit: 50 }, {});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.limit).toBe(50);
    expect(parsed.logs[0].id).toBe('r1');
    // Verify the limit was forwarded to admin
    expect(logsList).toHaveBeenCalledWith(
      expect.objectContaining({ gate: 'g1', limit: 50 })
    );
  });

  it('applies default limit of 20 when not specified', async () => {
    logsList.mockResolvedValue([]);
    const tool = getRegisteredListLogs();
    await tool.handler({}, {});
    expect(logsList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 })
    );
  });

  it('returns isError when the admin client rejects', async () => {
    logsList.mockRejectedValue(new Error('Unauthorized'));
    const tool = getRegisteredListLogs();
    const result = await tool.handler({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to list logs');
    expect(result.content[0].text).toContain('Unauthorized');
  });

  it('advertises required metadata for MCP Registry', () => {
    const tool = getRegisteredListLogs();
    expect(tool.title).toBe('List Verlon Request Logs');
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });
});
