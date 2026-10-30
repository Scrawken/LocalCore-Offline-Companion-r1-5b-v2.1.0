const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('localCore', {
  platform: process.platform,
  airGap: true,
  offlineApiUrl: 'http://127.0.0.1:11434',
  memory: {
    load: () => ipcRenderer.invoke('memory:load'),
    getConversation: conversationId => ipcRenderer.invoke('memory:get-conversation', conversationId),
    createConversation: options => ipcRenderer.invoke('memory:create-conversation', options),
    appendMessage: (conversationId, role, content, metadata) =>
      ipcRenderer.invoke('memory:append-message', conversationId, role, content, metadata),
    search: (query, options) => ipcRenderer.invoke('memory:search', query, options),
    encryptionStatus: () => ipcRenderer.invoke('memory:encryption-status'),
    prune: options => ipcRenderer.invoke('memory:prune', options),
    wipeAll: () => ipcRenderer.invoke('memory:wipe-all'),
    writeLog: limit => ipcRenderer.invoke('memory:write-log', limit),
    facts: {
      list: category => ipcRenderer.invoke('memory:facts:list', category),
      delete: id => ipcRenderer.invoke('memory:facts:delete', id),
      extract: (text, sourceMessageId) => ipcRenderer.invoke('memory:facts:extract', text, sourceMessageId)
    },
    setRememberEnabled: enabled => ipcRenderer.invoke('memory:set-remember-enabled', enabled),
    setDisclosureAcknowledged: acknowledged => ipcRenderer.invoke('memory:set-disclosure-acknowledged', acknowledged),
    saveAsset: (conversationId, type, prompt, bytes, details) =>
      ipcRenderer.invoke('memory:save-asset', conversationId, type, prompt, bytes, details),
    readAsset: assetId => ipcRenderer.invoke('memory:read-asset', assetId),
    deleteConversation: conversationId => ipcRenderer.invoke('memory:delete-conversation', conversationId)
  },
  inference: {
    modelId: () => ipcRenderer.invoke('inference:model-id'),
    status: () => ipcRenderer.invoke('inference:status'),
    chat: messages => ipcRenderer.invoke('inference:chat', messages),
    analyzeImage: (question, imageBytes, mimeType) =>
      ipcRenderer.invoke('inference:vision', question, imageBytes, mimeType),
    transcribeAudio: audioBytes => ipcRenderer.invoke('inference:transcribe', audioBytes),
    speak: text => ipcRenderer.invoke('inference:speak', text)
  },
  window: {
    getMode: () => ipcRenderer.invoke('window:get-mode'),
    setMode: mode => ipcRenderer.invoke('window:set-mode', mode)
  },
  persona: {
    list: () => ipcRenderer.invoke('persona:list'),
    active: () => ipcRenderer.invoke('persona:active'),
    systemPrompt: () => ipcRenderer.invoke('persona:system-prompt')
  },
  avatar: {
    list: () => ipcRenderer.invoke('avatar:list'),
    load: id => ipcRenderer.invoke('avatar:load', id),
    select: id => ipcRenderer.invoke('avatar:select', id),
    save: (bytes, name) => ipcRenderer.invoke('avatar:save', bytes, name)
  }
});
