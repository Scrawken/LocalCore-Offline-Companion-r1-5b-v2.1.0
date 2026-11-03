/**
 * SQLite Memory Store — Phase 2 (node:sqlite)
 *
 * A real database backing for conversation memory, replacing the flat JSON file.
 * Same public API as local-memory-store.js, plus indexed search, mood metadata,
 * and session isolation. Requires Electron 39+ (Node 22 node:sqlite).
 *
 * Schema:
 *   conversations(id, model_id, title, created_at, updated_at, ephemeral)
 *   messages(id, conversation_id, seq, role, content, mood, created_at)
 *   assets(id, conversation_id, type, prompt, file_name, mime_type, size_bytes, details, created_at)
 *   meta(key, value)  — rememberEnabled, disclosureAcknowledged, etc.
 *   write_log(id, at, action, summary, conversation_id)
 *
 * Assets remain files on disk (memory-assets/); the DB stores their metadata.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ASSET_DIRECTORY = 'memory-assets';
const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const ASSET_TYPES = {
  image: {
    formats: { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' },
    defaultMimeType: 'image/png'
  },
  audio: { extension: '.wav', mimeType: 'audio/wav' },
  video: { extension: '.gif', mimeType: 'image/gif' }
};

function createSqliteMemoryStore(userDataPath, modelId = null) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const assetsPath = path.join(userDataPath, ASSET_DIRECTORY);
  fs.mkdirSync(assetsPath, { recursive: true });
  const db = new DatabaseSync(path.join(userDataPath, 'memory.db'));

  function migrateFromJson() {
    const jsonPath = path.join(userDataPath, 'memory.json');
    const dbEmpty = db.prepare('SELECT COUNT(*) AS n FROM conversations').get().n === 0;
    if (!dbEmpty || !fs.existsSync(jsonPath)) return;
    let state;
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      if (raw.startsWith('ENC1:')) return; // encrypted JSON: skip migration (needs the app context)
      state = JSON.parse(raw);
    } catch {
      return;
    }
    if (!state || !Array.isArray(state.conversations)) return;
    const insertConv = db.prepare('INSERT OR IGNORE INTO conversations (id, model_id, title, ephemeral, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)');
    const insertMsg = db.prepare('INSERT OR IGNORE INTO messages (id, conversation_id, seq, role, content, mood, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertAsset = db.prepare('INSERT OR IGNORE INTO assets (id, conversation_id, type, prompt, file_name, mime_type, size_bytes, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    try {
      for (const conv of state.conversations) {
        insertConv.run(conv.id, conv.modelId || null, conv.title || 'New conversation', conv.createdAt || new Date().toISOString(), conv.updatedAt || new Date().toISOString());
        (conv.messages || []).forEach((m, i) => {
          insertMsg.run(m.id || randomUUID(), conv.id, i, m.role, m.content, m.metadata && m.metadata.mood ? m.metadata.mood : null, m.createdAt || new Date().toISOString());
        });
        for (const a of conv.assets || []) {
          insertAsset.run(a.id || randomUUID(), conv.id, a.type, a.prompt || '', a.fileName, a.mimeType || null, a.sizeBytes || 0, JSON.stringify(a.details || {}), a.createdAt || new Date().toISOString());
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    if (typeof state.rememberEnabled === 'boolean') setMeta('rememberEnabled', state.rememberEnabled);
    if (typeof state.disclosureAcknowledged === 'boolean') setMeta('disclosureAcknowledged', state.disclosureAcknowledged);
    if (state.currentConversationId) setMeta('currentConversationId', state.currentConversationId);
    logWrite('migrate', 'migrated ' + state.conversations.length + ' conversation(s) from JSON');
  }

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      model_id TEXT,
      title TEXT NOT NULL,
      ephemeral INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mood TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(conversation_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, seq);
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      type TEXT NOT NULL,
      prompt TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assets_conv ON assets(conversation_id);
    CREATE TABLE IF NOT EXISTS write_log (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT,
      conversation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_log_at ON write_log(at DESC);
  `);

  // --- meta helpers ---
  const getMetaStmt = db.prepare('SELECT value FROM meta WHERE key = ?');
  const setMetaStmt = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  function getMeta(key, fallback) {
    const row = getMetaStmt.get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  function setMeta(key, value) {
    setMetaStmt.run(key, JSON.stringify(value));
  }

  function getRememberEnabled() { return getMeta('rememberEnabled', true); }
  function getDisclosureAcknowledged() { return getMeta('disclosureAcknowledged', false); }

  function logWrite(action, summary, conversationId = null) {
    db.prepare('INSERT INTO write_log (id, at, action, summary, conversation_id) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), new Date().toISOString(), action, String(summary).slice(0, 160), conversationId);
  }

  // One-time migration from the legacy JSON store (memory.json), if present and
  // the DB is empty. Runs after meta helpers and logWrite are defined.
  migrateFromJson();

  function nextSeq(conversationId) {
    const row = db.prepare('SELECT COALESCE(MAX(seq), -1) + 1 AS seq FROM messages WHERE conversation_id = ?').get(conversationId);
    return row.seq;
  }

  function rowToConversation(row) {
    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC').all(row.id)
      .map(m => ({
        id: m.id, seq: m.seq, role: m.role, content: m.content, createdAt: m.created_at,
        ...(m.mood ? { metadata: { mood: m.mood } } : {})
      }));
    const assets = db.prepare('SELECT * FROM assets WHERE conversation_id = ?').all(row.id)
      .map(a => ({
        id: a.id, type: a.type, prompt: a.prompt, fileName: a.file_name, mimeType: a.mime_type,
        sizeBytes: a.size_bytes, details: a.details ? JSON.parse(a.details) : {}, createdAt: a.created_at
      }));
    return {
      id: row.id, modelId: row.model_id, title: row.title,
      ephemeral: Boolean(row.ephemeral),
      createdAt: row.created_at, updatedAt: row.updated_at,
      messages, assets
    };
  }

  return {
    getSnapshot() {
      const conversations = db.prepare('SELECT * FROM conversations WHERE ephemeral = 0 ORDER BY updated_at DESC, rowid DESC').all()
        .map(rowToConversation);
      const current = getMeta('currentConversationId', null);
      return {
        schemaVersion: 1,
        rememberEnabled: getRememberEnabled(),
        disclosureAcknowledged: getDisclosureAcknowledged(),
        currentConversationId: current,
        conversations
      };
    },

    getConversation(conversationId) {
      const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
      return row ? rowToConversation(row) : null;
    },

    createConversation(options = {}) {
      const now = new Date().toISOString();
      const id = randomUUID();
      const ephemeral = options.ephemeral ? 1 : 0;
      db.prepare('INSERT INTO conversations (id, model_id, title, ephemeral, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, modelId, 'New conversation', ephemeral, now, now);
      if (!ephemeral) setMeta('currentConversationId', id);
      return { id, modelId, title: 'New conversation', ephemeral: Boolean(ephemeral), createdAt: now, updatedAt: now, messages: [], assets: [] };
    },

    appendMessage(conversationId, role, content, metadata = null) {
      if (!['user', 'assistant'].includes(role) || typeof content !== 'string' || !content.trim()) {
        throw new Error('A non-empty user or assistant message is required.');
      }
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
      if (!conv) throw new Error('Conversation not found.');
      const ephemeral = Boolean(conv.ephemeral);
      if (!ephemeral) {
        if (!getRememberEnabled()) return { saved: false };
        if (!getDisclosureAcknowledged()) return { saved: false, blocked: 'disclosure' };
      }
      const mood = metadata && typeof metadata === 'object' && metadata.mood ? String(metadata.mood) : null;
      const now = new Date().toISOString();
      const id = randomUUID();
      const seq = nextSeq(conversationId);
      db.prepare('INSERT INTO messages (id, conversation_id, seq, role, content, mood, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, conversationId, seq, role, content, mood, now);
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
      if (role === 'user' && conv.title === 'New conversation') {
        db.prepare('UPDATE conversations SET title = ? WHERE id = ?')
          .run(content.trim().replace(/\s+/g, ' ').slice(0, 80), conversationId);
      }
      if (!ephemeral) {
        setMeta('currentConversationId', conversationId);
        logWrite('message', role + ' message saved' + (mood ? ' (mood: ' + mood + ')' : '') + ': ' + content.slice(0, 60), conversationId);
      }
      return { saved: true, ephemeral, message: { id, role, content, createdAt: now, ...(mood ? { metadata: { mood } } : {}) } };
    },

    setRememberEnabled(enabled) {
      if (typeof enabled !== 'boolean') throw new Error('Remember setting must be a boolean.');
      setMeta('rememberEnabled', enabled);
      return enabled;
    },

    setDisclosureAcknowledged(acknowledged) {
      if (typeof acknowledged !== 'boolean') throw new Error('Disclosure acknowledgement must be a boolean.');
      setMeta('disclosureAcknowledged', acknowledged);
      return acknowledged;
    },

    saveAsset(conversationId, type, prompt, bytes, details = {}) {
      const assetType = ASSET_TYPES[type];
      if (!assetType) throw new Error('Unsupported generated content type.');
      if (typeof prompt !== 'string' || !Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) {
        throw new Error('Generated content is empty or exceeds the 100 MB storage limit.');
      }
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
      if (!conv) throw new Error('Conversation not found.');
      if (!Boolean(conv.ephemeral)) {
        if (!getRememberEnabled()) return null;
        if (!getDisclosureAcknowledged()) return null;
      }
      const mimeType = assetType.formats
        ? (details.mimeType || assetType.defaultMimeType)
        : assetType.mimeType;
      const extension = assetType.formats
        ? (Object.hasOwn(assetType.formats, mimeType) ? assetType.formats[mimeType] : null)
        : assetType.extension;
      if (!extension) throw new Error('Unsupported image format.');

      const id = randomUUID();
      const fileName = id + extension;
      const filePath = path.join(assetsPath, fileName);
      fs.writeFileSync(filePath, bytes);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO assets (id, conversation_id, type, prompt, file_name, mime_type, size_bytes, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, conversationId, type, prompt, fileName, mimeType, bytes.length, JSON.stringify(details), now);
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
      if (!Boolean(conv.ephemeral)) {
        logWrite('asset', type + ' saved (' + (bytes.length / 1024).toFixed(1) + ' KB): ' + String(prompt).slice(0, 50), conversationId);
      }
      return { id, type, prompt, fileName, mimeType, sizeBytes: bytes.length, createdAt: now, details };
    },

    readAsset(assetId) {
      if (typeof assetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(assetId)) {
        throw new Error('Invalid generated content identifier.');
      }
      const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
      if (!row) throw new Error('Generated content not found.');
      return {
        mimeType: row.mime_type,
        fileName: row.file_name,
        base64: fs.readFileSync(path.join(assetsPath, row.file_name)).toString('base64')
      };
    },

    deleteConversation(conversationId) {
      const assets = db.prepare('SELECT file_name FROM assets WHERE conversation_id = ?').all(conversationId);
      db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
      db.prepare('DELETE FROM assets WHERE conversation_id = ?').run(conversationId);
      db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
      for (const asset of assets) {
        const filePath = path.join(assetsPath, asset.file_name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      if (getMeta('currentConversationId', null) === conversationId) setMeta('currentConversationId', null);
      logWrite('delete', 'conversation deleted', conversationId);
      return this.getSnapshot();
    },

    searchConversations(query, options = {}) {
      const q = (typeof query === 'string' ? query : '').trim().toLowerCase();
      const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
      if (!q) return { query: '', results: [], total: 0 };
      const like = '%' + q + '%';
      const rows = db.prepare(`
        SELECT DISTINCT c.* FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.ephemeral = 0 AND (LOWER(c.title) LIKE ? OR LOWER(m.content) LIKE ?)
        ORDER BY c.updated_at DESC LIMIT ?
      `).all(like, like, limit);
      const results = rows.map(row => {
        const matched = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND LOWER(content) LIKE ? ORDER BY seq ASC LIMIT 3')
          .all(row.id, like);
        return {
          id: row.id, title: row.title, updatedAt: row.updated_at,
          messageCount: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?').get(row.id).n,
          assetCount: db.prepare('SELECT COUNT(*) AS n FROM assets WHERE conversation_id = ?').get(row.id).n,
          titleMatch: row.title.toLowerCase().includes(q),
          matchCount: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND LOWER(content) LIKE ?').get(row.id, like).n,
          snippets: matched.map(m => {
            const idx = m.content.toLowerCase().indexOf(q);
            const start = Math.max(0, idx - 40);
            const end = Math.min(m.content.length, idx + q.length + 40);
            return {
              role: m.role, mood: m.mood || null,
              text: (start > 0 ? '…' : '') + m.content.slice(start, end) + (end < m.content.length ? '…' : '')
            };
          })
        };
      });
      return { query: q, results, total: results.length };
    },

    getWriteLog(limit = 100) {
      return db.prepare('SELECT * FROM write_log ORDER BY at DESC LIMIT ?').all(Math.max(1, Math.min(200, limit)))
        .map(r => ({ id: r.id, at: r.at, action: r.action, summary: r.summary, conversationId: r.conversation_id }));
    },

    pruneConversations(options = {}) {
      const maxConversations = Number.isFinite(options.maxConversations) ? options.maxConversations : null;
      const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : null;
      if (maxConversations === null && maxAgeDays === null) {
        throw new Error('pruneConversations requires maxConversations and/or maxAgeDays.');
      }
      const activeId = getMeta('currentConversationId', null);
      const cutoff = maxAgeDays !== null ? new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString() : null;
      let candidates = db.prepare('SELECT * FROM conversations WHERE ephemeral = 0 ORDER BY updated_at DESC').all();
      const toRemove = [];
      let kept = 0;
      for (const conv of candidates) {
        const isActive = conv.id === activeId;
        const overCount = maxConversations !== null && kept >= maxConversations;
        const overAge = cutoff !== null && conv.updated_at < cutoff;
        if (!isActive && (overCount || overAge)) toRemove.push(conv.id);
        else kept++;
      }
      for (const id of toRemove) this.deleteConversation(id);
      if (toRemove.length) logWrite('prune', 'pruned ' + toRemove.length + ' conversation(s) by retention');
      return { removed: toRemove.length, removedIds: toRemove };
    },

    wipeAll() {
      const count = db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE ephemeral = 0').get().n;
      const assets = db.prepare('SELECT file_name FROM assets').all();
      for (const asset of assets) {
        const filePath = path.join(assetsPath, asset.file_name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      db.exec('DELETE FROM messages; DELETE FROM assets; DELETE FROM conversations; DELETE FROM write_log;');
      setMeta('currentConversationId', null);
      logWrite('wipe', 'wiped all memory (' + count + ' conversation(s))');
      return { removed: count };
    },

    getEncryptionStatus() {
      // node:sqlite stores plaintext by default; SQLCipher/SEE would be needed for
      // at-rest DB encryption. Report the DB as plaintext; the JSON store's DPAPI
      // envelope does not apply here.
      return { available: false, onDisk: 'plaintext', engine: 'sqlite' };
    },

    close() {
      db.close();
    }
  };
}

module.exports = { createSqliteMemoryStore };
