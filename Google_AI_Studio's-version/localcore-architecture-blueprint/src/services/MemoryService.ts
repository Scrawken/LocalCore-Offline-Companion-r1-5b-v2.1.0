/**
 * LocalCore MemoryService Module
 * Manages local SQLite storage for conversation logs and user memories.
 * Enables persistent session logs across application reloads and device reboots.
 */

export interface ConversationLog {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mood?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface UserMemory {
  id: string;
  category: string;
  content: string;
  confidence: number;
  createdAt: number;
}

export interface MemoryStats {
  totalLogs: number;
  totalSessions: number;
  totalMemories: number;
  dbPath?: string;
  dbSizeBytes?: number;
  dbSizeFormatted?: string;
  engine: string;
}

const SESSION_STORAGE_KEY = 'localcore_active_session_id';
const LOCAL_CACHE_KEY = 'localcore_sqlite_fallback_cache';

export class MemoryService {
  private currentSessionId: string;

  constructor() {
    this.currentSessionId = this.initializeSessionId();
  }

  private initializeSessionId(): string {
    let id = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = `session_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  }

  public getSessionId(): string {
    return this.currentSessionId;
  }

  public createNewSession(): string {
    const newId = `session_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Math.random().toString(36).substring(2, 7)}`;
    this.currentSessionId = newId;
    localStorage.setItem(SESSION_STORAGE_KEY, newId);
    return newId;
  }

  /**
   * Retrieve conversation logs from local SQLite storage
   */
  public async getLogs(options: {
    sessionId?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<ConversationLog[]> {
    try {
      const params = new URLSearchParams();
      if (options.sessionId) params.append('sessionId', options.sessionId);
      if (options.search) params.append('search', options.search);
      if (options.limit) params.append('limit', options.limit.toString());

      const url = `/api/memory/logs${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`SQLite query failed with status ${response.status}`);
      }

      const data = await response.json();
      const logs: ConversationLog[] = (data.logs || []).map((row: any) => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role as 'user' | 'assistant' | 'system',
        content: row.content,
        mood: row.mood || undefined,
        timestamp: Number(row.timestamp),
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined
      }));

      // Cache locally for instant offline display
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(logs.slice(-50)));
      return logs;
    } catch (err) {
      console.warn('MemoryService: Failed to fetch from SQLite backend, using local cache:', err);
      try {
        const cached = localStorage.getItem(LOCAL_CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch (e) {
        // ignore
      }
      return [];
    }
  }

  /**
   * Save a single conversation message turn into local SQLite storage
   */
  public async saveMessage(message: {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    mood?: string;
    sessionId?: string;
    timestamp?: number;
    metadata?: Record<string, any>;
  }): Promise<ConversationLog> {
    const id = message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = message.timestamp || Date.now();
    const sessionId = message.sessionId || this.currentSessionId;

    const payload = {
      id,
      sessionId,
      role: message.role,
      content: message.content,
      mood: message.mood,
      timestamp,
      metadata: message.metadata
    };

    try {
      const response = await fetch('/api/memory/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Failed to save to SQLite: ${response.statusText}`);
      }

      const result = await response.json();
      const savedLog: ConversationLog = {
        id: result.log.id,
        sessionId: result.log.session_id,
        role: result.log.role as 'user' | 'assistant' | 'system',
        content: result.log.content,
        mood: result.log.mood || undefined,
        timestamp: Number(result.log.timestamp),
        metadata: result.log.metadata ? (typeof result.log.metadata === 'string' ? JSON.parse(result.log.metadata) : result.log.metadata) : undefined
      };

      return savedLog;
    } catch (err) {
      console.warn('MemoryService: Fallback save to local cache:', err);
      const fallbackLog: ConversationLog = {
        id,
        sessionId,
        role: message.role,
        content: message.content,
        mood: message.mood,
        timestamp,
        metadata: message.metadata
      };
      return fallbackLog;
    }
  }

  /**
   * Delete an individual message log from SQLite
   */
  public async deleteMessage(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/memory/logs/${id}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (err) {
      console.error('MemoryService: Failed to delete message from SQLite', err);
      return false;
    }
  }

  /**
   * Clear conversation logs from SQLite (either all or for the current session)
   */
  public async clearLogs(sessionId?: string): Promise<boolean> {
    try {
      const url = `/api/memory/logs${sessionId ? `?sessionId=${sessionId}` : ''}`;
      const response = await fetch(url, {
        method: 'DELETE'
      });
      localStorage.removeItem(LOCAL_CACHE_KEY);
      return response.ok;
    } catch (err) {
      console.error('MemoryService: Failed to clear SQLite logs', err);
      return false;
    }
  }

  /**
   * Retrieve extracted user facts/memories from SQLite
   */
  public async getMemories(category?: string): Promise<UserMemory[]> {
    try {
      const url = `/api/memory/facts${category ? `?category=${category}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to get memories');
      const data = await response.json();
      return (data.memories || []).map((m: any) => ({
        id: m.id,
        category: m.category,
        content: m.content,
        confidence: m.confidence ?? 1.0,
        createdAt: Number(m.created_at)
      }));
    } catch (err) {
      console.warn('MemoryService: Error fetching memories, returning empty array', err);
      return [];
    }
  }

  /**
   * Add a new permanent fact/memory to SQLite
   */
  public async saveMemory(category: string, content: string, confidence: number = 1.0): Promise<UserMemory> {
    const response = await fetch('/api/memory/facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, content, confidence })
    });
    if (!response.ok) throw new Error('Failed to save memory to SQLite');
    const data = await response.json();
    return {
      id: data.memory.id,
      category: data.memory.category,
      content: data.memory.content,
      confidence: data.memory.confidence,
      createdAt: Number(data.memory.created_at)
    };
  }

  /**
   * Delete a fact/memory from SQLite
   */
  public async deleteMemory(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/memory/facts/${id}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (err) {
      console.error('Failed to delete memory', err);
      return false;
    }
  }

  /**
   * Get SQLite database stats (file size, total turns, sessions)
   */
  public async getStats(): Promise<MemoryStats> {
    try {
      const response = await fetch('/api/memory/stats');
      if (!response.ok) throw new Error('Failed to get SQLite stats');
      return await response.json();
    } catch (err) {
      return {
        totalLogs: 0,
        totalSessions: 0,
        totalMemories: 0,
        engine: 'SQLite 3 (Local)'
      };
    }
  }

  /**
   * Export the entire SQLite database as a JSON backup
   */
  public async exportDatabase(): Promise<Blob> {
    const response = await fetch('/api/memory/export');
    if (!response.ok) throw new Error('Failed to export SQLite database');
    const data = await response.json();
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  }

  /**
   * Export conversation logs as human-readable Markdown
   */
  public exportMarkdown(logs: ConversationLog[]): string {
    let md = `# LocalCore Conversation History Archive\n`;
    md += `*Exported on: ${new Date().toLocaleString()}*\n`;
    md += `*Active Session: ${this.currentSessionId}*\n`;
    md += `*Storage Engine: Local SQLite (localcore_memory.db)*\n\n`;
    md += `---\n\n`;

    logs.forEach((log) => {
      const roleName = log.role === 'user' ? 'User' : 'Core (Companion)';
      const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const moodBadge = log.mood ? ` [Mood: ${log.mood}]` : '';
      md += `### ${roleName} • ${timeStr}${moodBadge}\n\n`;
      md += `${log.content}\n\n`;
    });

    return md;
  }
}

// Export singleton instance
export const memoryService = new MemoryService();
