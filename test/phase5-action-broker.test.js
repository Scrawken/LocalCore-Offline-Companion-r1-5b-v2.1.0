const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createToolRegistry } = require('../electron/tool-registry.js');
const { createActionBroker, requiresApproval } = require('../electron/action-broker.js');
const { createToolPermissionService } = require('../electron/tool-permission-service.js');
const { createScopedFileSystem } = require('../electron/scoped-filesystem.js');

function mockAuditLog() {
  const records = [];
  return { records, record: async r => records.push(r) };
}

function readFileTool() {
  return {
    id: 'fs-read-file',
    name: 'Read file',
    description: 'Reads a file within a granted folder',
    version: '1.0.0',
    scopes: ['fs:read'],
    risk: 'low',
    reversible: false,
    inputSchema: { required: ['path'], properties: { path: { type: 'string' } } },
    async dryRun(input) {
      return { summary: 'Read ' + input.path, exactTarget: input.path, effects: ['reads 1 file'] };
    },
    async execute(input, ctx) {
      const buf = await ctx.fs.read(input.path);
      return { length: buf.length };
    }
  };
}

function deleteFileTool() {
  return {
    id: 'fs-delete-file',
    name: 'Delete file',
    description: 'Quarantines a file',
    version: '1.0.0',
    scopes: ['fs:delete'],
    risk: 'destructive',
    reversible: true,
    inputSchema: { required: ['path'], properties: { path: { type: 'string' } } },
    async dryRun(input) {
      return { summary: 'Delete ' + input.path, exactTarget: input.path, effects: ['quarantines 1 file'] };
    },
    async execute(input, ctx) {
      return ctx.fs.delete(input.path);
    }
  };
}

