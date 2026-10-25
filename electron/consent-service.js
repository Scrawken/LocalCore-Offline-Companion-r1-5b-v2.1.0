/**
 * Consent Service
 *
 * Phase 0 §2.5: Consent checks (per P1)
 *
 * Manages per-scope consent records with persistent storage.
 * Consent is deny-by-default, requires explicit user approval,
 * and is revocable with immediate effect.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getPath } = require('./app-data-layout');

const CONSENT_FILE = 'consent.json';

/**
 * EgressScope enum
 * Phase 0 §2.3
 */
const EgressScope = {
  CLOUD_INFERENCE: 'network:cloud-inference',
  MODEL_DOWNLOAD: 'network:model-download',
  ASSET_DOWNLOAD: 'network:asset-download',
  UPDATE_CHECK: 'network:update-check',
  TELEMETRY: 'network:telemetry',
  LOCAL_INFERENCE: 'network:local-inference' // Phase 0 S0.3: Local inference daemon
};

/**
 * DataCategory enum
 * Phase 0 §2.3
 */
const DataCategory = {
  CONVERSATION: 'conversation',
  MEMORY_FACT: 'memory-fact',
  MEMORY_TRANSCRIPT: 'memory-transcript',
  AUDIO: 'audio',
  GENERATED_MEDIA: 'generated-media',
  DEVICE_INFO: 'device-info',
  NONE: 'none'
};

/**
 * Consent Decision enum
 */
const ConsentDecision = {
  ALLOW: 'allow',
  DENY: 'deny',
  ASK: 'ask'
};

/**
 * DenyReason enum
 */
const DenyReason = {
  NO_CONSENT: 'no-consent',
  CONSENT_EXPIRED: 'consent-expired',
  HOST_NOT_ALLOWED: 'host-not-allowed',
  USER_DENIED: 'user-denied',
  SCOPE_DISABLED: 'scope-disabled',
  OFFLINE: 'offline',
  RATE_LIMITED: 'rate-limited'
};

/**
 * Create consent service instance
 */
function createConsentService() {
  const consentPath = path.join(getPath('config'), CONSENT_FILE);

  function readConsent() {
    if (!fs.existsSync(consentPath)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(consentPath, 'utf8'));
    } catch (error) {
      console.error('[Consent] Failed to read consent file:', error);
      return {};
    }
  }

  function writeConsent(data) {
    const temporaryPath = consentPath + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporaryPath, consentPath);
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      throw error;
    }
  }

  /**
   * Get consent record for a scope
   * Phase 0 §2.3: ConsentService.get()
   */
  function get(scope) {
    const data = readConsent();
    return data[scope];
  }

  /**
   * Set consent record for a scope
   * Phase 0 §2.3: ConsentService.set()
   */
  async function set(record) {
    const data = readConsent();
    data[record.scope] = {
      ...record,
      updatedAt: new Date().toISOString(),
      revokedAt: undefined, // Clear revoked flag when setting new decision
      revokedBy: undefined
    };
    writeConsent(data);
  }

  /**
   * Revoke consent for a scope (immediate effect)
   * Phase 0 §2.3: ConsentService.revoke()
   */
  async function revoke(scope) {
    const data = readConsent();
    if (data[scope]) {
      data[scope].decision = ConsentDecision.DENY;
      data[scope].revokedAt = new Date().toISOString();
      data[scope].revokedBy = 'user';
      writeConsent(data);
    }
  }

  /**
   * Revoke only personal-data consent for a scope
   * Phase 0 §2.3: ConsentService.revokePersonalData()
   */
  async function revokePersonalData(scope) {
    const data = readConsent();
    if (data[scope]) {
      data[scope].dataConsent = false;
      data[scope].dataConsentCategories = [];
      data[scope].dataConsentRevokedAt = new Date().toISOString();
      writeConsent(data);
    }
  }

  /**
   * List all consent records
   * Phase 0 §2.3: ConsentService.list()
   */
  function list() {
    const data = readConsent();
    return Object.values(data);
  }

  /**
   * Resolve consent for a request
   * Phase 0 §2.5: Consent resolution algorithm
   */
  function resolve(req) {
    const record = get(req.scope);

    // Phase 0 S0.3: Auto-allow local-inference (localhost daemon)
    if (req.scope === EgressScope.LOCAL_INFERENCE) {
      try {
        const url = new URL(req.url);
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
          return {
            decision: ConsentDecision.ALLOW,
            reason: 'local-daemon',
            requiresPrompt: false,
            record: record || { scope: req.scope, decision: ConsentDecision.ALLOW }
          };
        }
      } catch (error) {
        // Invalid URL, fall through to normal resolution
      }
    }

    // No consent record
    if (!record) {
      return {
        decision: ConsentDecision.DENY,
        reason: DenyReason.NO_CONSENT,
        requiresPrompt: true
      };
    }

    // Explicitly denied
    if (record.decision === ConsentDecision.DENY) {
      return {
        decision: ConsentDecision.DENY,
        reason: record.revokedAt ? DenyReason.USER_DENIED : DenyReason.NO_CONSENT,
        requiresPrompt: true,
        record
      };
    }

    // Consent expired
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return {
        decision: ConsentDecision.DENY,
        reason: DenyReason.CONSENT_EXPIRED,
        requiresPrompt: true
      };
    }

    // Host not in allowlist
    if (record.allowHosts && record.allowHosts.length > 0) {
      const url = new URL(req.url);
      if (!record.allowHosts.includes(url.hostname)) {
        return {
          decision: ConsentDecision.DENY,
          reason: DenyReason.HOST_NOT_ALLOWED,
          requiresPrompt: true
        };
      }
    }

    // Personal data consent check
    const containsPersonalData = req.dataCategories &&
      req.dataCategories.some(cat => cat !== DataCategory.NONE);

    if (containsPersonalData) {
      // First time personal data for this scope
      if (!record.dataConsent) {
        return {
          decision: ConsentDecision.ASK,
          reason: 'personal-data',
          requiresPrompt: true,
          record
        };
      }

      // New category not in approved list
      if (req.dataCategories) {
        const approvedCategories = record.dataConsentCategories || [];
        const hasNewCategory = req.dataCategories.some(
          cat => !approvedCategories.includes(cat)
        );
        if (hasNewCategory) {
          return {
            decision: ConsentDecision.ASK,
            reason: 'personal-data-broadened',
            requiresPrompt: true,
            record
          };
        }
      }

      // Persistent consent present and categories covered
      return {
        decision: ConsentDecision.ALLOW,
        requiresPrompt: false,
        personalDataConsent: true,
        record
      };
    }

    // Ask scope
    if (record.decision === ConsentDecision.ASK) {
      return {
        decision: ConsentDecision.ASK,
        reason: 'scope',
        requiresPrompt: true,
        record
      };
    }

    // Allow (no personal data in this request)
    return {
      decision: ConsentDecision.ALLOW,
      requiresPrompt: false,
      personalDataConsent: false,
      record
    };
  }

  return {
    get,
    set,
    revoke,
    revokePersonalData,
    list,
    resolve
  };
}

module.exports = {
  createConsentService,
  EgressScope,
  DataCategory,
  ConsentDecision,
  DenyReason
};
