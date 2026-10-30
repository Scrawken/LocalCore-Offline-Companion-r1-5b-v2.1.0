/**
 * Memory Facts Store — Phase 2
 *
 * The "facts" memory layer: durable, atomic facts about the user extracted from
 * conversations, stored separately from transcripts. Facts carry a category, a
 * confidence score, and a source reference. Extraction is async and validated;
 * near-duplicate facts are merged rather than stacked.
 *
 * Storage: memory/facts/facts.json inside app-data, encrypted at rest when a
 * crypto provider is supplied (same envelope as local-memory-store).
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const FACTS_FILE = 'facts.json';
const ENCRYPTION_PREFIX = 'ENC1:';
const MAX_FACT_CHARS = 300;

// Candidate fact patterns (conservative, first-person statements about the user).
// Each match yields { category, content }. This is a scaffold — a local model
// extractor can replace the regex pass later without changing the store.
const FACT_PATTERNS = [
  { category: 'preference', regex: /\b(?:i (?:really )?(?:like|love|prefer|enjoy))\b ([^.;!?]{3,80})/i },
  { category: 'dislike', regex: /\b(?:i (?:really )?(?:hate|dislike|can't stand|don't like))\b ([^.;!?]{3,80})/i },
  { category: 'fact', regex: /\b(?:i (?:am|work as|live in|have|own))\b ([^.;!?]{3,80})/i },
  { category: 'goal', regex: /\b(?:i (?:want to|plan to|'m trying to|am trying to|hope to))\b ([^.;!?]{3,80})/i },
  { category: 'name', regex: /\b(?:my name is|call me)\b ([^.;!?]{2,40})/i }
];

function normalizeFact(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function createMemoryFactsStore(factsDirectory, cryptoProvider = null) {
  const factsPath = path.join(factsDirectory, FACTS_FILE);
  fs.mkdirSync(factsDirectory, { recursive: true });

  function encryptionAvailable() {
    try {
      return Boolean(cryptoProvider && cryptoProvider.isAvailable());
    } catch {
      return false;
    }
  }

  function readState() {
    if (!fs.existsSync(factsPath)) return { schemaVersion: 1, facts: [] };
    const raw = fs.readFileSync(factsPath, 'utf8');
    let jsonText = raw;
    if (raw.startsWith(ENCRYPTION_PREFIX)) {
      if (!encryptionAvailable()) {
        throw new Error('Memory facts are encrypted but encryption is unavailable on this device.');
      }
      jsonText = cryptoProvider.decrypt(Buffer.from(raw.slice(ENCRYPTION_PREFIX.length), 'base64')).toString('utf8');
    }
    const state = JSON.parse(jsonText);
    if (state.schemaVersion !== 1 || !Array.isArray(state.facts)) {
      throw new Error('Memory facts file has an unsupported or invalid format.');
    }
    return state;
  }

  function writeState(state) {
    let text = JSON.stringify(state, null, 2);
    if (encryptionAvailable()) {
      text = ENCRYPTION_PREFIX + cryptoProvider.encrypt(text).toString('base64');
    }
    const temporaryPath = factsPath + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporaryPath, text, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporaryPath, factsPath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw error;
    }
  }

  function isDuplicate(state, category, content) {
    const normalized = normalizeFact(content);
    return state.facts.some(f =>
      f.category === category && normalizeFact(f.content) === normalized);
  }

  return {
    /**
     * Add a validated fact. Returns { added, fact } — added:false if duplicate.
     */
    addFact({ category, content, confidence = 1.0, sourceMessageId = null }) {
      if (typeof category !== 'string' || !category.trim()) throw new Error('Fact category is required.');
      if (typeof content !== 'string' || !content.trim()) throw new Error('Fact content is required.');
      if (content.length > MAX_FACT_CHARS) throw new Error('Fact content exceeds ' + MAX_FACT_CHARS + ' characters.');
      const state = readState();
      const trimmed = content.trim();
      if (isDuplicate(state, category.trim(), trimmed)) {
        return { added: false, fact: null };
      }
      const fact = {
        id: randomUUID(),
        category: category.trim(),
        content: trimmed,
        confidence: Math.max(0, Math.min(1, confidence)),
        sourceMessageId,
        createdAt: new Date().toISOString()
      };
      state.facts.push(fact);
      writeState(state);
      return { added: true, fact };
    },

    /**
     * Extract candidate facts from a user message and store them. Async scaffold:
     * runs the pattern pass, validates, dedupes. Returns the facts added.
     */
    async extractFromMessage(text, sourceMessageId = null) {
      if (typeof text !== 'string' || !text.trim()) return [];
      const added = [];
      for (const { category, regex } of FACT_PATTERNS) {
        const match = text.match(regex);
        if (!match) continue;
        const content = match[1].trim().replace(/\s+/g, ' ');
        if (content.length < 3 || content.length > MAX_FACT_CHARS) continue;
        const result = this.addFact({ category, content, confidence: 0.7, sourceMessageId });
        if (result.added) added.push(result.fact);
      }
      return added;
    },

    list(category = null) {
      const state = readState();
      return category ? state.facts.filter(f => f.category === category) : [...state.facts];
    },

    deleteFact(id) {
      const state = readState();
      const index = state.facts.findIndex(f => f.id === id);
      if (index === -1) return false;
      state.facts.splice(index, 1);
      writeState(state);
      return true;
    },

    clear() {
      writeState({ schemaVersion: 1, facts: [] });
    },

    getEncryptionStatus() {
      let onDisk = 'none';
      if (fs.existsSync(factsPath)) {
        onDisk = fs.readFileSync(factsPath, 'utf8').startsWith(ENCRYPTION_PREFIX) ? 'encrypted' : 'plaintext';
      }
      return { available: encryptionAvailable(), onDisk };
    }
  };
}

module.exports = { createMemoryFactsStore, FACT_PATTERNS, MAX_FACT_CHARS };
