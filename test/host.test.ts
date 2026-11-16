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

describe('a host supplying the credentials per call', () => {
  it('each call runs with its own request’s credentials, with no key in the environment', async () => {
    delete process.env.VERLON_API_KEY;
    const sent: Array<{ url: string; auth: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const auth = (init.headers as Record<string, string>).authorization;
        sent.push({ url, auth });
        return url.endsWith('/v1/gates')
          ? Response.json([{ id: `gate-of-${auth}`, name: 'g' }])
          : Response.json({ id: url.split('/').pop(), name: 'g', owner: auth });
      })
    );
    const client: ClientFor = (extra) => ({
      apiKey: (
        extra as { requestInfo: { headers: Record<string, string> } }
      ).requestInfo.headers.authorization.replace('Bearer ', ''),
      baseUrl: 'https://api.host.test',
    });
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
    expect(sent).toEqual([
      { url: 'https://api.host.test/v1/gates', auth: 'Bearer key-a' },
      { url: 'https://api.host.test/v1/gates', auth: 'Bearer key-b' },
      {
        url: 'https://api.host.test/v1/gates/11111111-1111-1111-1111-111111111111',
        auth: 'Bearer key-a',
      },
    ]);
  });

  it('switch_model, registered with writes on, uses the host’s credentials too', async () => {
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    const client: ClientFor = () => ({
      apiKey: 'k',
      baseUrl: 'https://api.host.test',
    });
    const tools = handlers(createServer({ client, enableWrites: true }));
    await tools.switch_model.handler({ model: 'gpt-5.5' }, call('Bearer k'));
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.host.test/v1/gates');
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
