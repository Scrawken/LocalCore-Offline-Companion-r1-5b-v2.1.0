(function exposeChatContext(root) {
  function messagesForModel(conversation, modelId) {
    if (!conversation || !Array.isArray(conversation.messages) ||
        typeof modelId !== 'string' || conversation.modelId !== modelId) {
      return [];
    }
    return conversation.messages.map(({ role, content }) => ({ role, content }));
  }

  const api = { messagesForModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.localCoreChatContext = api;
})(globalThis);
