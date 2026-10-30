const assert = require('assert');
const http = require('http');
const { createAttachedLlamaProvider } = require('../engine/attached-llama-provider.js');

// Spin up a tiny SSE server that mimics llama.cpp's /v1/chat/completions.
function startMockServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await startMockServer();
  const port = server.address().port;
  try {
    const provider = createAttachedLlamaProvider({
      baseUrl: 'http://127.0.0.1:' + port,
      apiKey: 'test-key',
      modelId: 'mock'
    });
    assert.strictEqual(provider.id, 'llama-cpp-attached');
    assert.strictEqual(provider.capabilities().supportsStreaming, true);
    assert.strictEqual(provider.capabilities().consumesHeavySlot, false, 'attached provider does not consume a heavy slot');

    const chunks = [];
    for await (const chunk of provider.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }
    const tokens = chunks.filter(c => c.type === 'token').map(c => c.text).join('');
    assert.strictEqual(tokens, 'Hello world', 'tokens stream and accumulate');
    assert.ok(chunks.some(c => c.type === 'done' && c.finishReason === 'stop'), 'done event with stop reason');

    console.log('Attached llama provider tests passed.');
  } finally {
    server.close();
  }
})().catch(error => {
  console.error('Attached provider test failed:', error);
  process.exitCode = 1;
});
