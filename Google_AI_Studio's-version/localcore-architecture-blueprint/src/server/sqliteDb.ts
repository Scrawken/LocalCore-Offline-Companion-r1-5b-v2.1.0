import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

export interface SqliteConversationLog {
  id: string;
  session_id: string;
  role: string;
  content: string;
  mood?: string | null;
  timestamp: number;
  metadata?: string | null;
}

export interface SqliteMemory {
  id: string;
  category: string;
  content: string;
  confidence: number;
  created_at: number;
  source_message_id?: string | null;
}

// Database location: stored on local device root or data folder
const DB_PATH = path.resolve(process.cwd(), 'localcore_memory.db');

let db: DatabaseSync;

export function initSqliteDatabase(): DatabaseSync {
  if (db) return db;

  db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for high concurrency and resilience
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // 1. Conversation logs table (per-turn chat history with session isolation)
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mood TEXT,
      timestamp INTEGER NOT NULL,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_session ON conversation_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON conversation_logs(timestamp);
  `);

  // 2. User memories table (extracted facts, user preferences, SQLite persistent bank)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      source_message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  `);

  // Seed default companion memory facts if table is empty
  const countRow = db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
  if (countRow.count === 0) {
    const seedStmt = db.prepare(`
      INSERT INTO memories (id, category, content, confidence, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    seedStmt.run('mem_init_1', 'preference', 'Prefers TypeScript, modern React hooks, and clean architecture', 1.0, now - 86400000);
    seedStmt.run('mem_init_2', 'aesthetic', 'Prefers anime humanoid female companion aesthetics with 12 expressive moods', 1.0, now - 43200000);
    seedStmt.run('mem_init_3', 'storage', 'Demands 100% local-first data sovereignty; all conversation logs and memories stored in local SQLite', 1.0, now);
  }

  // Seed initial welcome message if conversation_logs is empty
  const logCountRow = db.prepare('SELECT COUNT(*) as count FROM conversation_logs').get() as { count: number };
  if (logCountRow.count === 0) {
    const seedLogStmt = db.prepare(`
      INSERT INTO conversation_logs (id, session_id, role, content, mood, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    seedLogStmt.run(
      'log_welcome_1',
      'session_default',
      'assistant',
      'Hello! I am Core, your local-first Windows companion. Our conversations are persisted directly in local SQLite on your PC.',
      'cheerful',
      Date.now(),
      JSON.stringify({ source: 'system_init' })
    );
  }

  return db;
}

// Conversation Log Methods
export function insertConversationLog(log: {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  mood?: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}): SqliteConversationLog {
  const database = initSqliteDatabase();
  const timestamp = log.timestamp || Date.now();
  const metadataStr = log.metadata ? JSON.stringify(log.metadata) : null;

  const stmt = database.prepare(`
    INSERT OR REPLACE INTO conversation_logs (id, session_id, role, content, mood, timestamp, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(log.id, log.sessionId, log.role, log.content, log.mood || null, timestamp, metadataStr);

  return {
    id: log.id,
    session_id: log.sessionId,
    role: log.role,
    content: log.content,
    mood: log.mood || null,
    timestamp,
    metadata: metadataStr
  };
}

export function getConversationLogs(filter: {
  sessionId?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): SqliteConversationLog[] {
  const database = initSqliteDatabase();
  const { sessionId, search, limit = 100, offset = 0 } = filter;

  let query = 'SELECT * FROM conversation_logs WHERE 1=1';
  const params: any[] = [];

  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }

  if (search && search.trim()) {
    query += ' AND content LIKE ?';
    params.push(`%${search.trim()}%`);
  }

  query += ' ORDER BY timestamp ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return database.prepare(query).all(...params) as unknown as SqliteConversationLog[];
}

export function deleteConversationLog(id: string): boolean {
  const database = initSqliteDatabase();
  const stmt = database.prepare('DELETE FROM conversation_logs WHERE id = ?');
  const result = stmt.run(id);
  return (result as any).changes > 0;
}

export function clearConversationLogs(sessionId?: string): number {
  const database = initSqliteDatabase();
  if (sessionId) {
    const stmt = database.prepare('DELETE FROM conversation_logs WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return (result as any).changes || 0;
  } else {
    const stmt = database.prepare('DELETE FROM conversation_logs');
    const result = stmt.run();
    return (result as any).changes || 0;
  }
}

// User Memories Methods
export function insertMemory(memory: {
  id?: string;
  category: string;
  content: string;
  confidence?: number;
}): SqliteMemory {
  const database = initSqliteDatabase();
  const id = memory.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const confidence = memory.confidence ?? 1.0;
  const createdAt = Date.now();

  const stmt = database.prepare(`
    INSERT OR REPLACE INTO memories (id, category, content, confidence, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, memory.category, memory.content, confidence, createdAt);

  return {
    id,
    category: memory.category,
    content: memory.content,
    confidence,
    created_at: createdAt
  };
}

export function getMemories(category?: string): SqliteMemory[] {
  const database = initSqliteDatabase();
  if (category) {
    return database
      .prepare('SELECT * FROM memories WHERE category = ? ORDER BY created_at DESC')
      .all(category) as unknown as SqliteMemory[];
  }
  return database
    .prepare('SELECT * FROM memories ORDER BY created_at DESC')
    .all() as unknown as SqliteMemory[];
}

export function deleteMemory(id: string): boolean {
  const database = initSqliteDatabase();
  const stmt = database.prepare('DELETE FROM memories WHERE id = ?');
  const result = stmt.run(id);
  return (result as any).changes > 0;
}

// System Database Stats & Export
export function getDatabaseStats() {
  const database = initSqliteDatabase();
  const totalLogs = (database.prepare('SELECT COUNT(*) as count FROM conversation_logs').get() as any).count;
  const totalSessions = (database.prepare('SELECT COUNT(DISTINCT session_id) as count FROM conversation_logs').get() as any).count;
  const totalMemories = (database.prepare('SELECT COUNT(*) as count FROM memories').get() as any).count;
  
  let dbSizeBytes = 0;
  try {
    const stats = fs.statSync(DB_PATH);
    dbSizeBytes = stats.size;
  } catch (e) {
    // ignore
  }

  return {
    totalLogs,
    totalSessions,
    totalMemories,
    dbPath: DB_PATH,
    dbSizeBytes,
    dbSizeFormatted: (dbSizeBytes / 1024).toFixed(1) + ' KB',
    engine: 'SQLite 3 (node:sqlite WAL mode)'
  };
}

export function exportAllData() {
  const database = initSqliteDatabase();
  const logs = database.prepare('SELECT * FROM conversation_logs ORDER BY timestamp ASC').all();
  const memories = database.prepare('SELECT * FROM memories ORDER BY created_at ASC').all();
  const stats = getDatabaseStats();

  return {
    exportedAt: new Date().toISOString(),
    stats,
    conversationLogs: logs,
    userMemories: memories
  };
}
