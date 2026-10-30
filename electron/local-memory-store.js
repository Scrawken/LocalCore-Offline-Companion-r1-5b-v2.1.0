const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STATE_FILE = 'memory.json';
const ENCRYPTION_PREFIX = 'ENC1:';
const ASSET_DIRECTORY = 'memory-assets';
const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const ASSET_TYPES = {
  image: {
    formats: {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp'
    },
    defaultMimeType: 'image/png'
  },
  audio: { extension: '.wav', mimeType: 'audio/wav' },
  video: { extension: '.gif', mimeType: 'image/gif' }
};

// cryptoProvider is optional. When present and available, memory.json is
// encrypted at rest (Electron safeStorage / Windows DPAPI). Shape:
//   { isAvailable(): boolean, encrypt(utf8String): Buffer, decrypt(Buffer): utf8String }
// When absent or unavailable, the store reads/writes plaintext and reports
// encryptionAvailable:false. Plaintext files are migrated to encrypted form on
// first read once encryption is available.
function createLocalMemoryStore(userDataPath, modelId = null, cryptoProvider = null) {
  const statePath = path.join(userDataPath, STATE_FILE);
  const assetsPath = path.join(userDataPath, ASSET_DIRECTORY);
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(assetsPath, { recursive: true });

  function encryptionAvailable() {
    try {
      return Boolean(cryptoProvider && cryptoProvider.isAvailable());
    } catch {
      return false;
    }
  }

  function readState() {
    if (!fs.existsSync(statePath)) {
      return {
        schemaVersion: 1,
        rememberEnabled: true,
        currentConversationId: null,
        conversations: []
      };
    }

    const raw = fs.readFileSync(statePath, 'utf8');
    let jsonText = raw;
    let wasEncrypted = raw.startsWith(ENCRYPTION_PREFIX);
    if (wasEncrypted) {
      if (!encryptionAvailable()) {
        throw new Error('Local memory is encrypted but encryption is unavailable on this device.');
      }
      const ciphertext = Buffer.from(raw.slice(ENCRYPTION_PREFIX.length), 'base64');
      jsonText = cryptoProvider.decrypt(ciphertext).toString('utf8');
    }

    const state = JSON.parse(jsonText);
    if (state.schemaVersion !== 1 || !Array.isArray(state.conversations)) {
      throw new Error('Local memory file has an unsupported or invalid format.');
    }

    // Transparent migration: a plaintext file becomes encrypted on first read
    // once encryption is available.
    if (!wasEncrypted && encryptionAvailable()) {
      writeState(state);
    }
    return state;
  }

  function writeState(state) {
    let text = JSON.stringify(state, null, 2);
    if (encryptionAvailable()) {
      text = ENCRYPTION_PREFIX + cryptoProvider.encrypt(text).toString('base64');
    }
    const temporaryPath = statePath + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporaryPath, text, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporaryPath, statePath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw error;
    }
  }

  function getSnapshot() {
    return readState();
  }

  function createConversation() {
    const state = readState();
    const now = new Date().toISOString();
    const conversation = {
      id: randomUUID(),
      avatarId: 'default',
      ...(modelId ? { modelId } : {}),
      title: 'New conversation',
      createdAt: now,
      updatedAt: now,
      messages: [],
      assets: []
    };
    state.conversations.unshift(conversation);
    state.currentConversationId = conversation.id;
    writeState(state);
    return conversation;
  }

  function appendMessage(conversationId, role, content, metadata = null) {
    if (!['user', 'assistant'].includes(role) || typeof content !== 'string' || !content.trim()) {
      throw new Error('A non-empty user or assistant message is required.');
    }
    const state = readState();
    if (!state.rememberEnabled) return { saved: false };

    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');

    const message = { id: randomUUID(), role, content, createdAt: new Date().toISOString() };
    // Optional metadata (e.g. detected mood for assistant messages). Only plain
    // objects are stored; anything else is dropped to keep the file clean.
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const clean = {};
      for (const [key, value] of Object.entries(metadata)) {
        if (value == null) continue;
        if (['string', 'number', 'boolean'].includes(typeof value)) clean[key] = value;
      }
      if (Object.keys(clean).length) message.metadata = clean;
    }
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    if (role === 'user' && conversation.title === 'New conversation') {
      conversation.title = content.trim().replace(/\s+/g, ' ').slice(0, 80);
    }
    state.currentConversationId = conversation.id;
    writeState(state);
    return { saved: true, message };
  }

  function setRememberEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Remember setting must be a boolean.');
    const state = readState();
    state.rememberEnabled = enabled;
    writeState(state);
    return state.rememberEnabled;
  }

  function saveAsset(conversationId, type, prompt, bytes, details = {}) {
    const assetType = ASSET_TYPES[type];
    if (!assetType) throw new Error('Unsupported generated content type.');
    if (typeof prompt !== 'string' || !Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) {
      throw new Error('Generated content is empty or exceeds the 100 MB storage limit.');
    }
    const mimeType = assetType.formats
      ? (details.mimeType || assetType.defaultMimeType)
      : assetType.mimeType;
    const extension = assetType.formats
      ? (Object.hasOwn(assetType.formats, mimeType) ? assetType.formats[mimeType] : null)
      : assetType.extension;
    if (!extension) throw new Error('Unsupported image format.');

    const state = readState();
    if (!state.rememberEnabled) return null;
    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');

    const id = randomUUID();
    const fileName = id + extension;
    const filePath = path.join(assetsPath, fileName);
    const temporaryPath = filePath + '.tmp';
    try {
      fs.writeFileSync(temporaryPath, bytes, { flag: 'wx' });
      fs.renameSync(temporaryPath, filePath);
      const asset = {
        id,
        type,
        prompt,
        fileName,
        mimeType,
        sizeBytes: bytes.length,
        createdAt: new Date().toISOString(),
        details
      };
      conversation.assets.push(asset);
      conversation.updatedAt = asset.createdAt;
      state.currentConversationId = conversation.id;
      writeState(state);
      return asset;
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw error;
    }
  }

  function readAsset(assetId) {
    if (typeof assetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(assetId)) {
      throw new Error('Invalid generated content identifier.');
    }
    const state = readState();
    for (const conversation of state.conversations) {
      const asset = conversation.assets.find(item => item.id === assetId);
      if (asset) {
        return {
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          base64: fs.readFileSync(path.join(assetsPath, asset.fileName)).toString('base64')
        };
      }
    }
    throw new Error('Generated content not found.');
  }

  function deleteConversation(conversationId) {
    const state = readState();
    const index = state.conversations.findIndex(item => item.id === conversationId);
    if (index === -1) throw new Error('Conversation not found.');

    const [conversation] = state.conversations.splice(index, 1);
    if (state.currentConversationId === conversationId) state.currentConversationId = null;
    writeState(state);
    for (const asset of conversation.assets) {
      const filePath = path.join(assetsPath, asset.fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    return getSnapshot();
  }

  function deleteAssetFiles(conversation) {
    for (const asset of conversation.assets || []) {
      const filePath = path.join(assetsPath, asset.fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  // Retention: prune old conversations beyond a count cap and/or older than a
  // max age. The active conversation is never pruned. Returns what was removed.
  function pruneConversations(options = {}) {
    const maxConversations = Number.isFinite(options.maxConversations) ? options.maxConversations : null;
    const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : null;
    if (maxConversations === null && maxAgeDays === null) {
      throw new Error('pruneConversations requires maxConversations and/or maxAgeDays.');
    }
    const state = readState();
    const cutoff = maxAgeDays !== null ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 : null;
    const activeId = state.currentConversationId;

    const keep = [];
    const removed = [];
    // conversations are stored newest-first (unshift on create).
    for (const conversation of state.conversations) {
      const isActive = conversation.id === activeId;
      const overCount = maxConversations !== null && keep.length >= maxConversations;
      const overAge = cutoff !== null && new Date(conversation.updatedAt).getTime() < cutoff;
      if (!isActive && (overCount || overAge)) {
        removed.push(conversation);
      } else {
        keep.push(conversation);
      }
    }
    if (!removed.length) return { removed: 0, removedIds: [] };

    state.conversations = keep;
    writeState(state);
    for (const conversation of removed) deleteAssetFiles(conversation);
    return { removed: removed.length, removedIds: removed.map(c => c.id) };
  }

  // Wipe-all: delete every conversation and its generated files in one call.
  function wipeAll() {
    const state = readState();
    const removed = state.conversations.length;
    for (const conversation of state.conversations) deleteAssetFiles(conversation);
    writeState({
      schemaVersion: 1,
      rememberEnabled: state.rememberEnabled,
      currentConversationId: null,
      conversations: []
    });
    return { removed };
  }

  // Server-side search: filters conversations in the main process and returns
  // only matches (with a short match context), so the renderer does not need to
  // load the entire history to search. Matches title and message content.
  function searchConversations(query, options = {}) {
    const q = (typeof query === 'string' ? query : '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    const state = readState();
    if (!q) {
      return { query: '', results: [], total: 0 };
    }
    const results = [];
    for (const conversation of state.conversations) {
      const titleMatch = conversation.title.toLowerCase().includes(q);
      const matchedMessages = conversation.messages.filter(message =>
        message.content.toLowerCase().includes(q));
      if (!titleMatch && matchedMessages.length === 0) continue;
      results.push({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        assetCount: conversation.assets.length,
        titleMatch,
        matchCount: matchedMessages.length,
        // Short snippets around the first few matches for preview.
        snippets: matchedMessages.slice(0, 3).map(message => {
          const content = message.content;
          const index = content.toLowerCase().indexOf(q);
          const start = Math.max(0, index - 40);
          const end = Math.min(content.length, index + q.length + 40);
          return {
            role: message.role,
            mood: message.metadata && message.metadata.mood ? message.metadata.mood : null,
            text: (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
          };
        })
      });
      if (results.length >= limit) break;
    }
    return { query: q, results, total: results.length };
  }

  function getEncryptionStatus() {
    let onDisk = 'none';
    if (fs.existsSync(statePath)) {
      onDisk = fs.readFileSync(statePath, 'utf8').startsWith(ENCRYPTION_PREFIX) ? 'encrypted' : 'plaintext';
    }
    return { available: encryptionAvailable(), onDisk };
  }

  return { getSnapshot, createConversation, appendMessage, setRememberEnabled, saveAsset, readAsset, deleteConversation, searchConversations, getEncryptionStatus, pruneConversations, wipeAll };
}

module.exports = { createLocalMemoryStore };
