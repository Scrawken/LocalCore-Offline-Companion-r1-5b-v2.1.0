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
    summaries: {
      list: conversationId => ipcRenderer.invoke('memory:summaries:list', conversationId),
      delete: id => ipcRenderer.invoke('memory:summaries:delete', id)
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
    chatStream: (messages, streamId) => ipcRenderer.invoke('inference:chat-stream', messages, streamId),
    chatCancel: streamId => ipcRenderer.invoke('inference:chat-cancel', streamId),
    onChatThinking: handler => {
      const listener = (_event, data) => handler(data);
      ipcRenderer.on('inference:chat-thinking', listener);
      return () => ipcRenderer.removeListener('inference:chat-thinking', listener);
    },
    onChatToken: handler => {
      const listener = (_event, data) => handler(data);
      ipcRenderer.on('inference:chat-token', listener);
      return () => ipcRenderer.removeListener('inference:chat-token', listener);
    },
    onChatEnd: handler => {
      const listener = (_event, data) => handler(data);
      ipcRenderer.on('inference:chat-end', listener);
      return () => ipcRenderer.removeListener('inference:chat-end', listener);
    },
    onChatError: handler => {
      const listener = (_event, data) => handler(data);
      ipcRenderer.on('inference:chat-error', listener);
      return () => ipcRenderer.removeListener('inference:chat-error', listener);
    },
    analyzeImage: (question, imageBytes, mimeType) =>
      ipcRenderer.invoke('inference:vision', question, imageBytes, mimeType),
    transcribeAudio: audioBytes => ipcRenderer.invoke('inference:transcribe', audioBytes),
    speak: text => ipcRenderer.invoke('inference:speak', text)
  },
  window: {
    getMode: () => ipcRenderer.invoke('window:get-mode'),
    setMode: mode => ipcRenderer.invoke('window:set-mode', mode)
  },
  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
    invoke: req => ipcRenderer.invoke('tools:invoke', req),
    preview: req => ipcRenderer.invoke('tools:preview', req),
    grantScope: (toolId, scope, origin) => ipcRenderer.invoke('tools:grant-scope', toolId, scope, origin),
    addRoot: (rootPath, mode) => ipcRenderer.invoke('tools:add-root', rootPath, mode),
    audit: limit => ipcRenderer.invoke('tools:audit', limit),
    undo: undoRef => ipcRenderer.invoke('tools:undo', undoRef),
    onApprovalRequest: handler => {
      const listener = (_event, data) => handler(data);
      ipcRenderer.on('tools:approval-request', listener);
      return () => ipcRenderer.removeListener('tools:approval-request', listener);
    },
    respondToApproval: (promptId, decision) => ipcRenderer.invoke('tools:approval-response', promptId, decision)
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
