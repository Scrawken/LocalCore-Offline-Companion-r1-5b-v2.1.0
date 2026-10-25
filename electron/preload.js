const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('localCore', {
  platform: process.platform,
  airGap: true,
  offlineApiUrl: 'http://127.0.0.1:11434',
  memory: {
    load: () => ipcRenderer.invoke('memory:load'),
    createConversation: () => ipcRenderer.invoke('memory:create-conversation'),
    appendMessage: (conversationId, role, content) =>
      ipcRenderer.invoke('memory:append-message', conversationId, role, content),
    setRememberEnabled: enabled => ipcRenderer.invoke('memory:set-remember-enabled', enabled),
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
  avatar: {
    list: () => ipcRenderer.invoke('avatar:list'),
    load: id => ipcRenderer.invoke('avatar:load', id),
    select: id => ipcRenderer.invoke('avatar:select', id),
    save: (bytes, name) => ipcRenderer.invoke('avatar:save', bytes, name)
  }
});
