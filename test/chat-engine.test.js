const assert = require('assert');
const { createChatEngine, ChatErrorCode, classifyError } = require('../engine/chat-engine.js');

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

  // --- seedContext() seeds prior turns into model context without streaming ---
  {
    const provider = createMockProvider(['ok']);
    const engine = createChatEngine(provider);
    engine.seedContext([
      { role: 'system', content: 'You are Maura.' },
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' }
    ]);
    await engine.send('new question');
    const call = provider.calls[0];
    const contents = call.messages.map(m => m.content);
    assert.ok(contents.includes('You are Maura.'), 'system context seeded');
    assert.ok(contents.includes('earlier question'), 'prior user turn seeded');
    assert.ok(contents.includes('earlier answer'), 'prior assistant turn seeded');
    assert.ok(contents.includes('new question'), 'new user turn present');
    // Order: system first, then conversation.
    assert.strictEqual(call.messages[0].role, 'system', 'system message first');
  }

  // --- thinking event: emitted immediately on send, once, before tokens ---
  {
    const provider = createMockProvider(['slow', 'reply']);
    const engine = createChatEngine(provider);
    const events = [];
    engine.subscribe(e => events.push(e));
    await engine.send('hello');
    const thinkingEvents = events.filter(e => e.type === 'thinking');
    assert.strictEqual(thinkingEvents.length, 1, 'thinking emitted exactly once');
    assert.ok(thinkingEvents[0].turnId, 'thinking carries turnId');
    assert.ok(typeof thinkingEvents[0].at === 'number', 'thinking carries timestamp');
    // thinking must come before the first token.
    const firstThinking = events.findIndex(e => e.type === 'thinking');
    const firstToken = events.findIndex(e => e.type === 'token');
    assert.ok(firstThinking >= 0 && (firstToken === -1 || firstThinking < firstToken), 'thinking precedes tokens');
  }

  // --- error taxonomy: provider errors classified with code + recoverable ---
  {
    const failing = { modelId: 'm', async* stream() { throw new Error('context length exceeded'); } };
    const engine = createChatEngine(failing);
    const events = [];
    engine.subscribe(e => events.push(e));
    const turn = await engine.send('hi');
    assert.strictEqual(turn.status, 'error');
    const errEvent = events.find(e => e.type === 'error');
    assert.strictEqual(errEvent.code, ChatErrorCode.CONTEXT_OVERFLOW, 'context error classified');
    assert.strictEqual(errEvent.recoverable, true, 'context overflow is recoverable');
  }

  // classifyError mapping
  assert.strictEqual(classifyError(new Error('cancelled by user')).code, 'cancelled');
  assert.strictEqual(classifyError(new Error('model file not found')).code, 'model-load-failed');
  assert.strictEqual(classifyError(new Error('fetch failed')).code, 'offline');
  assert.strictEqual(classifyError(new Error('something weird')).code, 'unknown');

  // --- crash recovery: in-progress assistant turn discarded on recover() ---
  {
    // Provider that never finishes (simulates a crash mid-stream).
    const hanging = {
      modelId: 'm',
      async* stream() {
        yield { type: 'token', text: 'partial' };
        await new Promise(() => {}); // never resolves
      }
    };
    const engine = createChatEngine(hanging);
    const sendPromise = engine.send('hi');
    // Let the first token arrive so the turn is in-progress.
    await new Promise(resolve => setImmediate(resolve));
    // Simulate crash: do not resolve; call recover() as on startup.
    const discarded = engine.recover();
    assert.strictEqual(discarded, 1, 'in-progress assistant turn discarded on recover');
    const turns = engine.getTurns();
    const assistant = turns.find(t => t.role === 'assistant');
    assert.strictEqual(assistant.status, 'cancelled', 'recovered turn marked cancelled');
    // recover() is idempotent.
    assert.strictEqual(engine.recover(), 0, 'recover is idempotent');
    // Clean up the hanging promise.
    engine.cancel();
    sendPromise.catch(() => {});
  }

  console.log('ChatEngine tests passed.');
}

run().catch(error => {
  console.error('ChatEngine test failed:', error);
  process.exitCode = 1;
});
