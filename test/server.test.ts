import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server.js';

const toolNames = (enableWrites: boolean) =>
  Object.keys(
    (
      createServer({ enableWrites }) as unknown as {
        _registeredTools: Record<string, unknown>;
      }
    )._registeredTools
  ).sort();

describe('the tools the server offers', () => {
  it('read-only by default', () => {
    expect(toolNames(false)).toEqual([
      'get_gate',
      'list_gates',
      'list_logs',
      'list_models',
    ]);
  });

  it('adds switch_model with --enable-writes', () => {
    expect(toolNames(true)).toEqual([
      'get_gate',
      'list_gates',
      'list_logs',
      'list_models',
      'switch_model',
    ]);
  });

  it('no longer offers the retired recommendations and experiments tools', () => {
    for (const writes of [false, true]) {
      expect(toolNames(writes)).not.toContain('get_recommendations');
      expect(toolNames(writes)).not.toContain('list_experiments');
    }
  });
});
