import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerCreateEndpoint,
  registerEndpointReads,
} from '../../src/tools/endpoints.js';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}
interface RegisteredTool {
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
  handler: (args: unknown, extra: unknown) => Promise<ToolResult>;
}

const client = () => ({ apiKey: 'vk_1', baseUrl: 'https://x.test' });

function tools(): Record<string, RegisteredTool> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerEndpointReads(server, client);
  registerCreateEndpoint(server, client);
  return (
    server as unknown as { _registeredTools: Record<string, RegisteredTool> }
  )._registeredTools;
}

/** Answers by path: the registry, and whatever the test sets per route. */
function serve(routes: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const key = `${init?.method ?? 'GET'} ${path}`;
      if (path === '/v1/registry')
        return Response.json({
          models: { 'gpt-5.4-mini': { type: 'chat' } },
        });
      const reply = routes[key];
      if (!reply) throw new Error(`unexpected ${key}`);
      return reply();
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('the endpoint tools', () => {
  it('marks the reads read-only and create as a non-destructive, repeatable write', () => {
    const t = tools();
    expect(t.list_endpoints!.annotations?.readOnlyHint).toBe(true);
    expect(t.get_endpoint!.annotations?.readOnlyHint).toBe(true);
    expect(t.create_endpoint!.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('creates an endpoint and returns it as JSON', async () => {
    serve({
      'POST /v1/gates': () =>
        Response.json(
          {
            id: 'g1',
            name: 'summarizer',
            model: 'gpt-5.4-mini',
            taskType: 'chat',
            connector: 'sdk',
          },
          { status: 201 }
        ),
    });
    const r = await tools().create_endpoint!.handler(
      { name: 'summarizer', model: 'gpt-5.4-mini' },
      {}
    );
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({
      existing: false,
      endpoint: { name: 'summarizer', taskType: 'chat' },
    });
  });

  it('gives the calling model the suggested name when a name is refused', async () => {
    serve({
      'POST /v1/gates': () =>
        Response.json(
          {
            error: 'invalid_request',
            message: 'Names use lowercase letters, digits and hyphens.',
            details: { reason: 'format', suggestion: 'support-bot' },
          },
          { status: 400 }
        ),
    });
    const r = await tools().create_endpoint!.handler(
      { name: 'Support Bot', model: 'gpt-5.4-mini' },
      {}
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toBe(
      'Names use lowercase letters, digits and hyphens. Suggested name: support-bot'
    );
  });

  it("doesn't repeat a suggestion the message already names", async () => {
    serve({
      'POST /v1/gates': () =>
        Response.json(
          {
            error: 'conflict',
            message: "This name isn't available. Try summarizer-2.",
            details: { reason: 'taken', suggestion: 'summarizer-2' },
          },
          { status: 409 }
        ),
      'GET /v1/gates/name/summarizer': () =>
        Response.json({
          id: 'g9',
          name: 'summarizer',
          model: 'claude-haiku-5-5',
          taskType: 'chat',
        }),
    });
    const r = await tools().create_endpoint!.handler(
      { name: 'summarizer', model: 'gpt-5.4-mini' },
      {}
    );
    expect(r.content[0]!.text).toBe(
      "This name isn't available. Try summarizer-2."
    );
  });

  it('lists and gets endpoints', async () => {
    serve({
      'GET /v1/gates': () =>
        Response.json([
          { id: 'g1', name: 'b', model: 'm', connector: 'sdk' },
          { id: 'g2', name: 'cc', model: 'm', connector: 'claude-code' },
          { id: 'g3', name: 'a', model: 'm' },
        ]),
      'GET /v1/gates/name/a': () =>
        Response.json({ id: 'g3', name: 'a', model: 'm' }),
    });
    const t = tools();
    const list = JSON.parse(
      (await t.list_endpoints!.handler({}, {})).content[0]!.text
    ) as { endpoints: Array<{ name: string }> };
    expect(list.endpoints.map((e) => e.name)).toEqual(['a', 'b']);
    const one = JSON.parse(
      (await t.get_endpoint!.handler({ name: 'a' }, {})).content[0]!.text
    );
    expect(one).toMatchObject({ id: 'g3', name: 'a' });
  });
});
