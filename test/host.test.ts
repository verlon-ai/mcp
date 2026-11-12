import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type ClientFor } from '../src/index.js';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}
type Handler = (args: unknown, extra: unknown) => Promise<ToolResult>;

const handlers = (server: ReturnType<typeof createServer>) =>
  (
    server as unknown as {
      _registeredTools: Record<string, { handler: Handler }>;
    }
  )._registeredTools;

/** A call's context as the SDK passes it: the HTTP request's headers. */
const call = (authorization: string) => ({
  requestInfo: { headers: { authorization } },
});

const ENV_KEY = process.env.VERLON_API_KEY;
afterEach(() => {
  if (ENV_KEY === undefined) delete process.env.VERLON_API_KEY;
  else process.env.VERLON_API_KEY = ENV_KEY;
  vi.unstubAllGlobals();
});

describe('a host supplying the client per call', () => {
  it('each call gets the client for its own request, with no key in the environment', async () => {
    delete process.env.VERLON_API_KEY;
    const seen: string[] = [];
    const client: ClientFor = (extra) => {
      const auth = (
        extra as { requestInfo: { headers: Record<string, string> } }
      ).requestInfo.headers.authorization;
      seen.push(auth);
      return {
        gates: {
          list: async () => [{ id: `gate-of-${auth}`, name: 'g' }],
          get: async (id: string) => ({ id, owner: auth }),
        },
        logs: { list: async () => ({ logs: [], total: 0 }) },
      } as unknown as ReturnType<ClientFor>;
    };
    const tools = handlers(createServer({ client }));

    const a = await tools.list_gates.handler({}, call('Bearer key-a'));
    const b = await tools.list_gates.handler({}, call('Bearer key-b'));
    expect(a.isError).toBeFalsy();
    expect(a.content[0].text).toContain('gate-of-Bearer key-a');
    expect(b.content[0].text).toContain('gate-of-Bearer key-b');

    const g = await tools.get_gate.handler(
      { gateId: '11111111-1111-1111-1111-111111111111' },
      call('Bearer key-a')
    );
    expect(g.content[0].text).toContain('"owner": "Bearer key-a"');
    expect(seen).toEqual(['Bearer key-a', 'Bearer key-b', 'Bearer key-a']);
  });

  it('switch_model, registered with writes on, uses the host’s client too', async () => {
    const used: string[] = [];
    const client: ClientFor = () =>
      ({
        gates: {
          list: async () => {
            used.push('list');
            return [];
          },
          get: async () => ({}),
          update: async () => ({}),
        },
      }) as unknown as ReturnType<ClientFor>;
    const tools = handlers(createServer({ client, enableWrites: true }));
    await tools.switch_model.handler({ model: 'gpt-5.5' }, call('Bearer k'));
    expect(used).toEqual(['list']);
  });

  it('list_models reads the registry from the host’s base URL', async () => {
    const fetchMock = vi.fn(async () => Response.json({ models: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const tools = handlers(
      createServer({ baseUrl: () => 'https://api.staging.test/' })
    );
    await tools.list_models.handler({}, call('Bearer k'));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.staging.test/v1/registry'
    );
  });

  it('importing the library starts no stdio server', async () => {
    const write = vi.spyOn(process.stderr, 'write');
    await import('../src/index.js');
    expect(
      write.mock.calls.some((c) => String(c[0]).includes('listening on stdio'))
    ).toBe(false);
    write.mockRestore();
  });
});