(async () => {
  // --- Tool registry ---
  const registry = createToolRegistry();
  registry.register(readFileTool());
  assert.ok(registry.get('fs-read-file'), 'tool registered');
  assert.throws(() => registry.register({
    id: 'bad', name: 'Bad', description: 'no dryRun', version: '1.0.0',
    scopes: ['fs:read'], risk: 'low', inputSchema: {},
    async execute() {}
  }), /dryRun/, 'tool without dryRun rejected');

  // --- Permission service: deny by default, origin-scoped grants ---
  const perms = createToolPermissionService();
  assert.strictEqual(perms.isGranted('fs-read-file', 'fs:read', 'model'), false, 'deny by default');
  perms.grantScope('fs-read-file', 'fs:read', 'user');
  assert.strictEqual(perms.isGranted('fs-read-file', 'fs:read', 'user'), true, 'user grant works');
  assert.strictEqual(perms.isGranted('fs-read-file', 'fs:read', 'model'), false, 'user grant does NOT cover model origin');

  // Standing grants are origin-bound.
  perms.grantStanding('fs-read-file', ['fs:read'], 'user');
  assert.strictEqual(perms.hasStandingGrant('fs-read-file', ['fs:read'], 'user'), true);
  assert.strictEqual(perms.hasStandingGrant('fs-read-file', ['fs:read'], 'model'), false, 'standing grant never covers model origin');

  // --- Approval determination (Phase 5 §4.2) ---
  assert.strictEqual(requiresApproval({ risk: 'destructive', origin: 'user', hasStandingGrant: true }), true, 'destructive always approves');
  assert.strictEqual(requiresApproval({ risk: 'high', origin: 'model', hasStandingGrant: true }), true, 'high-risk model origin always approves');
  assert.strictEqual(requiresApproval({ risk: 'high', origin: 'user', hasStandingGrant: true }), false, 'high-risk user origin may use grant');
  assert.strictEqual(requiresApproval({ risk: 'low', origin: 'model', hasStandingGrant: false }), true, 'low-risk no grant requires approval');
  assert.strictEqual(requiresApproval({ risk: 'low', origin: 'model', hasStandingGrant: true }), false, 'low-risk with grant runs');

  // --- Action Broker: deny by default ---
  const audit = mockAuditLog();
  const broker = createActionBroker({ registry, permissionService: perms, approvalPrompt: async () => 'deny', auditLog: audit });
  const denied = await broker.invoke({ toolId: 'fs-read-file', input: { path: '/x' }, origin: 'model' });
  assert.strictEqual(denied.status, 'denied', 'model action without scope denied');
  assert.ok(audit.records.some(r => r.status === 'denied'), 'denial audited');

  // --- Broker: approved low-risk action executes ---
  const perms2 = createToolPermissionService();
  perms2.grantScope('fs-read-file', 'fs:read', 'user');
  const audit2 = mockAuditLog();
  const broker2 = createActionBroker({ registry, permissionService: perms2, approvalPrompt: async () => 'allow-once', auditLog: audit2 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-fs-'));
  fs.writeFileSync(path.join(dir, 'test.txt'), 'hello');
  perms2.addRoot(dir, 'read');
  // Wire the scoped fs into the permission service for the broker.
  perms2.getScopedFileSystem = () => createScopedFileSystem([{ path: dir, mode: 'read' }]);
  const ok = await broker2.invoke({ toolId: 'fs-read-file', input: { path: path.join(dir, 'test.txt') }, origin: 'user' });
  assert.strictEqual(ok.status, 'executed', 'approved action executes');
  assert.strictEqual(ok.output.length, 5, 'file read correctly');
  assert.ok(audit2.records.some(r => r.status === 'executed'), 'execution audited');

  // --- Scoped filesystem: containment ---
  const scoped = createScopedFileSystem([{ path: dir, mode: 'read' }]);
  await assert.rejects(() => scoped.read(path.join(dir, '..', 'escape.txt')), /not allowed|outside/, 'traversal rejected');
  await assert.rejects(() => scoped.write(path.join(dir, 'new.txt'), Buffer.from('x')), /read-only/, 'read-only root rejects write');
  await assert.rejects(() => scoped.read('C:\\Windows\\system32\\drivers\\etc\\hosts'), /protected|outside/, 'protected path rejected');

  // --- Undo: quarantine delete + restore ---
  const undoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-undo-'));
  fs.writeFileSync(path.join(undoDir, 'todelete.txt'), 'recover me');
  const undoPerms = createToolPermissionService();
  undoPerms.grantScope('fs-delete-file', 'fs:delete', 'user');
  undoPerms.addRoot(undoDir, 'read-write');
  undoPerms.getScopedFileSystem = () => createScopedFileSystem([{ path: undoDir, mode: 'read-write' }]);
  const undoAudit = mockAuditLog();
  const undoBroker = createActionBroker({ registry, permissionService: undoPerms, approvalPrompt: async () => 'allow-once', auditLog: undoAudit });
  // Register the delete tool with undo wired to this broker.
  const deleteTool = deleteFileTool();
  const originalExecute = deleteTool.execute;
  deleteTool.execute = async (input, ctx) => {
    const result = await originalExecute(input, ctx);
    const undoRef = 'undo-' + result.quarantineId;
    undoBroker.registerUndo(undoRef, async () => ctx.fs.restore(result.quarantineId, input.path));
    return { ...result, undoRef };
  };
  registry.register(deleteTool);

  const deleted = await undoBroker.invoke({ toolId: 'fs-delete-file', input: { path: path.join(undoDir, 'todelete.txt') }, origin: 'user' });
  assert.strictEqual(deleted.status, 'executed', 'delete executes');
  assert.ok(!fs.existsSync(path.join(undoDir, 'todelete.txt')), 'file quarantined');
  assert.ok(deleted.undoRef, 'undoRef returned');
  const undone = await undoBroker.undo(deleted.undoRef);
  assert.strictEqual(undone.status, 'undone', 'undo restores');
  assert.ok(fs.existsSync(path.join(undoDir, 'todelete.txt')), 'file restored');
  const undoAgain = await undoBroker.undo(deleted.undoRef);
  assert.strictEqual(undoAgain.status, 'failed', 'undo is single-use');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(undoDir, { recursive: true, force: true });
  console.log('Phase 5 Action Broker tests passed.');
})().catch(error => {
  console.error('Phase 5 test failed:', error);
  process.exitCode = 1;
});
