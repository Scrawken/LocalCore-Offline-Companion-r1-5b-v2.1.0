/**
 * Egress Gateway
 *
 * Phase 0 §2: Egress Gateway contract
 *
 * The single network choke point for all outbound traffic.
 * Deny by default, require consent, log every attempt.
 *
 * Invariants (Phase 0 §2.1):
 * - Deny by default. No consent record means no request.
 * - Every attempt is logged, granted or denied.
 * - Personal data never leaves without preview.
 * - Persistent consent is per-scope, visible, revocable.
 * - Revocation is immediate.
 * - Renderer cannot reach network directly.
 */

const crypto = require('crypto');
const { createConsentService, DataCategory, DenyReason } = require('./consent-service');
const { createAuditLog } = require('./audit-log');

/**
 * Create Egress Gateway instance
 */
function createEgressGateway() {
  const consentService = createConsentService();
  const auditLog = createAuditLog();
  const eventListeners = new Map();

  /**
   * Emit an event to registered listeners
   */
  function emit(event, data) {
    const listeners = eventListeners.get(event) || [];
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error('[EgressGateway] Event listener error:', error);
      }
    }
  }

  /**
   * Register event listener
   * Phase 0 §2.3: EgressGateway.on()
   */
  function on(event, callback) {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, []);
    }
    eventListeners.get(event).push(callback);
  }

  /**
   * Generate redaction preview
   * Phase 0 §2.3: EgressGateway.preview()
   */
  function preview(req) {
    const fields = [];
    let containsPersonalData = false;
    let bytesEstimate = 0;

    // Analyze payload for personal data categories
    if (req.payload && req.dataCategories) {
      bytesEstimate = JSON.stringify(req.payload).length;

      for (const category of req.dataCategories) {
        if (category !== DataCategory.NONE) {
          containsPersonalData = true;
          fields.push({
            path: 'payload',
            category,
            sample: `[${category} data]`,
            redactable: true
          });
        }
      }
    }

    return {
      fields,
      bytesEstimate,
      containsPersonalData
    };
  }

  /**
   * Check consent without sending (dry run)
   * Phase 0 §2.3: EgressGateway.check()
   */
  async function check(req) {
    const resolution = consentService.resolve(req);
    return {
      decision: resolution.decision,
      scope: req.scope,
      requiresPrompt: resolution.requiresPrompt,
      reason: resolution.reason,
      record: resolution.record
    };
  }

  /**
   * Execute an egress request
   * Phase 0 §2.3: EgressGateway.request()
   * Phase 0 §2.4: Request lifecycle
   */
  async function request(req) {
    const startTime = Date.now();
    const auditId = crypto.randomUUID();

    // Validate request
    if (!req.scope || !req.url || !req.method) {
      throw new Error('Invalid request: missing required fields');
    }

    // Parse URL for host extraction
    let host;
    try {
      host = new URL(req.url).hostname;
    } catch (error) {
      throw new Error('Invalid URL');
    }

    // Extract path (without query string)
    const urlPath = new URL(req.url).pathname;

    // Resolve consent
    const resolution = consentService.resolve(req);

    // Write audit entry for the attempt
    const auditEntry = {
      auditId,
      caller: req.caller || 'unknown',
      scope: req.scope,
      method: req.method,
      host,
      path: urlPath,
      decision: resolution.decision,
      denyReason: resolution.reason,
      consentRecordId: resolution.record?.id,
      personalDataConsent: resolution.personalDataConsent,
      dataCategories: req.dataCategories || [],
      payloadHash: req.payload ? crypto.createHash('sha256').update(JSON.stringify(req.payload)).digest('hex') : undefined,
      bytesSent: req.payload ? JSON.stringify(req.payload).length : 0,
      bytesReceived: 0,
      durationMs: 0
    };

    // If denied, log and return
    if (resolution.decision === 'deny' || resolution.decision === 'ask') {
      auditEntry.decision = 'deny';
      auditEntry.durationMs = Date.now() - startTime;
      auditEntry.denyReason = resolution.reason;
      auditLog.write(auditEntry);
      emit('egress', auditEntry);

      return {
        ok: false,
        deniedReason: resolution.reason,
        auditId,
        durationMs: auditEntry.durationMs
      };
    }

    // Execute the request
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers || {},
        body: req.payload ? JSON.stringify(req.payload) : undefined,
        signal: req.timeoutMs ? AbortSignal.timeout(req.timeoutMs) : undefined
      });

      const body = await response.text();
      auditEntry.decision = 'allow';
      auditEntry.status = response.status;
      auditEntry.bytesReceived = body.length;
      auditEntry.durationMs = Date.now() - startTime;

      auditLog.write(auditEntry);
      emit('egress', auditEntry);

      return {
        ok: response.ok,
        status: response.status,
        body: body ? JSON.parse(body) : undefined,
        headers: Object.fromEntries(response.headers.entries()),
        auditId,
        durationMs: auditEntry.durationMs
      };
    } catch (error) {
      auditEntry.decision = 'deny';
      auditEntry.durationMs = Date.now() - startTime;
      auditEntry.error = error.message;
      auditEntry.denyReason = error.name === 'AbortError' ? 'timeout' : 'network-error';

      auditLog.write(auditEntry);
      emit('egress', auditEntry);

      return {
        ok: false,
        deniedReason: auditEntry.denyReason,
        auditId,
        durationMs: auditEntry.durationMs,
        error: error.message
      };
    }
  }

  /**
   * Get consent service (for UI integration)
   */
  function getConsentService() {
    return consentService;
  }

  /**
   * Get audit log (for UI integration)
   */
  function getAuditLog() {
    return auditLog;
  }

  return {
    request,
    check,
    preview,
    on,
    getConsentService,
    getAuditLog
  };
}

module.exports = {
  createEgressGateway
};
