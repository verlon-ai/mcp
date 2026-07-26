import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../../src/server.js';
import { registerSwitchModel } from '../../src/tools/switch-model.js';

const { gatesGet, gatesList, gatesUpdate } = vi.hoisted(() => ({
  gatesGet: vi.fn(),
  gatesList: vi.fn(),
  gatesUpdate: vi.fn(),
}));

vi.mock('@verlon-ai/admin', () => ({
  VerlonAdmin: class MockVerlonAdmin {
    gates = { get: gatesGet, list: gatesList, update: gatesUpdate };
  },
}));

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface RegisteredTool {
  annotations?: { readOnlyHint?: boolean };
  handler: (
    args: { model: string; gateId?: string },
    extra: unknown
  ) => Promise<ToolResult>;
}

function registeredTools(server: McpServer): Record<string, RegisteredTool> {
  return (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools;
}

function getSwitchModel(): RegisteredTool {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerSwitchModel(server);
  const tool = registeredTools(server)['switch_model'];
  if (!tool) throw new Error('switch_model not registered');
  return tool;
}

const GATE = '22222222-2222-2222-2222-222222222222';

describe('switch_model tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERLON_API_KEY = 'sk-vrln-test';
  });

  it('is gated behind enableWrites', () => {
    const readOnly = registeredTools(createServer());
    expect(readOnly['switch_model']).toBeUndefined();
    const writable = registeredTools(createServer({ enableWrites: true }));
    expect(writable['switch_model']).toBeDefined();
  });

  it('switches an explicit gate and reports old → new', async () => {
    gatesGet.mockResolvedValue({ id: GATE, name: 'CC', model: 'old-model' });
    gatesUpdate.mockResolvedValue({ id: GATE, name: 'CC', model: 'new-model' });

    const result = await getSwitchModel().handler(
      { model: 'new-model', gateId: GATE },
      {}
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('old-model → new-model');
    expect(gatesUpdate).toHaveBeenCalledWith(GATE, { model: 'new-model' });
  });

  it('resolves the single claude-code connector gate when gateId is omitted', async () => {
    gatesList.mockResolvedValue([
      { id: 'aaa', name: 'plain', connector: null },
      { id: GATE, name: 'CC', connector: 'claude-code', model: 'old-model' },
    ]);
    gatesGet.mockResolvedValue({ id: GATE, name: 'CC', model: 'old-model' });
    gatesUpdate.mockResolvedValue({ id: GATE, name: 'CC', model: 'new-model' });

    const result = await getSwitchModel().handler({ model: 'new-model' }, {});

    expect(result.isError).toBeFalsy();
    expect(gatesUpdate).toHaveBeenCalledWith(GATE, { model: 'new-model' });
  });

  it('errors with a listing when multiple connector gates exist', async () => {
    gatesList.mockResolvedValue([
      { id: 'g1', name: 'one', connector: 'claude-code', model: 'm1' },
      { id: 'g2', name: 'two', connector: 'claude-code', model: 'm2' },
    ]);

    const result = await getSwitchModel().handler({ model: 'x' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('g1');
    expect(result.content[0].text).toContain('g2');
    expect(gatesUpdate).not.toHaveBeenCalled();
  });

  it('no-ops when the gate already routes to the model', async () => {
    gatesGet.mockResolvedValue({ id: GATE, name: 'CC', model: 'same' });

    const result = await getSwitchModel().handler(
      { model: 'same', gateId: GATE },
      {}
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('nothing changed');
    expect(gatesUpdate).not.toHaveBeenCalled();
  });

  it('surfaces unsupported-model errors with a list_models hint', async () => {
    gatesGet.mockResolvedValue({ id: GATE, name: 'CC', model: 'old' });
    gatesUpdate.mockRejectedValue(new Error('Unsupported model: nope'));

    const result = await getSwitchModel().handler(
      { model: 'nope', gateId: GATE },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('list_models');
  });

  it('rejects a non-UUID gateId without calling the API', async () => {
    const result = await getSwitchModel().handler(
      { model: 'x', gateId: 'not-a-uuid' },
      {}
    );

    expect(result.isError).toBe(true);
    expect(gatesGet).not.toHaveBeenCalled();
  });
});
