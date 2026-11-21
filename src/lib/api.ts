/**
 * The Verlon REST API calls these tools make, over fetch. No client
 * package: a gate and a log are the API's own JSON.
 */

export interface VerlonCredentials {
  apiKey: string;
  /** Defaults to https://api.verlon.ai. */
  baseUrl?: string;
}

export const DEFAULT_BASE_URL = 'https://api.verlon.ai';

/** A non-2xx answer from the API, with its status and stable error code. */
export class VerlonApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** The API's own `details`: a refused name's `reason` and `suggestion`. */
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VerlonApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type Gate = Record<string, unknown> & { id: string; name: string };
export type Log = Record<string, unknown>;

export interface ListLogsOptions {
  gate?: string;
  since?: string;
  success?: boolean;
  limit?: number;
}

export class VerlonApi {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(credentials: VerlonCredentials) {
    this.apiKey = credentials.apiKey;
    this.baseUrl = (credentials.baseUrl || DEFAULT_BASE_URL).replace(
      /\/+$/,
      ''
    );
  }

  readonly gates = {
    list: (projectId?: string) =>
      this.request<Gate[]>(
        'GET',
        projectId
          ? `/v1/gates?projectId=${encodeURIComponent(projectId)}`
          : '/v1/gates'
      ),
    get: (id: string) =>
      this.request<Gate>('GET', `/v1/gates/${encodeURIComponent(id)}`),
    getByName: (name: string) =>
      this.request<Gate>('GET', `/v1/gates/name/${encodeURIComponent(name)}`),
    create: (body: Record<string, unknown>) =>
      this.request<Gate>('POST', '/v1/gates', body),
    /** PATCH answers `{ gate, hasChanges, changedFields }`; the gate. */
    update: async (id: string, data: Record<string, unknown>) =>
      (
        await this.request<{ gate: Gate }>(
          'PATCH',
          `/v1/gates/${encodeURIComponent(id)}`,
          data
        )
      ).gate,
  };

  readonly logs = {
    /** The logs, without the pagination wrapper. */
    list: async (options: ListLogsOptions = {}) => {
      const q = new URLSearchParams();
      if (options.limit) q.set('limit', String(options.limit));
      if (options.gate) q.set('gate', options.gate);
      if (options.success !== undefined)
        q.set('success', String(options.success));
      if (options.since) q.set('since', options.since);
      const query = q.toString();
      return (
        await this.request<{ logs: Log[] }>(
          'GET',
          query ? `/v1/logs?${query}` : '/v1/logs'
        )
      ).logs;
    },
  };

  /** The models Verlon serves now (`GET /v1/registry`: available and not
   * deprecated), by id, with each one's type (chat, embeddings, image…). */
  async modelTypes(): Promise<Record<string, string>> {
    const { models } = await this.request<{
      models?: Record<
        string,
        { type?: string; isAvailable?: boolean; deprecated?: boolean }
      >;
    }>('GET', '/v1/registry');
    return Object.fromEntries(
      Object.entries(models ?? {})
        .filter(
          ([, m]) =>
            typeof m.type === 'string' &&
            m.isAvailable !== false &&
            m.deprecated !== true
        )
        .map(([id, m]) => [id, m.type as string])
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // not JSON: reported below with the status
    }
    if (!res.ok) {
      const e = (data ?? {}) as {
        error?: unknown;
        message?: unknown;
        details?: unknown;
      };
      const code = typeof e.error === 'string' ? e.error : 'unknown_error';
      const message =
        (typeof e.message === 'string' && e.message) ||
        (typeof e.error === 'string' && e.error) ||
        `Request failed with ${res.status}`;
      const details =
        typeof e.details === 'object' && e.details !== null
          ? (e.details as Record<string, unknown>)
          : undefined;
      throw new VerlonApiError(res.status, code, message, details);
    }
    return data as T;
  }
}
