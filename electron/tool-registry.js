/**
 * Tool Registry — Phase 5 §2
 *
 * Registered tools with declared scopes, input schemas, risk levels, and a
 * mandatory dryRun. A tool that cannot describe its exact effect cannot be
 * registered. Tools receive only scoped handles, never raw OS access.
 */

const TOOL_SCOPES = [
  'fs:read', 'fs:write', 'fs:delete', 'fs:move',
  'shell:execute', 'process:launch',
  'clipboard:read', 'clipboard:write',
  'screen:capture', 'app:control', 'network:external'
];

const RISK_LEVELS = ['low', 'moderate', 'high', 'destructive'];

function createToolRegistry() {
  const tools = new Map();

  function validateTool(tool) {
    if (!tool || typeof tool !== 'object') throw new Error('Tool must be an object.');
    if (!tool.id || typeof tool.id !== 'string') throw new Error('Tool requires an id.');
    if (!tool.name || !tool.description) throw new Error('Tool requires name and description.');
    if (!Array.isArray(tool.scopes) || !tool.scopes.length) throw new Error('Tool must declare at least one scope.');
    for (const scope of tool.scopes) {
      if (!TOOL_SCOPES.includes(scope)) throw new Error('Unknown tool scope: ' + scope);
    }
    if (!RISK_LEVELS.includes(tool.risk)) throw new Error('Tool requires a valid risk level.');
    if (typeof tool.dryRun !== 'function') throw new Error('Tool requires a dryRun(input) function (mandatory).');
    if (typeof tool.execute !== 'function') throw new Error('Tool requires an execute(input, ctx) function.');
    if (!tool.inputSchema || typeof tool.inputSchema !== 'object') throw new Error('Tool requires an inputSchema.');
    return true;
  }

  return {
    register(tool) {
      validateTool(tool);
      tools.set(tool.id, tool);
    },
    get(id) {
      return tools.get(id);
    },
    list() {
      return [...tools.values()];
    },
    has(id) {
      return tools.has(id);
    }
  };
}

module.exports = { createToolRegistry, TOOL_SCOPES, RISK_LEVELS };
