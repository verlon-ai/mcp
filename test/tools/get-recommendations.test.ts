import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetRecommendations } from '../../src/tools/get-recommendations.js';

const { recsForGate } = vi.hoisted(() => ({ recsForGate: vi.fn() }));

vi.mock('@verlon-ai/admin', () => ({
  VerlonAdmin: class MockVerlonAdmin {
    recommendations = { forGate: recsForGate };
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

function getRegisteredGetRecommendations(): RegisteredTool {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerGetRecommendations(server);
  const registered = (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools;
  const tool = registered['get_recommendations'];
  if (!tool) throw new Error('get_recommendations not registered');
  return tool;
}

describe('get_recommendations tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERLON_API_KEY = 'sk-vrln-test';
  });

  it('returns the report as JSON when Cortex has produced one', async () => {
    recsForGate.mockResolvedValue({
      report: { themes: ['classification accuracy'], drift: 'none' },
    });
    const tool = getRegisteredGetRecommendations();
    const result = await tool.handler(
      { gateId: '11111111-1111-1111-1111-111111111111' },
      {}
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.report.themes).toContain('classification accuracy');
  });

  it('passes through null report for brand-new gates', async () => {
    recsForGate.mockResolvedValue({ report: null });
    const tool = getRegisteredGetRecommendations();
    const result = await tool.handler(
      { gateId: '11111111-1111-1111-1111-111111111111' },
      {}
    );
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.report).toBeNull();
  });

  it('rejects non-UUID gateIds before hitting the API', async () => {
    const tool = getRegisteredGetRecommendations();
    const result = await tool.handler({ gateId: 'not-a-uuid' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid gateId');
    expect(recsForGate).not.toHaveBeenCalled();
  });

  it('returns isError when the admin client rejects', async () => {
    recsForGate.mockRejectedValue(new Error('Forbidden'));
    const tool = getRegisteredGetRecommendations();
    const result = await tool.handler(
      { gateId: '11111111-1111-1111-1111-111111111111' },
      {}
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to get recommendations');
    expect(result.content[0].text).toContain('Forbidden');
  });

  it('advertises required metadata for MCP Registry', () => {
    const tool = getRegisteredGetRecommendations();
    expect(tool.title).toBe('Get Verlon Gate Recommendations');
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });
});
