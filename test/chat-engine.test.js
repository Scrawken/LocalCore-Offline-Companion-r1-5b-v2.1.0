const assert = require('assert');
const { createChatEngine } = require('../engine/chat-engine.js');

// Mock ModelProvider: streams a fixed set of tokens, honoring abort.
function createMockProvider(tokensPerReply = ['Hello', ' there', '!']) {
  return {
    modelId: 'mock-model',
    calls: [],
    async* stream(req) {
      this.calls.push(req);
      for (const token of tokensPerReply) {
        if (req.signal && req.signal.aborted) {
          yield { type: 'done', finishReason: 'cancelled' };
          return;
        }
        yield { type: 'token', text: token };
        // Yield to the event loop so abort can interleave.
        await new Promise(resolve => setImmediate(resolve));
      }
      yield { type: 'done', finishReason: 'stop' };
    }
  };
}

async function run() {
  // --- send() streams a full assistant turn ---
  {
    const provider = createMockProvider();
    const engine = createChatEngine(provider);
    const events = [];
    engine.subscribe(e => events.push(e));

    const turn = await engine.send('Hi');
    assert.strictEqual(turn.status, 'complete', 'assistant turn completes');
    assert.strictEqual(turn.text, 'Hello there!', 'tokens accumulate into turn text');
    assert.strictEqual(turn.modelId, 'mock-model', 'turn records modelId');

    const turns = engine.getTurns();
    assert.strictEqual(turns.length, 2, 'user + assistant turns recorded');
    assert.strictEqual(turns[0].role, 'user');
    assert.strictEqual(turns[0].seq, 0, 'seq increments');
    assert.strictEqual(turns[1].seq, 1);

    const tokenEvents = events.filter(e => e.type === 'token');
    assert.strictEqual(tokenEvents.length, 3, 'token events emitted per chunk');
    assert.ok(events.some(e => e.type === 'turn-start') && events.some(e => e.type === 'turn-end'), 'turn lifecycle events emitted');
  }

  // --- cancel() keeps user turn, discards assistant turn from context ---
  {
    const provider = createMockProvider(['a', 'b', 'c', 'd', 'e']);
    const engine = createChatEngine(provider);
    const sendPromise = engine.send('Tell me something');
    // Cancel on the next tick so streaming has started.
    setImmediate(() => engine.cancel());
    const turn = await sendPromise;
    assert.strictEqual(turn.status, 'cancelled', 'cancelled assistant turn marked cancelled');

    const turns = engine.getTurns();
    assert.strictEqual(turns[0].role, 'user', 'user turn kept');
    assert.strictEqual(turns[0].status, 'complete');
    assert.strictEqual(turns[1].status, 'cancelled', 'assistant turn cancelled');

    // Next send must not include the cancelled assistant text in model context.
    await engine.send('again');
    const lastCall = provider.calls[provider.calls.length - 1];
    const assistantContext = lastCall.messages.filter(m => m.role === 'assistant');
    assert.ok(assistantContext.every(m => !['a', 'ab', 'abc'].some(partial => m.content === partial)),
      'cancelled assistant turn excluded from model context');
  }

  // --- regenerate() discards last assistant turn and re-streams ---
  {
    const provider = createMockProvider(['first']);
    const engine = createChatEngine(provider);
    await engine.send('question');
    assert.strictEqual(engine.getTurns().filter(t => t.role === 'assistant').length, 1);

    await engine.regenerate();
    const assistants = engine.getTurns().filter(t => t.role === 'assistant');
    assert.strictEqual(assistants.length, 2, 'regenerate adds a new assistant turn');
    assert.strictEqual(assistants[0].status, 'cancelled', 'old assistant turn discarded');
    assert.strictEqual(assistants[1].status, 'complete', 'new assistant turn completes');
  }

  // --- send() while streaming is rejected ---
  {
    const provider = createMockProvider(['x', 'y', 'z']);
    const engine = createChatEngine(provider);
    const pending = engine.send('first');
    await assert.rejects(() => engine.send('second'), /already streaming/);
    await pending;
  }

  // --- provider error surfaces as error turn + event ---
  {
    const failing = {
      modelId: 'mock',
      async* stream() { throw new Error('boom'); }
    };
    const engine = createChatEngine(failing);
    const events = [];
    engine.subscribe(e => events.push(e));
    const turn = await engine.send('hi');
    assert.strictEqual(turn.status, 'error', 'provider error marks turn error');
    assert.ok(events.some(e => e.type === 'error' && e.message === 'boom'), 'error event emitted');
  }

  console.log('ChatEngine tests passed.');
}

run().catch(error => {
  console.error('ChatEngine test failed:', error);
  process.exitCode = 1;
});
