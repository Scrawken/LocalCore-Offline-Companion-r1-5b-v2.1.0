const assert = require('assert');
const { createToolRegistry } = require('../electron/tool-registry.js');
const { createActionBroker } = require('../electron/action-broker.js');
const { createToolPermissionService } = require('../electron/tool-permission-service.js');
const { createGenerationEngine } = require('../engine/local-generation.js');

function mockAuditLog() {
  const records = [];
  return { records, record: async r => records.push(r) };
}

(async () => {
  const registry = createToolRegistry();
  const perms = createToolPermissionService();
  const audit = mockAuditLog();
  const engine = createGenerationEngine();

  // Register an image-generation tool wired to the engine.
  registry.register({
    id: 'generate-image',
    name: 'Generate image',
    description: 'Generate an image from a prompt',
    version: '1.0.0',
    scopes: ['generate:image'],
    risk: 'moderate',
    reversible: false,
    inputSchema: { required: ['prompt'], properties: { prompt: { type: 'string' } } },
    async dryRun(input) {
      return { summary: 'Generate image: ' + input.prompt, exactTarget: 'local generator', effects: ['generates 1 image'] };
    },
    async execute(input) {
      const result = await engine.generateImage(input);
      return { width: result.width, sizeBytes: result.bytes.length, model: result.model };
    }
  });

  // Deny by default: no scope granted.
  const broker = createActionBroker({ registry, permissionService: perms, approvalPrompt: async () => 'deny', auditLog: audit });
  const denied = await broker.invoke({ toolId: 'generate-image', input: { prompt: 'a cat' }, origin: 'model' });
  assert.strictEqual(denied.status, 'denied', 'generation denied without scope');

  // Grant scope + approve -> executes and produces a real PNG.
  perms.grantScope('generate-image', 'generate:image', 'user');
  const broker2 = createActionBroker({ registry, permissionService: perms, approvalPrompt: async () => 'allow-once', auditLog: audit });
  const ok = await broker2.invoke({ toolId: 'generate-image', input: { prompt: 'a cat', width: 256, height: 256 }, origin: 'user' });
  assert.strictEqual(ok.status, 'executed', 'approved generation executes');
  assert.strictEqual(ok.output.width, 256, 'image width honored');
  assert.ok(ok.output.sizeBytes > 1000, 'real PNG bytes produced');
  assert.ok(audit.records.some(r => r.status === 'executed'), 'generation audited');

  // Engine validation.
  await assert.rejects(() => engine.generateImage({ prompt: '' }), /prompt is required/);
  await assert.rejects(() => engine.generateVideo({ prompt: '' }), /prompt is required/);
  const video = await engine.generateVideo({ prompt: 'orbit', frames: 4 });
  assert.strictEqual(video.frames, 4, 'video frame count honored');
  assert.ok(video.bytes.length > 500, 'real GIF bytes produced');

  console.log('Phase 5 generation tools tests passed.');
})().catch(error => {
  console.error('Phase 5 generation tools test failed:', error);
  process.exitCode = 1;
});
