/**
 * Action Audit Log — Phase 5 §4
 *
 * Append-only, local record of every brokered action — approved, denied, or
 * failed. Follows the same append-only JSON-lines pattern as the egress audit
 * log. Every consequential action is audited, whether approved or denied.
 */

const fs = require('fs');
const path = require('path');
const { getPath } = require('./app-data-layout');

const ACTION_AUDIT_FILE = 'action-audit.log';

function createActionAuditLog() {
  const logPath = path.join(getPath('logs'), ACTION_AUDIT_FILE);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  return {
    async record(entry) {
      const line = JSON.stringify({
        timestamp: Date.now(),
        auditId: entry.auditId,
        toolId: entry.toolId,
        origin: entry.origin,
        status: entry.status,       // executed | denied | failed | cancelled
        scope: entry.scope,
        approval: entry.approval,   // allow-once | allow-session | allow-always | null
        preview: entry.preview,
        output: entry.output,
        error: entry.error
      });
      fs.appendFileSync(logPath, line + '\n', 'utf8');
    },

    list(limit = 100) {
      if (!fs.existsSync(logPath)) return [];
      const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(l => l.trim());
      return lines.slice(-limit).map(l => JSON.parse(l)).reverse(); // newest first
    },

    clear() {
      if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    },

    path: logPath
  };
}

module.exports = { createActionAuditLog };
