const assert = require('assert');
const { messagesForModel } = require('../renderer/chat-context.js');

const savedMessages = [
  { role: 'assistant', content: 'A stale answer in another language.' },
  { role: 'user', content: 'A follow-up.' }
];

assert.deepStrictEqual(
  messagesForModel({ modelId: 'old-model', messages: savedMessages }, 'dolphin-model'),
  [],
  'history from another model must not enter the prompt'
);
assert.deepStrictEqual(
  messagesForModel({ messages: savedMessages }, 'dolphin-model'),
  [],
  'legacy conversations without model metadata must not enter the prompt'
);

const activeMessages = messagesForModel(
  { modelId: 'dolphin-model', messages: savedMessages },
  'dolphin-model'
);
assert.deepStrictEqual(activeMessages, savedMessages, 'history from the active model remains available');
assert.notStrictEqual(activeMessages[0], savedMessages[0], 'prompt messages are copied, not shared with saved history');

console.log('Chat context isolation tests passed.');
