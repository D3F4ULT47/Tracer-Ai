import assert from 'node:assert/strict';
import test from 'node:test';
import { EngineRegistry } from '../src/ai/engine-registry/engine-registry.js';
import { ResourceAdapterRegistry } from '../src/resources/adapter-registry/resource-adapter-registry.js';

test('AI engine registry accepts a complete definition', () => {
  const registry = new EngineRegistry();
  const definition = {
    name: 'test-engine',
    version: '1.0.0',
    inputSchema: {},
    outputSchema: {},
    supports: ['test'],
    createHandler: () => async () => ({}),
  };

  registry.register(definition);

  assert.equal(registry.get('test-engine').version, '1.0.0');
});

test('resource adapter registry finds a matching adapter', () => {
  const registry = new ResourceAdapterRegistry();
  registry.register({
    name: 'test-adapter',
    canHandle: (input) => input === 'supported',
    normalize: async () => ({}),
  });

  assert.equal(registry.find('supported').name, 'test-adapter');
  assert.equal(registry.find('unsupported'), null);
});
