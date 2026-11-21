import { describe, it, expect, vi } from 'vitest';
import { VerlonApiError, type Gate } from '../../src/lib/api.js';
import {
  EndpointError,
  createEndpoint,
  getEndpoint,
  isListedEndpoint,
  listEndpoints,
  type EndpointsApi,
} from '../../src/lib/endpoints.js';

function gate(over: Record<string, unknown>): Gate {
  return {
    id: 'g-' + String(over.name ?? 'x'),
    name: 'x',
    description: null,
    taskType: 'chat',
    model: 'gpt-5.4-mini',
    connector: 'sdk',
    projectId: null,
    createdAt: '2026-11-21T09:00:00.000Z',
    ...over,
  } as Gate;
}

const taken = (details?: Record<string, unknown>) =>
  new VerlonApiError(409, 'conflict', 'taken', details);

function fakeApi(over: Partial<EndpointsApi['gates']> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const api: EndpointsApi = {
    gates: {
      list: vi.fn(async () => []),
      getByName: vi.fn(async () => {
        throw new VerlonApiError(404, 'not_found', 'Gate not found');
      }),
      create: vi.fn(async (body: Record<string, unknown>) => {
        created.push(body);
        return gate(body);
      }),
      ...over,
    },
    modelTypes: vi.fn(async () => ({
      'gpt-5.4-mini': 'chat',
      'text-embedding-3-small': 'embeddings',
    })),
  };
  return { api, created };
}

describe('which gates are endpoints', () => {
  it('leaves out coding connector gates, hidden per-model gates and deleted ones', () => {
    expect(isListedEndpoint(gate({}))).toBe(true);
    expect(isListedEndpoint(gate({ connector: null }))).toBe(true);
    expect(isListedEndpoint(gate({ connector: 'claude-code' }))).toBe(false);
    expect(isListedEndpoint(gate({ autoCreatedModel: 'gpt-5.4-mini' }))).toBe(
      false
    );
    expect(isListedEndpoint(gate({ deletedAt: '2026-11-20' }))).toBe(false);
  });

  it('lists only endpoints, by name', async () => {
    const { api } = fakeApi({
      list: vi.fn(async () => [
        gate({ name: 'zeta' }),
        gate({ name: 'coding', connector: 'claude-code' }),
        gate({ name: 'alpha' }),
      ]),
    });
    expect((await listEndpoints(api, 'p1')).map((e) => e.name)).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(api.gates.list).toHaveBeenCalledWith('p1');
  });
});

describe('get by name', () => {
  it('says there is no such endpoint on a 404 or for a connector gate', async () => {
    await expect(getEndpoint(fakeApi().api, 'ghost')).rejects.toBeInstanceOf(
      EndpointError
    );
    const { api } = fakeApi({
      getByName: vi.fn(async () => gate({ connector: 'claude-code' })),
    });
    await expect(getEndpoint(api, 'coding')).rejects.toThrow(/list_endpoints/);
  });
});

describe('create', () => {
  it("sends the model's own type and what it does", async () => {
    const { api, created } = fakeApi();
    const r = await createEndpoint(api, {
      name: 'summarizer',
      model: 'gpt-5.4-mini',
      description: 'Summarizes tickets',
    });
    expect(created).toEqual([
      {
        name: 'summarizer',
        model: 'gpt-5.4-mini',
        taskType: 'chat',
        description: 'Summarizes tickets',
      },
    ]);
    expect(r.existing).toBe(false);
  });

  it('refuses a type the model cannot serve, an unknown type and an unknown model, before creating', async () => {
    const { api, created } = fakeApi();
    await expect(
      createEndpoint(api, {
        name: 's',
        model: 'gpt-5.4-mini',
        type: 'embeddings',
      })
    ).rejects.toThrow(/list_models with type "embeddings"/);
    await expect(
      createEndpoint(api, { name: 's', model: 'gpt-5.4-mini', type: 'rerank' })
    ).rejects.toThrow(/Unknown endpoint type/);
    await expect(
      createEndpoint(api, { name: 's', model: 'gpt-9' })
    ).rejects.toThrow(/doesn't serve a model called "gpt-9"/);
    expect(created).toEqual([]);
  });

  it('returns the endpoint it made before when run again with the same setup', async () => {
    const { api } = fakeApi({
      create: vi.fn(async () => {
        throw taken();
      }),
      getByName: vi.fn(async () => gate({ name: 'summarizer' })),
    });
    await expect(
      createEndpoint(api, { name: 'summarizer', model: 'gpt-5.4-mini' })
    ).resolves.toMatchObject({
      existing: true,
      endpoint: { name: 'summarizer' },
    });
  });

  it('passes the refusal through when the name is taken by another setup', async () => {
    const refusal = taken({ reason: 'taken', suggestion: 'summarizer-2' });
    const { api } = fakeApi({
      create: vi.fn(async () => {
        throw refusal;
      }),
      getByName: vi.fn(async () => gate({ model: 'claude-haiku-5-5' })),
    });
    await expect(
      createEndpoint(api, { name: 'summarizer', model: 'gpt-5.4-mini' })
    ).rejects.toBe(refusal);
  });
});
