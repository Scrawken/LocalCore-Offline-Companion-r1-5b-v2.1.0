const assert = require('assert');
const { ModelProviderRegistry } = require('../engine/llama-cpp-provider.js');

function mockProvider(id, caps = {}) {
  return {
    id,
    displayName: 'Mock ' + id,
    capabilities: () => ({ supportsStreaming: true, ...caps }),
    async* stream() { yield { type: 'done', finishReason: 'stop' }; }
  };
}

const registry = new ModelProviderRegistry();

// register + get + list
const a = mockProvider('provider-a');
const b = mockProvider('provider-b', { supportsVision: true });
registry.register(a);
registry.register(b);
assert.strictEqual(registry.get('provider-a'), a, 'get returns registered provider');
assert.strictEqual(registry.list().length, 2, 'list returns all providers');

// setDefault + getDefault
registry.setDefault('provider-b');
assert.strictEqual(registry.getDefault(), b, 'getDefault returns the default');
assert.strictEqual(registry.getDefault().capabilities().supportsVision, true, 'default capabilities accessible');

// error cases
assert.throws(() => registry.setDefault('missing'), /not registered/, 'setDefault rejects unregistered id');
const empty = new ModelProviderRegistry();
assert.throws(() => empty.getDefault(), /No default provider/, 'getDefault throws when unset');
assert.strictEqual(registry.get('missing'), undefined, 'get returns undefined for unknown id');

// re-register replaces
const a2 = mockProvider('provider-a', { supportsTools: true });
registry.register(a2);
assert.strictEqual(registry.get('provider-a'), a2, 're-register replaces the provider');

console.log('ModelProviderRegistry tests passed.');
