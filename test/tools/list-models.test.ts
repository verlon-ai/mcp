import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListModels } from '../../src/tools/list-models.js';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface RegisteredTool {
  annotations?: { readOnlyHint?: boolean };
  handler: (
    args: { provider?: string },
    extra: unknown
  ) => Promise<ToolResult>;
}

function getListModels(): RegisteredTool {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerListModels(server);
  const tool = (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools['list_models'];
  if (!tool) throw new Error('list_models not registered');
  return tool;
}

const REGISTRY = {
  models: {
    'gpt-4o-mini': {
      type: 'chat',
      provider: 'openai',
      isAvailable: true,
      pricing: { input: 0.15, output: 0.6 },
      benchmarks: { intelligence: 18.9 },
    },
    'gemini-2.5-flash': {
      type: 'chat',
      provider: 'google',
      isAvailable: true,
      pricing: { input: 0.3, output: 2.5 },
    },
    'old-model': {
      type: 'chat',
      provider: 'openai',
      isAvailable: true,
      deprecated: true,
    },
    'dall-e-3': { type: 'image', provider: 'openai', isAvailable: true },
  },
};

describe('list_models tool', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => REGISTRY,
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists available, non-deprecated chat models with pricing', async () => {
    const result = await getListModels().handler({}, {});

    expect(result.isError).toBeFalsy();
    const models = JSON.parse(result.content[0].text) as Array<{
      id: string;
    }>;
    const ids = models.map((m) => m.id);
    expect(ids).toContain('gpt-4o-mini');
    expect(ids).toContain('gemini-2.5-flash');
    expect(ids).not.toContain('old-model');
    expect(ids).not.toContain('dall-e-3');
  });

  it('filters by provider', async () => {
    const result = await getListModels().handler({ provider: 'google' }, {});
    const models = JSON.parse(result.content[0].text) as Array<{
      id: string;
      provider: string;
    }>;
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('gemini-2.5-flash');
  });

  it('surfaces registry fetch failures as isError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );

    const result = await getListModels().handler({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('503');
  });
});
