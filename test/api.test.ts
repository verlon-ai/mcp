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
