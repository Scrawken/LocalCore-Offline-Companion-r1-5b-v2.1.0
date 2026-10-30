const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocalMemoryStore } = require('../electron/local-memory-store.js');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-test-'));

try {
  let store = createLocalMemoryStore(testDirectory, 'test-model');
  assert.strictEqual(store.getSnapshot().rememberEnabled, true, 'remembering is enabled by default');

  const conversation = store.createConversation();
  assert.strictEqual(conversation.modelId, 'test-model', 'new conversations record the active model identity');
  assert.strictEqual(store.appendMessage(conversation.id, 'user', 'Please remember this').saved, true);
  store.appendMessage(conversation.id, 'assistant', 'Saved locally.');

  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const asset = store.saveAsset(conversation.id, 'image', 'A test image', bytes, { width: 1, height: 1 });
  assert.strictEqual(asset.sizeBytes, bytes.length, 'generated content metadata records the byte size');
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const uploadedImage = store.saveAsset(conversation.id, 'image', 'An uploaded image', jpegBytes, {
    mimeType: 'image/jpeg',
    originalName: 'test.jpg'
  });
  assert.strictEqual(uploadedImage.mimeType, 'image/jpeg', 'uploaded image MIME type is retained');
  assert(uploadedImage.fileName.endsWith('.jpg'), 'uploaded image extension matches its MIME type');

  store = createLocalMemoryStore(testDirectory);
  const snapshot = store.getSnapshot();
  assert.strictEqual(snapshot.conversations[0].title, 'Please remember this');
  assert.strictEqual(snapshot.conversations[0].modelId, 'test-model', 'conversation model identity persists');
  assert.strictEqual(snapshot.conversations[0].messages.length, 2, 'messages survive store recreation');
  assert.deepStrictEqual(Buffer.from(store.readAsset(asset.id).base64, 'base64'), bytes, 'saved bytes survive store recreation');
  assert.deepStrictEqual(Buffer.from(store.readAsset(uploadedImage.id).base64, 'base64'), jpegBytes, 'uploaded image bytes survive store recreation');
  assert.throws(() => store.saveAsset(conversation.id, 'image', 'Unsupported image', bytes, {
    mimeType: 'image/svg+xml'
  }), /Unsupported image format/);

  store.setRememberEnabled(false);
  assert.strictEqual(store.appendMessage(conversation.id, 'user', 'Do not save this').saved, false);
  assert.strictEqual(store.saveAsset(conversation.id, 'image', 'Not saved', bytes), null);
  assert.strictEqual(store.getSnapshot().conversations[0].messages.length, 2, 'paused memory leaves stored history unchanged');

  store.setRememberEnabled(true);
  const assetPath = path.join(testDirectory, 'memory-assets', asset.fileName);
  const uploadedImagePath = path.join(testDirectory, 'memory-assets', uploadedImage.fileName);
  store.deleteConversation(conversation.id);
  assert.strictEqual(store.getSnapshot().conversations.length, 0, 'conversation deletion removes its record');
  assert.strictEqual(fs.existsSync(assetPath), false, 'conversation deletion removes linked generated files');
  assert.strictEqual(fs.existsSync(uploadedImagePath), false, 'conversation deletion removes uploaded images');

  assert.throws(() => store.saveAsset('missing', 'image', 'Invalid', bytes), /Conversation not found/);

  // --- Message metadata (mood tagging) ---
  const metaConversation = store.createConversation();
  store.appendMessage(metaConversation.id, 'user', 'I am so sleepy today');
  store.appendMessage(metaConversation.id, 'assistant', 'Get some rest!', { mood: 'sleepy' });
  const metaSnapshot = store.getSnapshot();
  const tagged = metaSnapshot.conversations[0].messages.find(m => m.role === 'assistant');
  assert.strictEqual(tagged.metadata.mood, 'sleepy', 'assistant message records detected mood');
  assert.strictEqual(metaSnapshot.conversations[0].messages[0].metadata, undefined, 'message without metadata has none');

  // Metadata sanitization: only plain string/number/boolean values are kept.
  store.appendMessage(metaConversation.id, 'assistant', 'clean check', {
    mood: 'happy', nested: { bad: true }, list: ['bad'], count: 3, ok: true
  });
  const cleaned = store.getSnapshot().conversations[0].messages.find(m => m.content === 'clean check');
  assert.deepStrictEqual(cleaned.metadata, { mood: 'happy', count: 3, ok: true }, 'metadata drops non-plain values');

  // --- Server-side search ---
  const searchConv = store.createConversation();
  store.appendMessage(searchConv.id, 'user', 'Tell me about time travel paradoxes');
  store.appendMessage(searchConv.id, 'assistant', 'Well, the grandfather paradox is a classic.', { mood: 'thinking' });

  const found = store.searchConversations('time travel');
  assert.strictEqual(found.total, 1, 'search finds matching conversation');
  assert.strictEqual(found.results[0].id, searchConv.id, 'search returns the right conversation');
  assert.ok(found.results[0].snippets[0].text.includes('time travel'), 'snippet includes match context');

  // Snippet mood surfaces when the matching message is the mooded assistant turn.
  const moodHit = store.searchConversations('grandfather paradox');
  assert.strictEqual(moodHit.results[0].snippets[0].mood, 'thinking', 'search snippet carries message mood');

  const titleHit = store.searchConversations('grandfather');
  assert.ok(titleHit.results.some(r => r.id === searchConv.id), 'search matches message content');
  assert.strictEqual(store.searchConversations('definitely-not-present').total, 0, 'no match returns empty');
  assert.strictEqual(store.searchConversations('').total, 0, 'empty query returns empty');
  assert.strictEqual(store.searchConversations(null).total, 0, 'null query returns empty');

  console.log('Local memory store tests passed.');
} finally {
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
