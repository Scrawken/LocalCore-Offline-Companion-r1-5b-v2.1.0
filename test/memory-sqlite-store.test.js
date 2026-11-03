const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// node:sqlite requires Node 22+ / Electron 39+. Skip gracefully on older Node.
let createSqliteMemoryStore;
try {
  ({ createSqliteMemoryStore } = require('../electron/memory-sqlite-store.js'));
} catch (error) {
  console.log('Skipping SQLite memory store tests: node:sqlite unavailable (' + error.message + ')');
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-sqlite-test-'));
let migDir = null;
const openStores = [];

function trackedStore(dir, modelId) {
  const s = createSqliteMemoryStore(dir, modelId);
  openStores.push(s);
  return s;
}

try {
  const store = trackedStore(dir, 'test-model');

  // Disclosure gating.
  assert.strictEqual(store.getSnapshot().disclosureAcknowledged, false, 'disclosure starts unacknowledged');
  const pre = store.createConversation();
  assert.strictEqual(store.appendMessage(pre.id, 'user', 'before disclosure').saved, false, 'blocked before disclosure');
  store.setDisclosureAcknowledged(true);

  // Conversation + message persistence.
  const conv = store.createConversation();
  assert.strictEqual(conv.modelId, 'test-model', 'model id recorded');
  assert.strictEqual(store.appendMessage(conv.id, 'user', 'Please remember this').saved, true);
  store.appendMessage(conv.id, 'assistant', 'Saved locally.', { mood: 'happy' });

  // Monotonic seq.
  const fetched = store.getConversation(conv.id);
  assert.strictEqual(fetched.messages.length, 2, 'messages persisted');
  assert.strictEqual(fetched.messages[0].seq, 0, 'seq starts at 0');
  assert.strictEqual(fetched.messages[1].seq, 1, 'seq increments');
  assert.strictEqual(fetched.messages[1].metadata.mood, 'happy', 'mood metadata stored');

  // Title derivation.
  assert.strictEqual(store.getConversation(conv.id).title, 'Please remember this', 'title derived from first user message');

  // Snapshot ordering (newest first).
  const conv2 = store.createConversation();
  store.appendMessage(conv2.id, 'user', 'second conversation');
  const snapshot = store.getSnapshot();
  assert.strictEqual(snapshot.conversations[0].id, conv2.id, 'newest conversation first');

  // Search.
  const found = store.searchConversations('remember');
  assert.strictEqual(found.total, 1, 'search finds the conversation');
  assert.strictEqual(found.results[0].id, conv.id);

  // Assets.
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const asset = store.saveAsset(conv.id, 'image', 'A test image', bytes, { width: 1, height: 1 });
  assert.strictEqual(asset.sizeBytes, bytes.length, 'asset size recorded');
  assert.deepStrictEqual(Buffer.from(store.readAsset(asset.id).base64, 'base64'), bytes, 'asset bytes round-trip');

  // Write log.
  const log = store.getWriteLog();
  assert.ok(log.some(e => e.action === 'message'), 'write log records messages');
  assert.ok(log.some(e => e.action === 'asset'), 'write log records assets');

  // Ephemeral: not in snapshot, retrievable by id, not persisted.
  const eph = store.createConversation({ ephemeral: true });
  store.appendMessage(eph.id, 'user', 'session only');
  assert.ok(!store.getSnapshot().conversations.some(c => c.id === eph.id), 'ephemeral not in snapshot');
  assert.strictEqual(store.getConversation(eph.id).messages.length, 1, 'ephemeral retrievable by id');

  // Delete.
  store.deleteConversation(conv2.id);
  assert.ok(!store.getSnapshot().conversations.some(c => c.id === conv2.id), 'conversation deleted');

  // Persistence across instances (same dir).
  const store2 = trackedStore(dir, 'test-model');
  assert.ok(store2.getSnapshot().conversations.some(c => c.id === conv.id), 'data persists across instances');
  assert.strictEqual(store2.getSnapshot().disclosureAcknowledged, true, 'disclosure persists');

  // --- Migration from legacy memory.json ---
  migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-sqlite-mig-'));
  const legacy = {
    schemaVersion: 1,
    rememberEnabled: false,
    disclosureAcknowledged: true,
    currentConversationId: 'conv-legacy',
    conversations: [{
      id: 'conv-legacy', modelId: 'old-model', title: 'Legacy chat',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T01:00:00Z',
      messages: [
        { id: 'm1', role: 'user', content: 'hello from json', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'hi there', createdAt: '2026-01-01T00:00:01Z', metadata: { mood: 'happy' } }
      ],
      assets: []
    }]
  };
  fs.writeFileSync(path.join(migDir, 'memory.json'), JSON.stringify(legacy));
  const migStore = trackedStore(migDir, 'test-model');
  const migrated = migStore.getConversation('conv-legacy');
  assert.ok(migrated, 'legacy conversation migrated');
  assert.strictEqual(migrated.messages.length, 2, 'messages migrated');
  assert.strictEqual(migrated.messages[1].metadata.mood, 'happy', 'mood migrated');
  assert.strictEqual(migStore.getSnapshot().rememberEnabled, false, 'rememberEnabled migrated');
  assert.strictEqual(migStore.getSnapshot().disclosureAcknowledged, true, 'disclosure migrated');
  assert.ok(migStore.getWriteLog().some(e => e.action === 'migrate'), 'migration logged');

  console.log('SQLite memory store tests passed.');
} finally {
  for (const s of openStores) { try { s.close(); } catch {} }
  // WAL files need a beat to release on Windows; clean up all temp dirs.
  for (const d of [dir, migDir].filter(Boolean)) {
    try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
}
