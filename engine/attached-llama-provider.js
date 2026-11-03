/**
 * Attached Llama Provider
 *
 * A ModelProvider that talks to an ALREADY-RUNNING llama.cpp server (the one the
 * Electron main process spawns on 127.0.0.1:11434) instead of spawning its own.
 * This lets the ChatEngine stream from the app's existing inference server
 * without a second process or a second LLM lease.
 *
 * Implements the same stream(req) contract as LlamaCppProvider.
 */

function createAttachedLlamaProvider({ baseUrl, apiKey, modelId, maxTokens = 512, temperature = 0.7 }) {
  if (!baseUrl) throw new Error('AttachedLlamaProvider requires a baseUrl.');
  return {
    id: 'llama-cpp-attached',
    displayName: 'Local (llama.cpp, attached)',
    modelId: modelId || 'unknown',
    capabilities() {
      return {
        contextWindow: 4096,
        maxOutputTokens: maxTokens,
        supportsStreaming: true,
        supportsTools: false,
        supportsVision: false,
        supportsEmbeddings: false,
        minTier: 'floor',
        consumesHeavySlot: false // the app's daemon already holds the llm lease
      };
    },

    async* stream(req) {
      const messages = req.messages.map(m => ({ role: m.role, content: m.content }));
      const body = JSON.stringify({
        model: modelId,
        messages,
        max_tokens: req.maxTokens || maxTokens,
        temperature: req.temperature ?? temperature,
        stream: true
      });
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

      let response;
      try {
        response = await fetch(baseUrl + '/v1/chat/completions', {
          method: 'POST',
          headers,
          body,
          signal: req.signal
        });
      } catch (error) {
        if (error.name === 'AbortError') {
          yield { type: 'done', finishReason: 'cancelled' };
          return;
        }
        throw error;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error('Attached llama.cpp request failed (HTTP ' + response.status + '): ' + text.slice(0, 300));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // SSE events are separated by a blank line (\n\n or \r\n\r\n). Split on
      // event boundaries, not single newlines, so tokens are never lost when
      // multiple events arrive in one read or an event spans a read boundary.
      function processEvent(eventText) {
        const dataLines = eventText.split(/\r?\n/)
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trimStart());
        if (!dataLines.length) return null;
        return dataLines.join('\n');
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const eventText = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
          const data = processEvent(eventText);
          if (data === null) continue;
          if (data === '[DONE]') {
            yield { type: 'done', finishReason: 'stop' };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) yield { type: 'token', text: token };
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason) {
              yield { type: 'done', finishReason };
              return;
            }
          } catch { /* skip malformed SSE event */ }
        }
      }
      // Flush any trailing event without a closing blank line.
      const tail = processEvent(buffer);
      if (tail && tail !== '[DONE]') {
        try {
          const parsed = JSON.parse(tail);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield { type: 'token', text: token };
        } catch { /* ignore */ }
      }
      yield { type: 'done', finishReason: 'stop' };
    }
  };
}

module.exports = { createAttachedLlamaProvider };
