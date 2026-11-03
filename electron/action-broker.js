/**
 * Action Broker — Phase 5 §4
 *
 * The sole mediator for every consequential action. The model can propose
 * actions but can never authorize them. Deny by default; approval shows the
 * exact effect; destructive actions are never persistently auto-approved;
 * revocation is immediate; every action is audited.
 *
 * Flow: validate input → check scopes granted → dryRun → determine approval →
 * (prompt if required, timeout = deny) → execute with scoped handles → audit.
 */

const { randomUUID } = require('crypto');

// Approval determination per Phase 5 §4.2.
function requiresApproval({ risk, origin, hasStandingGrant }) {
  if (risk === 'destructive') return true; // always fresh approval, never a grant
  if (risk === 'high') {
    // high-risk model/automation origin always prompts; user-origin may use a grant
    return !(origin === 'user' && hasStandingGrant);
  }
  // low/moderate: a matching same-origin standing grant covers it
  return !hasStandingGrant;
}

function createActionBroker({ registry, permissionService, approvalPrompt, auditLog }) {
  if (!registry) throw new Error('ActionBroker requires a tool registry.');
  if (!permissionService) throw new Error('ActionBroker requires a permission service.');
  if (!auditLog) throw new Error('ActionBroker requires an audit log.');

  // approvalPrompt(preview) → Promise<'allow-once'|'allow-session'|'allow-always'|'deny'>
  // Injected so the broker stays testable; the real one is main-process-enforced UI.
  const prompt = approvalPrompt || (async () => 'deny');

  async function preview(req) {
    const tool = registry.get(req.toolId);
    if (!tool) throw new Error('Unknown tool: ' + req.toolId);
    // dryRun is mandatory and produces the exact-effect preview.
    const dryRunPreview = await tool.dryRun(req.input);
    return {
      toolId: tool.id,
      summary: dryRunPreview.summary || tool.description,
      exactTarget: dryRunPreview.exactTarget || '',
      command: dryRunPreview.command,
      diff: dryRunPreview.diff,
      effects: dryRunPreview.effects || [],
      risk: tool.risk,
      reversible: Boolean(tool.reversible),
      scopeUsed: tool.scopes,
      origin: req.origin,
      requiresApproval: true // refined by invoke()
    };
  }

  async function invoke(req) {
    const auditId = randomUUID();
    const tool = registry.get(req.toolId);
    if (!tool) {
      await auditLog.record({ auditId, toolId: req.toolId, origin: req.origin, status: 'failed', error: 'unknown tool' });
      return { status: 'failed', error: 'Unknown tool: ' + req.toolId, auditId };
    }

    // 1. Validate input against the tool's schema.
    try {
      validateAgainstSchema(req.input, tool.inputSchema);
    } catch (error) {
      await auditLog.record({ auditId, toolId: tool.id, origin: req.origin, status: 'failed', error: 'invalid input: ' + error.message });
      return { status: 'failed', error: 'Invalid input: ' + error.message, auditId };
    }

    // 2. Check every declared scope is granted (deny by default).
    for (const scope of tool.scopes) {
      const granted = await permissionService.isGranted(tool.id, scope, req.origin);
      if (!granted) {
        await auditLog.record({ auditId, toolId: tool.id, origin: req.origin, status: 'denied', scope });
        return { status: 'denied', error: 'Scope not granted: ' + scope, auditId };
      }
    }

    // 3. dryRun → exact-effect preview.
    const actionPreview = await preview(req);

    // 4. Determine approval requirement.
    const hasStandingGrant = await permissionService.hasStandingGrant(tool.id, tool.scopes, req.origin);
    const needsApproval = requiresApproval({ risk: tool.risk, origin: req.origin, hasStandingGrant });
    actionPreview.requiresApproval = needsApproval;

    if (!needsApproval) {
      return executeAndAudit(tool, req, auditId, null);
    }

    // 5. Present approval UI; timeout/absence defaults to deny.
    const decision = await prompt(actionPreview);
    if (decision === 'deny' || !decision) {
      await auditLog.record({ auditId, toolId: tool.id, origin: req.origin, status: 'denied', preview: actionPreview.summary });
      return { status: 'denied', error: 'Denied by user.', auditId };
    }
    if (decision === 'allow-always' && tool.risk !== 'destructive' && tool.risk !== 'high') {
      await permissionService.grantStanding(tool.id, tool.scopes, req.origin);
    }

    // 6. Execute with scoped handles.
    return executeAndAudit(tool, req, auditId, decision);
  }

  async function executeAndAudit(tool, req, auditId, approvalDecision) {
    try {
      const ctx = {
        fs: permissionService.getScopedFileSystem ? permissionService.getScopedFileSystem() : undefined,
        signal: new AbortController().signal,
        auditId
      };
      const output = await tool.execute(req.input, ctx);
      await auditLog.record({
        auditId, toolId: tool.id, origin: req.origin, status: 'executed',
        approval: approvalDecision, output: summarizeOutput(output)
      });
      return { status: 'executed', output, auditId, undoRef: output && output.undoRef };
    } catch (error) {
      await auditLog.record({ auditId, toolId: tool.id, origin: req.origin, status: 'failed', error: error.message });
      return { status: 'failed', error: error.message, auditId };
    }
  }

  function summarizeOutput(output) {
    if (output == null) return null;
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    return text.length > 500 ? text.slice(0, 500) + '…' : text;
  }

  return {
    invoke,
    preview,
    async cancel() { /* v1: no mid-execution cancellation of fs tools */ }
  };
}

// Minimal JSON-schema-ish validation (required fields, types) without a dependency.
function validateAgainstSchema(input, schema) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (input == null || input[field] === undefined) {
        throw new Error('missing required field: ' + field);
      }
    }
  }
  if (schema.properties && typeof input === 'object' && input !== null) {
    for (const [field, def] of Object.entries(schema.properties)) {
      if (input[field] !== undefined && def.type) {
        const actual = Array.isArray(input[field]) ? 'array' : typeof input[field];
        if (def.type !== actual && !(def.type === 'integer' && actual === 'number')) {
          throw new Error('field "' + field + '" must be ' + def.type + ', got ' + actual);
        }
      }
    }
  }
}

module.exports = { createActionBroker, requiresApproval };
