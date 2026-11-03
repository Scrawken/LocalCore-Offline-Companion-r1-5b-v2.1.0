/**
 * Tool Permission Service — Phase 5 §2/§4.2
 *
 * Tracks granted scopes, filesystem roots, and standing grants. Deny by default.
 * Standing grants are scoped to (tool, scope, root) AND origin — a grant created
 * under a user action never covers a model-proposed action. Only the user can
 * create a grant, and only in response to a prompt that displayed the origin.
 * Revocation is immediate.
 */

const { randomUUID } = require('crypto');

function createToolPermissionService() {
  // grantedScopes: Set of "toolId|scope|origin"
  const grantedScopes = new Set();
  // standingGrants: Map of grantId -> { toolId, scopes, origin, createdAt }
  const standingGrants = new Map();
  // fsRoots: [{ path, mode }]
  const fsRoots = [];

  function scopeKey(toolId, scope, origin) {
    return toolId + '|' + scope + '|' + origin;
  }

  return {
    // Grant a scope for a tool+origin (user-initiated only; the broker enforces origin display).
    grantScope(toolId, scope, origin) {
      grantedScopes.add(scopeKey(toolId, scope, origin));
    },
    revokeScope(toolId, scope, origin) {
      grantedScopes.delete(scopeKey(toolId, scope, origin));
    },
    isGranted(toolId, scope, origin) {
      return grantedScopes.has(scopeKey(toolId, scope, origin));
    },

    // Standing grants (Allow-always), bounded by tool + scopes + origin.
    grantStanding(toolId, scopes, origin) {
      const id = randomUUID();
      standingGrants.set(id, { id, toolId, scopes: [...scopes], origin, createdAt: Date.now() });
      return id;
    },
    hasStandingGrant(toolId, scopes, origin) {
      for (const grant of standingGrants.values()) {
        if (grant.toolId === toolId && grant.origin === origin &&
            scopes.every(s => grant.scopes.includes(s))) {
          return true;
        }
      }
      return false;
    },
    revokeStanding(grantId) {
      return standingGrants.delete(grantId);
    },
    listStandingGrants() {
      return [...standingGrants.values()];
    },

    // Filesystem roots (user-configured only).
    addRoot(path, mode) {
      if (!['read', 'read-write'].includes(mode)) throw new Error('Root mode must be read or read-write.');
      fsRoots.push({ path, mode });
    },
    removeRoot(path) {
      const index = fsRoots.findIndex(r => r.path === path);
      if (index >= 0) fsRoots.splice(index, 1);
    },
    listRoots() {
      return [...fsRoots];
    }
  };
}

module.exports = { createToolPermissionService };
