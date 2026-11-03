/**
 * Memory Summaries Store — Phase 2 S2.4
 *
 * Rolling summaries of past conversation ranges. Each summary covers a
 * contiguous seq range of a conversation's turns and never overlaps another
 * summary for the same conversation. Summaries are retained until deleted
 * (not subject to the transcript retention window) and are encrypted at rest
 * when a crypto provider is supplied.
 *
 * Storage: memory/summaries/summaries.json inside app-data.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const SUMMARIES_FILE = 'summaries.json';
const ENCRYPTION_PREFIX = 'ENC1:';
const MAX_SUMMARY_CHARS = 2000;

function createMemorySummariesStore(summariesDirectory, cryptoProvider = null) {
  const summariesPath = path.join(summariesDirectory, SUMMARIES_FILE);
  fs.mkdirSync(summariesDirectory, { recursive: true });

  function encryptionAvailable() {
    try {
      return Boolean(cryptoProvider && cryptoProvider.isAvailable());
    } catch {
      return false;
    }
  }

  function readState() {
    if (!fs.existsSync(summariesPath)) return { schemaVersion: 1, summaries: [] };
    const raw = fs.readFileSync(summariesPath, 'utf8');
    let jsonText = raw;
    if (raw.startsWith(ENCRYPTION_PREFIX)) {
      if (!encryptionAvailable()) {
        throw new Error('Memory summaries are encrypted but encryption is unavailable on this device.');
      }
      jsonText = cryptoProvider.decrypt(Buffer.from(raw.slice(ENCRYPTION_PREFIX.length), 'base64')).toString('utf8');
    }
    const state = JSON.parse(jsonText);
    if (state.schemaVersion !== 1 || !Array.isArray(state.summaries)) {
      throw new Error('Memory summaries file has an unsupported or invalid format.');
    }
    return state;
  }

  function writeState(state) {
    let text = JSON.stringify(state, null, 2);
    if (encryptionAvailable()) {
      text = ENCRYPTION_PREFIX + cryptoProvider.encrypt(text).toString('base64');
    }
    const temporaryPath = summariesPath + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporaryPath, text, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporaryPath, summariesPath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw error;
    }
  }

  // Check overlap: [fromSeq, toSeq] must not intersect any existing summary for
  // the same conversation.
  function overlaps(state, conversationId, fromSeq, toSeq) {
    return state.summaries.some(s =>
      s.conversationId === conversationId &&
      fromSeq <= s.coversToSeq && toSeq >= s.coversFromSeq);
  }

  return {
    /**
     * Add a summary. Rejects overlapping seq ranges for the same conversation.
     * Returns { added, summary } — added:false with reason on overlap.
     */
    addSummary({ conversationId, coversFromSeq, coversToSeq, content, characterId = null, tokenCount = null }) {
      if (!conversationId) throw new Error('conversationId is required.');
      if (!Number.isInteger(coversFromSeq) || !Number.isInteger(coversToSeq) || coversFromSeq > coversToSeq) {
        throw new Error('coversFromSeq/coversToSeq must be integers with from <= to.');
      }
      if (typeof content !== 'string' || !content.trim()) throw new Error('Summary content is required.');
      if (content.length > MAX_SUMMARY_CHARS) throw new Error('Summary exceeds ' + MAX_SUMMARY_CHARS + ' characters.');

      const state = readState();
      if (overlaps(state, conversationId, coversFromSeq, coversToSeq)) {
        return { added: false, reason: 'overlap', summary: null };
      }
      const summary = {
        id: randomUUID(),
        conversationId,
        characterId,
        coversFromSeq,
        coversToSeq,
        content: content.trim(),
        tokenCount: tokenCount ?? Math.ceil(content.length / 4),
        createdAt: new Date().toISOString()
      };
      state.summaries.push(summary);
      writeState(state);
      return { added: true, summary };
    },

    // Attach or update the embedding for a summary (stored with its parent).
    setSummaryEmbedding(id, vector) {
      const state = readState();
      const summary = state.summaries.find(s => s.id === id);
      if (!summary) return false;
      summary.embedding = Array.from(vector);
      writeState(state);
      return true;
    },

    list(conversationId = null) {
      const state = readState();
      const all = conversationId ? state.summaries.filter(s => s.conversationId === conversationId) : [...state.summaries];
      // Deterministic: by conversation, then fromSeq.
      return all.sort((a, b) =>
        (a.conversationId < b.conversationId ? -1 : a.conversationId > b.conversationId ? 1 : 0) ||
        (a.coversFromSeq - b.coversFromSeq));
    },

    // Coverage: which seq ranges are summarized for a conversation.
    coverage(conversationId) {
      return this.list(conversationId).map(s => ({ from: s.coversFromSeq, to: s.coversToSeq }));
    },

    deleteSummary(id) {
      const state = readState();
      const index = state.summaries.findIndex(s => s.id === id);
      if (index === -1) return false;
      state.summaries.splice(index, 1);
      writeState(state);
      return true;
    },

    deleteForConversation(conversationId) {
      const state = readState();
      const before = state.summaries.length;
      state.summaries = state.summaries.filter(s => s.conversationId !== conversationId);
      writeState(state);
      return before - state.summaries.length;
    },

    clear() {
      writeState({ schemaVersion: 1, summaries: [] });
    },

    getEncryptionStatus() {
      let onDisk = 'none';
      if (fs.existsSync(summariesPath)) {
        onDisk = fs.readFileSync(summariesPath, 'utf8').startsWith(ENCRYPTION_PREFIX) ? 'encrypted' : 'plaintext';
      }
      return { available: encryptionAvailable(), onDisk };
    }
  };
}

module.exports = { createMemorySummariesStore, MAX_SUMMARY_CHARS };
