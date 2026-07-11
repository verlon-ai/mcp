import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListExperiments } from '../../src/tools/list-experiments.js';

const { experimentsList } = vi.hoisted(() => ({ experimentsList: vi.fn() }));

vi.mock('@verlon-ai/admin', () => ({
  VerlonAdmin: class MockVerlonAdmin {
    experiments = { list: experimentsList };
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

function getRegisteredListExperiments(): RegisteredTool {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerListExperiments(server);
  const registered = (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools;
  const tool = registered['list_experiments'];
  if (!tool) throw new Error('list_experiments not registered');
  return tool;
}

describe('list_experiments tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERLON_API_KEY = 'sk-vrln-test';
  });

  it('returns experiments as JSON with count', async () => {
    experimentsList.mockResolvedValue([
      { id: 'e1', name: 'test1', status: 'running' },
      { id: 'e2', name: 'test2', status: 'completed' },
    ]);
    const tool = getRegisteredListExperiments();
    const result = await tool.handler({}, {});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.experiments[0].id).toBe('e1');
  });

  it('forwards gateId/status/projectId filters to admin.experiments.list', async () => {
    experimentsList.mockResolvedValue([]);
    const tool = getRegisteredListExperiments();
    await tool.handler(
      { gateId: 'g1', status: 'running', projectId: 'p1' },
      {}
    );
    expect(experimentsList).toHaveBeenCalledWith({
      gateId: 'g1',
      status: 'running',
      projectId: 'p1',
    });
  });

  it('returns isError when the admin client rejects', async () => {
    experimentsList.mockRejectedValue(new Error('Internal error'));
    const tool = getRegisteredListExperiments();
    const result = await tool.handler({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to list experiments');
    expect(result.content[0].text).toContain('Internal error');
  });

  it('advertises required metadata for MCP Registry', () => {
    const tool = getRegisteredListExperiments();
    expect(tool.title).toBe('List Verlon Experiments');
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });
});
