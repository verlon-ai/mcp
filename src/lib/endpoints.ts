/**
 * Endpoints: a named model setup that an app calls. On the API an
 * endpoint is a gate row (`/v1/gates`); what a customer sees as an
 * endpoint leaves out Claude Code connector gates and the hidden
 * per-model gates. The same rules as `verlon endpoint` in the CLI.
 */
import { VerlonApiError, type Gate } from './api.js';

/** The types an endpoint can have, as the API stores them. */
export const ENDPOINT_TYPES = [
  'chat',
  'embeddings',
  'image',
  'video',
  'stt',
  'tts',
  'moderation',
  'ocr',
] as const;

export interface Endpoint {
  id: string;
  name: string;
  description: string | null;
  taskType: string | null;
  model: string | null;
  /** `pick`: the chosen model, with automatic fallbacks after the
   * endpoint's own. `lock`: exactly `model`, only the fallbacks listed. */
  modelChoice: 'pick' | 'lock';
  projectId: string | null;
  createdAt: string | null;
}

/** What the tools need from the API, so tests pass a fake. */
export interface EndpointsApi {
  gates: {
    list(projectId?: string): Promise<Gate[]>;
    getByName(name: string): Promise<Gate>;
    create(body: Record<string, unknown>): Promise<Gate>;
  };
  modelTypes(): Promise<Record<string, string>>;
}

/** A refusal the calling model can act on. */
export class EndpointError extends Error {
  readonly details?: Record<string, unknown>;
  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EndpointError';
    this.details = details;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Whether a gate is one the customer sees as an endpoint: not a
 * coding connector's gate, not a hidden per-model gate, not deleted. */
export function isListedEndpoint(g: Gate): boolean {
  const connector = g.connector;
  return (
    (connector === undefined || connector === null || connector === 'sdk') &&
    !g.autoCreatedModel &&
    !g.deletedAt
  );
}

export function toEndpoint(g: Gate): Endpoint {
  const created = g.createdAt;
  return {
    id: g.id,
    name: g.name,
    description: str(g.description),
    taskType: str(g.taskType),
    model: str(g.model),
    modelChoice: g.modelChoice === 'lock' ? 'lock' : 'pick',
    projectId: str(g.projectId),
    createdAt: created instanceof Date ? created.toISOString() : str(created),
  };
}

export async function listEndpoints(
  api: EndpointsApi,
  projectId?: string
): Promise<Endpoint[]> {
  return (await api.gates.list(projectId))
    .filter(isListedEndpoint)
    .map(toEndpoint)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function notFound(name: string): EndpointError {
  return new EndpointError(
    `No endpoint named "${name}". Call list_endpoints to see the account's endpoints.`
  );
}

export async function getEndpoint(
  api: EndpointsApi,
  name: string
): Promise<Endpoint> {
  let gate: Gate;
  try {
    gate = await api.gates.getByName(name);
  } catch (err) {
    if (err instanceof VerlonApiError && err.status === 404)
      throw notFound(name);
    throw err;
  }
  if (!isListedEndpoint(gate)) throw notFound(name);
  return toEndpoint(gate);
}

export interface CreateEndpointInput {
  name: string;
  model: string;
  type?: string;
  description?: string;
  /** Lock to the model: no automatic changes or fallbacks. */
  lock?: boolean;
}

export interface CreateEndpointResult {
  endpoint: Endpoint;
  existing: boolean;
  /** On an existing endpoint, the description asked for that was not
   * applied, because the endpoint already has another one. */
  descriptionKept?: { stored: string | null; asked: string };
}

/**
 * Create an endpoint. The type defaults to the model's own type in
 * the registry; a model Verlon doesn't serve, or one of another type,
 * is refused before anything is created.
 *
 * The same create again (same name, model, type and lock) returns the endpoint it made the first time
 * (`existing: true`), so an agent that re-runs its work doesn't fail
 * on its own earlier step. The stored description is never overwritten
 * (someone may have edited it); when the one asked for differs,
 * `descriptionKept` says so. A taken name with a different setup is
 * refused with the API's message and details unchanged.
 */
export async function createEndpoint(
  api: EndpointsApi,
  input: CreateEndpointInput
): Promise<CreateEndpointResult> {
  if (
    input.type !== undefined &&
    !(ENDPOINT_TYPES as readonly string[]).includes(input.type)
  ) {
    throw new EndpointError(
      `Unknown endpoint type "${input.type}". Use one of: ${ENDPOINT_TYPES.join(', ')}.`
    );
  }
  const modelType = (await api.modelTypes())[input.model];
  if (modelType === undefined) {
    throw new EndpointError(
      `Verlon doesn't serve a model called "${input.model}". Call list_models with type "${input.type ?? 'chat'}" for the ids.`
    );
  }
  const taskType = input.type ?? modelType;
  if (taskType !== modelType) {
    throw new EndpointError(
      `${input.model} is a ${modelType} model, and the type asked for is ${taskType}. Call list_models with type "${taskType}" for a model of that type, or leave out type.`
    );
  }

  const body: Record<string, unknown> = {
    name: input.name,
    model: input.model,
    taskType,
  };
  if (input.description) body.description = input.description;
  if (input.lock) body.modelChoice = 'lock';
  const modelChoice = input.lock ? 'lock' : 'pick';

  try {
    return {
      endpoint: toEndpoint(await api.gates.create(body)),
      existing: false,
    };
  } catch (err) {
    if (!(err instanceof VerlonApiError) || err.status !== 409) throw err;
    const same = await api.gates
      .getByName(input.name)
      .then((g) =>
        isListedEndpoint(g) &&
        g.model === input.model &&
        g.taskType === taskType &&
        (g.modelChoice === 'lock' ? 'lock' : 'pick') === modelChoice
          ? g
          : null
      )
      .catch(() => null);
    if (!same) throw err;
    const endpoint = toEndpoint(same);
    return input.description && input.description !== endpoint.description
      ? {
          endpoint,
          existing: true,
          descriptionKept: {
            stored: endpoint.description,
            asked: input.description,
          },
        }
      : { endpoint, existing: true };
  }
}
