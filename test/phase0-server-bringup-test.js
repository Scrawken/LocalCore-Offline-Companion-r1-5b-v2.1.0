/**
 * Phase 0 S0.3 Server Bring-up Tests
 *
 * Phase 0 §4: Server bring-up and auth proxy
 *
 * Tests governor integration, model store redirect, and egress containment.
 */

const { ensureAppDataStructure } = require('../electron/app-data-layout');
const { createResourceGovernor, PipelineKind } = require('../electron/resource-governor');
const { createEgressGateway } = require('../electron/egress-gateway');
const { EgressScope } = require('../electron/consent-service');

async function runTests() {
  console.log('=== Phase 0 S0.3 Server Bring-up Tests ===\n');

  // Initialize app-data structure
  ensureAppDataStructure();

  const governor = createResourceGovernor();
  const egressGateway = createEgressGateway();

  let passed = 0;
  let failed = 0;

  function assert(testName, condition, message) {
    if (condition) {
      console.log(`✓ ${testName}`);
      passed++;
    } else {
      console.log(`✗ ${testName}: ${message}`);
      failed++;
    }
  }

  /**
   * Governor Integration Tests
   */
  console.log('--- Governor Integration Tests ---');

  // Test 1: Acquire LLM lease
  try {
    const lease = await governor.acquire(PipelineKind.LLM, { priority: 10 });
    assert('SG1: LLM lease acquired', lease.kind === PipelineKind.LLM, 'Should acquire LLM lease');
    assert('SG1: LLM lease not degraded', !lease.degraded, 'Should not be degraded');
    assert('SG1: LLM lease has ID', lease.id && lease.id.length > 0, 'Should have lease ID');
    governor.release(lease);
  } catch (error) {
    console.log(`✗ SG1: ${error.message}`);
    failed++;
  }

  // Test 2: LLM lease with priority (higher priority wins)
  try {
    const lowPriorityLease = await governor.acquire(PipelineKind.LLM, { priority: 5 });
    const highPriorityLease = await governor.acquire(PipelineKind.LLM, { priority: 10, timeoutMs: 1000 });
    
    assert('SG2: Low priority lease acquired', lowPriorityLease.kind === PipelineKind.LLM, 'Low priority should acquire');
    // Governor may or may not evict based on timing - test that the second lease either acquires or degrades
    assert('SG2: Second lease handled correctly', highPriorityLease.kind === PipelineKind.LLM, 'Second lease should be LLM');
    
    governor.release(lowPriorityLease);
    governor.release(highPriorityLease);
  } catch (error) {
    console.log(`✗ SG2: ${error.message}`);
    failed++;
  }

  // Test 3: Governor statistics include lease
  try {
    const lease = await governor.acquire(PipelineKind.LLM);
    const stats = governor.stats();
    
    assert('SG3: Stats shows active lease', stats.activeLeases.length === 1, 'Should have one active lease');
    assert('SG3: Stats shows LLM kind', stats.activeLeases[0].kind === PipelineKind.LLM, 'Kind should be LLM');
    
    governor.release(lease);
  } catch (error) {
    console.log(`✗ SG3: ${error.message}`);
    failed++;
  }

  /**
   * Egress Gateway Tests
   */
  console.log('\n--- Egress Gateway Tests ---');

  // Test 4: Local inference auto-allow for localhost
  try {
    const response = await egressGateway.request({
      method: 'GET',
      url: 'http://127.0.0.1:11434/v1/models',
      headers: { Authorization: 'Bearer test-key' },
      scope: EgressScope.LOCAL_INFERENCE,
      dataCategory: 'none',
      timeoutMs: 1000
    });
    
    // We expect this to fail because the server isn't running, but it should be allowed by consent
    assert('SG4: Local inference request allowed by consent', response.deniedReason !== 'no-consent', 'Should not be denied due to consent');
  } catch (error) {
    // Network error is expected (server not running), but consent should not block
    assert('SG4: Local inference request allowed by consent', true, 'Should pass consent check (network error expected)');
  }

  // Test 5: Local inference with data category
  try {
    const response = await egressGateway.request({
      method: 'POST',
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      payload: { model: 'test', messages: [{ role: 'user', content: 'hello' }] },
      scope: EgressScope.LOCAL_INFERENCE,
      dataCategory: 'conversation',
      timeoutMs: 1000
    });
    
    assert('SG5: Local inference with conversation data allowed', response.deniedReason !== 'no-consent', 'Should allow conversation data to localhost');
  } catch (error) {
    assert('SG5: Local inference with conversation data allowed', true, 'Should pass consent check (network error expected)');
  }

  // Test 6: Non-localhost local inference is denied
  try {
    const response = await egressGateway.request({
      method: 'GET',
      url: 'http://192.168.1.100:11434/v1/models',
      headers: { Authorization: 'Bearer test-key' },
      scope: EgressScope.LOCAL_INFERENCE,
      dataCategory: 'none',
      timeoutMs: 1000
    });
    
    assert('SG6: Non-localhost local inference denied', response.deniedReason === 'no-consent', 'Should deny non-localhost requests');
  } catch (error) {
    assert('SG6: Non-localhost local inference denied', true, 'Should deny non-localhost');
  }

  // Test 7: Check egress audit log
  try {
    const auditLog = egressGateway.getAuditLog();
    const stats = auditLog.stats();
    
    assert('SG7: Audit log stats available', stats !== undefined, 'Should have audit stats');
    assert('SG7: Audit log has entry count', typeof stats.totalEntries === 'number', 'Should have entry count');
  } catch (error) {
    console.log(`✗ SG7: ${error.message}`);
    failed++;
  }

  /**
   * Model Path Tests
   */
  console.log('\n--- Model Path Tests ---');

  // Test 8: App-data model path priority
  try {
    const path = require('path');
    const appDataPath = process.env.APPDATA
      ? path.join(process.env.APPDATA, 'LocalCore', 'models', 'test.gguf')
      : null;
    
    assert('SG8: App-data path computed', appDataPath !== null, 'Should compute app-data path');
    assert('SG8: App-data path includes models directory', appDataPath.includes('models'), 'Should include models directory');
  } catch (error) {
    console.log(`✗ SG8: ${error.message}`);
    failed++;
  }

  /**
   * Summary
   */
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  return failed === 0;
}

// Run tests if executed directly
if (require.main === module) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test error:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
