/**
 * ChatEngine — Phase 1 Streaming Chat Contract
 *
 * Wraps a ModelProvider's streaming completion with the blueprint's chat
 * contract:
 *   - send(text)      → streams ChatEvent objects for a new user turn
 *   - cancel()        → keeps the user turn, discards the in-flight assistant turn
 *   - regenerate()    → discards the last assistant turn, re-streams for the last user turn
 *
 * Turn model: each turn has { id, seq, role, status, modelId, text }.
 *   status: 'streaming' | 'complete' | 'cancelled' | 'error'
 *
 * ChatEvent objects emitted to subscribers:
 *   { type: 'turn-start', turn }
 *   { type: 'token', turnId, text }         (assistant streaming)
 *   { type: 'turn-end', turn }              (status complete/cancelled/error)
 *   { type: 'error', turnId, message }
 *
 * The engine is transport-agnostic: it consumes provider.stream(req) and does
 * not touch IPC, DOM, or persistence. Those layers subscribe to events.
 */

const { randomUUID } = require('crypto');

function createChatEngine(provider, options = {}) {
  if (!provider || typeof provider.stream !== 'function') {
    throw new Error('ChatEngine requires a ModelProvider with a stream(req) method.');
  }
  const modelId = options.modelId || provider.modelId || 'unknown';
  const maxTokens = options.maxTokens || 512;
  const temperature = options.temperature ?? 0.7;

  /** @type {Array<{id:string,seq:number,role:string,status:string,modelId:string,text:string}>} */
  const turns = [];
  let seq = 0;
  let activeController = null;   // AbortController for the in-flight assistant turn
  let activeTurnId = null;
  const subscribers = new Set();

  function emit(event) {
    for (const handler of subscribers) {
      try { handler(event); } catch { /* subscriber errors must not break the stream */ }
    }
  }

  function addTurn(role, status) {
    const turn = {
      id: randomUUID(),
      seq: seq++,
      role,
      status,
      modelId,
      text: ''
    };
    turns.push(turn);
    return turn;
  }

  function getTurn(turnId) {
    return turns.find(t => t.id === turnId) || null;
  }

  function lastTurnByRole(role) {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === role) return turns[i];
    }
    return null;
  }

  function toProviderMessages() {
    // Only completed/streaming turns become model context; cancelled/error turns
    // are excluded so a discarded assistant turn never reaches the model.
    return turns
      .filter(t => t.status === 'complete' || t.status === 'streaming')
      .map(t => ({ role: t.role, content: t.text }));
  }

  async function streamAssistant(userTurn) {
    const assistantTurn = addTurn('assistant', 'streaming');
    activeTurnId = assistantTurn.id;
    activeController = new AbortController();
    emit({ type: 'turn-start', turn: { ...assistantTurn } });

    const messages = toProviderMessages();
    try {
      for await (const chunk of provider.stream({
        messages,
        maxTokens,
        temperature,
        signal: activeController.signal
      })) {
        if (chunk.type === 'token') {
          assistantTurn.text += chunk.text;
          emit({ type: 'token', turnId: assistantTurn.id, text: chunk.text });
        } else if (chunk.type === 'done') {
          if (chunk.finishReason === 'cancelled') {
            assistantTurn.status = 'cancelled';
          } else if (assistantTurn.status === 'streaming') {
            assistantTurn.status = 'complete';
          }
        }
      }
      if (assistantTurn.status === 'streaming') assistantTurn.status = 'complete';
    } catch (error) {
      assistantTurn.status = 'error';
      emit({ type: 'error', turnId: assistantTurn.id, message: error.message });
    } finally {
      activeController = null;
      activeTurnId = null;
      emit({ type: 'turn-end', turn: { ...assistantTurn } });
    }
    return assistantTurn;
  }

  return {
    /** Subscribe to ChatEvent objects. Returns an unsubscribe function. */
    subscribe(handler) {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },

    /** Read-only view of the turn list. */
    getTurns() {
      return turns.map(t => ({ ...t }));
    },

    /**
     * Send a user message and stream the assistant reply.
     * Returns the completed/cancelled/error assistant turn.
     */
    async send(text) {
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Cannot send an empty message.');
      }
      if (activeController) {
        throw new Error('A response is already streaming. Cancel it before sending again.');
      }
      const userTurn = addTurn('user', 'complete');
      userTurn.text = text;
      emit({ type: 'turn-start', turn: { ...userTurn } });
      emit({ type: 'turn-end', turn: { ...userTurn } });
      return streamAssistant(userTurn);
    },

    /**
     * Cancel the in-flight assistant turn. The user turn is kept; the assistant
     * turn is marked cancelled and excluded from future model context.
     */
    cancel() {
      if (activeController) {
        activeController.abort();
        return true;
      }
      return false;
    },

    /**
     * Regenerate the last assistant reply: discard the last assistant turn and
     * re-stream for the most recent user turn.
     */
    async regenerate() {
      if (activeController) {
        throw new Error('A response is already streaming. Cancel it before regenerating.');
      }
      const lastAssistant = lastTurnByRole('assistant');
      if (lastAssistant) {
        lastAssistant.status = 'cancelled';
        emit({ type: 'turn-end', turn: { ...lastAssistant } });
      }
      const lastUser = lastTurnByRole('user');
      if (!lastUser) throw new Error('No user turn to regenerate from.');
      return streamAssistant(lastUser);
    },

    /** True while an assistant turn is streaming. */
    isStreaming() {
      return activeController !== null;
    },

    /**
     * Seed prior conversation context without streaming. Used when the engine
     * wraps an existing transcript (e.g. the streaming IPC path). Each message
     * becomes a complete turn so toProviderMessages() includes it.
     */
    seedContext(messages) {
      for (const m of messages) {
        if (!m || !['system', 'user', 'assistant'].includes(m.role)) continue;
        const turn = addTurn(m.role, 'complete');
        turn.text = typeof m.content === 'string' ? m.content : '';
      }
    },

    /** Clear all turns (new session). */
    reset() {
      if (activeController) activeController.abort();
      turns.length = 0;
      seq = 0;
    }
  };
}

module.exports = { createChatEngine };
