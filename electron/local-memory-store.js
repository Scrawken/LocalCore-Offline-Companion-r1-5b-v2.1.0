const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STATE_FILE = 'memory.json';
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

function createLocalMemoryStore(userDataPath, modelId = null) {
  const statePath = path.join(userDataPath, STATE_FILE);
  const assetsPath = path.join(userDataPath, ASSET_DIRECTORY);
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(assetsPath, { recursive: true });

  function readState() {
    if (!fs.existsSync(statePath)) {
      return {
        schemaVersion: 1,
        rememberEnabled: true,
        currentConversationId: null,
        conversations: []
      };
    }

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (state.schemaVersion !== 1 || !Array.isArray(state.conversations)) {
      throw new Error('Local memory file has an unsupported or invalid format.');
    }
    return state;
  }

  function writeState(state) {
    const temporaryPath = statePath + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { encoding: 'utf8', flag: 'wx' });
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

  function appendMessage(conversationId, role, content) {
    if (!['user', 'assistant'].includes(role) || typeof content !== 'string' || !content.trim()) {
      throw new Error('A non-empty user or assistant message is required.');
    }
    const state = readState();
    if (!state.rememberEnabled) return { saved: false };

    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found.');

    const message = { id: randomUUID(), role, content, createdAt: new Date().toISOString() };
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

  return { getSnapshot, createConversation, appendMessage, setRememberEnabled, saveAsset, readAsset, deleteConversation };
}

module.exports = { createLocalMemoryStore };
