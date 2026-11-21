import { afterEach, describe, expect, it, vi } from 'vitest';
import { VerlonApi, VerlonApiError } from '../src/lib/api.js';

afterEach(() => vi.unstubAllGlobals());

function serve(reply: () => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return reply();
    })
  );
  return calls;
}

describe('the REST client', () => {
  it('sends the key as a bearer token to the base URL, default api.verlon.ai', async () => {
    const calls = serve(() => Response.json([]));
    await new VerlonApi({ apiKey: 'vk_1' }).gates.list();
    await new VerlonApi({
      apiKey: 'vk_2',
      baseUrl: 'https://x.test/',
    }).gates.list();
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.verlon.ai/v1/gates',
      'https://x.test/v1/gates',
    ]);
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: 'Bearer vk_1',
    });
  });

  it('returns the gate from a PATCH, not its wrapper', async () => {
    const calls = serve(() =>
      Response.json({
        gate: { id: 'g1', name: 'n', model: 'm2' },
        hasChanges: true,
        changedFields: ['model'],
      })
    );
    const gate = await new VerlonApi({ apiKey: 'k' }).gates.update('g1', {
      model: 'm2',
    });
    expect(gate).toEqual({ id: 'g1', name: 'n', model: 'm2' });
    expect(calls[0]!.init).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ model: 'm2' }),
    });
  });

  it('returns the logs, with the filters as query parameters', async () => {
    const calls = serve(() =>
      Response.json({ logs: [{ id: 'l1' }], total: 1, hasMore: false })
    );
    const logs = await new VerlonApi({ apiKey: 'k' }).logs.list({
      gate: 'g',
      success: false,
      limit: 5,
    });
    expect(logs).toEqual([{ id: 'l1' }]);
    expect(calls[0]!.url).toBe(
      'https://api.verlon.ai/v1/logs?limit=5&gate=g&success=false'
    );
  });

  it('raises the API’s status, code and message', async () => {
    serve(() =>
      Response.json(
        { error: 'not_found', message: 'Gate not found' },
        { status: 404 }
      )
    );
    const err = await new VerlonApi({ apiKey: 'k' }).gates
      .get('nope')
      .catch((e) => e);
    expect(err).toBeInstanceOf(VerlonApiError);
    expect(err).toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Gate not found',
    });
    serve(() => new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(
      new VerlonApi({ apiKey: 'k' }).gates.list()
    ).rejects.toMatchObject({
      status: 502,
      message: 'Request failed with 502',
    });
  });
});

describe('the endpoint calls', () => {
  it('finds a gate by name, lists one project and creates with a body', async () => {
    const calls = serve(() => Response.json({ id: 'g1', name: 'a' }));
    const api = new VerlonApi({ apiKey: 'vk_1', baseUrl: 'https://x.test' });
    await api.gates.getByName('a b');
    await api.gates.list('p 1');
    await api.gates.create({ name: 'a', model: 'm' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://x.test/v1/gates/name/a%20b',
      'https://x.test/v1/gates?projectId=p%201',
      'https://x.test/v1/gates',
    ]);
    expect(calls[2]!.init.method).toBe('POST');
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({
      name: 'a',
      model: 'm',
    });
  });

  it("carries the API's details on an error", async () => {
    serve(() =>
      Response.json(
        {
          error: 'conflict',
          message: "This name isn't available. Try a-2.",
          details: { reason: 'taken', suggestion: 'a-2' },
        },
        { status: 409 }
      )
    );
    const err = await new VerlonApi({ apiKey: 'vk_1' }).gates
      .create({ name: 'a' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerlonApiError);
    expect((err as VerlonApiError).details).toEqual({
      reason: 'taken',
      suggestion: 'a-2',
    });
  });

  it('gives the type of every model Verlon serves, leaving out retired ones', async () => {
    serve(() =>
      Response.json({
        models: {
          'gpt-5.4-mini': { type: 'chat' },
          'text-embedding-3-small': { type: 'embeddings' },
          old: { type: 'chat', deprecated: true },
          gone: { type: 'chat', isAvailable: false },
          untyped: {},
        },
      })
    );
    await expect(
      new VerlonApi({ apiKey: 'vk_1' }).modelTypes()
    ).resolves.toEqual({
      'gpt-5.4-mini': 'chat',
      'text-embedding-3-small': 'embeddings',
    });
  });
});
