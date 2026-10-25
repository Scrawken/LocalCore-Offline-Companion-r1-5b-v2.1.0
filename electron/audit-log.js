/**
 * Audit Log
 *
 * Phase 0 §2.7: Logging & audit schema (per P2)
 *
 * Append-only, local, encrypted (placeholder for Phase 2), user-viewable, clearable.
 * Default retention: 30 days, user-configurable.
 *
 * Note: Encryption will be added in Phase 2 S2.1. Current implementation stores
 * plaintext for development, but the structure is ready for encryption.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getPath } = require('./app-data-layout');

const AUDIT_LOG_FILE = 'egress-audit.log';
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Create audit log instance
 */
function createAuditLog(retentionDays = DEFAULT_RETENTION_DAYS) {
  const auditLogPath = path.join(getPath('logs'), AUDIT_LOG_FILE);

  /**
   * Write an audit entry
   * Phase 0 §2.7: AuditEntry schema
   */
  function write(entry) {
    const auditEntry = {
      auditId: entry.auditId || randomUUID(),
      timestamp: entry.timestamp || Date.now(),
      caller: entry.caller,
      scope: entry.scope,
      method: entry.method,
      host: entry.host,
      path: entry.path, // path only - never query string or body
      decision: entry.decision,
      denyReason: entry.denyReason,
      consentRecordId: entry.consentRecordId,
      personalDataConsent: entry.personalDataConsent,
      dataCategories: entry.dataCategories || [],
      payloadHash: entry.payloadHash, // sha-256 of body, never the body
      bytesSent: entry.bytesSent || 0,
      bytesReceived: entry.bytesReceived || 0,
      status: entry.status,
      durationMs: entry.durationMs || 0,
      error: entry.error
    };

    const line = JSON.stringify(auditEntry) + '\n';
    fs.appendFileSync(auditLogPath, line, { encoding: 'utf8' });
  }

  /**
   * Read audit entries
   */
  function read(options = {}) {
    if (!fs.existsSync(auditLogPath)) {
      return [];
    }

    const limit = options.limit || 1000;
    const since = options.since ? new Date(options.since).getTime() : 0;
    const scope = options.scope;

    const lines = fs.readFileSync(auditLogPath, 'utf8').split('\n').filter(line => line.trim());
    const entries = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Filter by timestamp
        if (entry.timestamp < since) continue;

        // Filter by scope
        if (scope && entry.scope !== scope) continue;

        entries.push(entry);

        if (entries.length >= limit) break;
      } catch (error) {
        console.error('[Audit] Failed to parse entry:', error);
      }
    }

    return entries;
  }

  /**
   * Prune old entries based on retention policy
   * Phase 0 §2.7: Pruning is auditable
   */
  function prune() {
    if (!fs.existsSync(auditLogPath)) {
      return { pruned: 0 };
    }

    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const lines = fs.readFileSync(auditLogPath, 'utf8').split('\n').filter(line => line.trim());
    const keptLines = [];
    let prunedCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp >= cutoffTime) {
          keptLines.push(line);
        } else {
          prunedCount++;
        }
      } catch (error) {
        // Keep unparseable lines for safety
        keptLines.push(line);
      }
    }

    if (prunedCount > 0) {
      const temporaryPath = auditLogPath + '.' + randomUUID() + '.tmp';
      try {
        fs.writeFileSync(temporaryPath, keptLines.join('\n') + '\n', { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporaryPath, auditLogPath);

        // Log the pruning action
        write({
          caller: 'audit-log',
          scope: 'system',
          method: 'PRUNE',
          host: 'localhost',
          path: '/audit/prune',
          decision: 'allow',
          dataCategories: [],
          durationMs: 0,
          error: `Pruned ${prunedCount} entries older than ${retentionDays} days`
        });
      } catch (error) {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        throw error;
      }
    }

    return { pruned: prunedCount };
  }

  /**
   * Clear all audit entries
   */
  function clear() {
    if (fs.existsSync(auditLogPath)) {
      fs.unlinkSync(auditLogPath);
    }

    // Log the clear action (ensure directory exists first)
    const logsDir = path.dirname(auditLogPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    write({
      caller: 'audit-log',
      scope: 'system',
      method: 'CLEAR',
      host: 'localhost',
      path: '/audit/clear',
      decision: 'allow',
      dataCategories: [],
      durationMs: 0,
      error: 'Audit log cleared by user'
    });
  }

  /**
   * Get statistics
   */
  function stats() {
    if (!fs.existsSync(auditLogPath)) {
      return { totalEntries: 0, sizeBytes: 0 };
    }

    const stats = fs.statSync(auditLogPath);
    const lines = fs.readFileSync(auditLogPath, 'utf8').split('\n').filter(line => line.trim());

    return {
      totalEntries: lines.length,
      sizeBytes: stats.size
    };
  }

  /**
   * Set retention period
   */
  function setRetentionDays(days) {
    retentionDays = days;
  }

  /**
   * Get retention period
   */
  function getRetentionDays() {
    return retentionDays;
  }

  return {
    write,
    read,
    prune,
    clear,
    stats,
    setRetentionDays,
    getRetentionDays
  };
}

module.exports = {
  createAuditLog,
  DEFAULT_RETENTION_DAYS
};
