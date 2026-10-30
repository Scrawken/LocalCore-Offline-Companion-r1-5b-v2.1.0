const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocalMemoryStore } = require('../electron/local-memory-store.js');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-test-'));

try {
  let store = createLocalMemoryStore(testDirectory, 'test-model');
  assert.strictEqual(store.getSnapshot().rememberEnabled, true, 'remembering is enabled by default');
  assert.strictEqual(store.getSnapshot().disclosureAcknowledged, false, 'disclosure starts unacknowledged');

  // Phase 2: no capture before the first-run disclosure is acknowledged.
  const preConversation = store.createConversation();
  assert.strictEqual(store.appendMessage(preConversation.id, 'user', 'before disclosure').saved, false,
    'messages are not captured before disclosure acknowledgement');
  assert.strictEqual(
    store.saveAsset(preConversation.id, 'image', 'blocked', Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    null,
    'assets are not captured before disclosure acknowledgement'
  );
  store.setDisclosureAcknowledged(true);
  assert.strictEqual(store.getSnapshot().disclosureAcknowledged, true, 'disclosure acknowledgement persists');
  store.deleteConversation(preConversation.id); // remove the empty pre-disclosure conversation

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

  // --- At-rest encryption (mock provider; safeStorage needs the Electron app) ---
  const encDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-enc-'));
  try {
    // Simple reversible mock: base64 + reverse (NOT real crypto; test-only).
    const mockCrypto = {
      isAvailable: () => true,
      encrypt: text => Buffer.from(Buffer.from(text, 'utf8').toString('base64')).reverse(),
      decrypt: buf => Buffer.from(buf.reverse().toString(), 'base64').toString('utf8')
    };
    const encStore = createLocalMemoryStore(encDir, 'test-model', mockCrypto);
    encStore.setDisclosureAcknowledged(true);
    const encConv = encStore.createConversation();
    encStore.appendMessage(encConv.id, 'user', 'secret message');

    // On-disk file must be encrypted (envelope prefix, not readable JSON).
    const onDisk = fs.readFileSync(path.join(encDir, 'memory.json'), 'utf8');
    assert.ok(onDisk.startsWith('ENC1:'), 'memory.json is written with the encryption envelope');
    assert.ok(!onDisk.includes('secret message'), 'plaintext content is not present on disk');
    assert.strictEqual(encStore.getEncryptionStatus().onDisk, 'encrypted', 'status reports encrypted');

    // Round-trip: a new store instance decrypts correctly.
    const encStore2 = createLocalMemoryStore(encDir, 'test-model', mockCrypto);
    assert.strictEqual(
      encStore2.getSnapshot().conversations[0].messages[0].content,
      'secret message',
      'encrypted memory decrypts on read'
    );

    // Migration: write plaintext, then open with encryption -> becomes encrypted.
    const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-plain-'));
    try {
      const plainStore = createLocalMemoryStore(plainDir, 'test-model'); // no crypto
      plainStore.setDisclosureAcknowledged(true);
      const plainConv = plainStore.createConversation();
      plainStore.appendMessage(plainConv.id, 'user', 'migrate me');
      assert.strictEqual(plainStore.getEncryptionStatus().onDisk, 'plaintext', 'starts plaintext');

      const migrated = createLocalMemoryStore(plainDir, 'test-model', mockCrypto);
      migrated.getSnapshot(); // triggers migration on read
      const migratedRaw = fs.readFileSync(path.join(plainDir, 'memory.json'), 'utf8');
      assert.ok(migratedRaw.startsWith('ENC1:'), 'plaintext file migrates to encrypted on read');
      assert.strictEqual(
        migrated.getSnapshot().conversations[0].messages[0].content,
        'migrate me',
        'content survives migration'
      );
    } finally {
      fs.rmSync(plainDir, { recursive: true, force: true });
    }

    // Encrypted file + no provider -> clear error, not silent corruption.
    const noCrypto = createLocalMemoryStore(encDir, 'test-model');
    assert.throws(() => noCrypto.getSnapshot(), /encrypted but encryption is unavailable/);
  } finally {
    fs.rmSync(encDir, { recursive: true, force: true });
  }

  // --- Retention / pruning ---
  const pruneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-prune-'));
  try {
    const pStore = createLocalMemoryStore(pruneDir, 'test-model');
    pStore.setDisclosureAcknowledged(true);
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const c = pStore.createConversation();
      pStore.appendMessage(c.id, 'user', 'message ' + i);
      ids.push(c.id);
    }
    // createConversation unshifts (newest first) and marks the newest active,
    // so ids[4] is active and conversations are ordered [ids4, ids3, ... ids0].
    const result = pStore.pruneConversations({ maxConversations: 2 });
    assert.strictEqual(result.removed, 3, 'prunes down to the count cap');
    const kept = pStore.getSnapshot().conversations;
    assert.strictEqual(kept.length, 2, 'two conversations remain');
    assert.ok(kept.some(c => c.id === ids[4]), 'active (newest) conversation is never pruned');
    assert.ok(kept.some(c => c.id === ids[3]), 'second-newest conversation kept');

    // Age-based pruning: backdate one conversation's updatedAt by editing state.
    const ageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-age-'));
    try {
      const aStore = createLocalMemoryStore(ageDir, 'test-model');
      aStore.setDisclosureAcknowledged(true);
      const old = aStore.createConversation();
      aStore.appendMessage(old.id, 'user', 'old');
      const recent = aStore.createConversation(); // becomes active
      aStore.appendMessage(recent.id, 'user', 'recent');
      // Manually backdate the 'old' conversation by rewriting state.
      const stateFile = path.join(ageDir, 'memory.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const oldConv = state.conversations.find(c => c.id === old.id);
      oldConv.updatedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      const ageResult = aStore.pruneConversations({ maxAgeDays: 30 });
      assert.strictEqual(ageResult.removed, 1, 'age-based prune removes old conversation');
      assert.strictEqual(ageResult.removedIds[0], old.id, 'the backdated conversation was pruned');
      assert.ok(aStore.getSnapshot().conversations.some(c => c.id === recent.id), 'recent conversation kept');
    } finally {
      fs.rmSync(ageDir, { recursive: true, force: true });
    }

    assert.throws(() => pStore.pruneConversations({}), /requires maxConversations/);

    // --- Wipe-all ---
    const wipeResult = pStore.wipeAll();
    assert.strictEqual(wipeResult.removed, 2, 'wipe-all removes all remaining conversations');
    assert.strictEqual(pStore.getSnapshot().conversations.length, 0, 'store is empty after wipe-all');
    assert.strictEqual(pStore.getSnapshot().currentConversationId, null, 'no active conversation after wipe-all');
  } finally {
    fs.rmSync(pruneDir, { recursive: true, force: true });
  }

  // --- Memory write log ---
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-log-'));
  try {
    const lStore = createLocalMemoryStore(logDir, 'test-model');
    lStore.setDisclosureAcknowledged(true);
    const lConv = lStore.createConversation();
    lStore.appendMessage(lConv.id, 'user', 'hello there');
    lStore.appendMessage(lConv.id, 'assistant', 'hi!', { mood: 'happy' });
    lStore.saveAsset(lConv.id, 'image', 'a test image', Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const log = lStore.getWriteLog();
    assert.ok(log.length >= 3, 'write log records message and asset captures');
    assert.strictEqual(log[0].action, 'asset', 'newest entry first');
    assert.ok(log.some(e => e.action === 'message' && e.summary.includes('mood: happy')), 'message entry records mood');
    assert.ok(log.every(e => e.at && e.id), 'entries carry timestamp and id');

    lStore.deleteConversation(lConv.id);
    const afterDelete = lStore.getWriteLog();
    assert.strictEqual(afterDelete[0].action, 'delete', 'delete is logged');

    lStore.wipeAll();
    const afterWipe = lStore.getWriteLog();
    assert.strictEqual(afterWipe.length, 1, 'wipe resets the log to a single wipe entry');
    assert.strictEqual(afterWipe[0].action, 'wipe', 'wipe entry recorded');
    assert.strictEqual(lStore.getSnapshot().disclosureAcknowledged, true, 'wipe preserves disclosure acknowledgement');
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }

  // --- Ephemeral sessions (Phase 1/2): session-only, never written to disk ---
  const ephDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-memory-eph-'));
  try {
    const eStore = createLocalMemoryStore(ephDir, 'test-model');
    eStore.setDisclosureAcknowledged(true);
    const eph = eStore.createConversation({ ephemeral: true });
    assert.strictEqual(eph.ephemeral, true, 'ephemeral conversation flagged');

    const appended = eStore.appendMessage(eph.id, 'user', 'session-only message');
    assert.strictEqual(appended.saved, true, 'ephemeral messages append');
    assert.strictEqual(appended.ephemeral, true, 'ephemeral append reported');

    // Not in the persisted snapshot.
    assert.ok(!eStore.getSnapshot().conversations.some(c => c.id === eph.id),
      'ephemeral conversation absent from persisted snapshot');
    // But retrievable by id for the live session.
    const fetched = eStore.getConversation(eph.id);
    assert.strictEqual(fetched.messages.length, 1, 'ephemeral conversation retrievable by id');
    assert.strictEqual(fetched.messages[0].content, 'session-only message');

    // Nothing on disk but the (possibly absent) state file: no conversation persisted.
    const stateFile = path.join(ephDir, 'memory.json');
    if (fs.existsSync(stateFile)) {
      const onDisk = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.ok(!onDisk.conversations.some(c => c.id === eph.id), 'ephemeral conversation not written to disk');
    }

    // Deletion drops it from memory.
    eStore.deleteConversation(eph.id);
    assert.strictEqual(eStore.getConversation(eph.id), null, 'deleted ephemeral conversation is gone');
  } finally {
    fs.rmSync(ephDir, { recursive: true, force: true });
  }

  console.log('Local memory store tests passed.');
} finally {
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
