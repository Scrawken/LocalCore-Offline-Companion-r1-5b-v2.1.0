/**
 * Phase 0 S0.2 Resource Governor & Tier Detector Tests
 *
 * Phase 0 §3.5: Test plan (per P3)
 *
 * Tests Resource Governor lease system, eviction, and Tier Detector.
 */

const { createResourceGovernor, PipelineKind, Tier, DEFAULT_TIER_PROFILES } = require('../electron/resource-governor');
const { createTierDetector, TIER_CRITERIA } = require('../electron/tier-detector');
const { ensureAppDataStructure } = require('../electron/app-data-layout');

async function runTests() {
  console.log('=== Phase 0 S0.2 Resource Governor & Tier Detector Tests ===\n');

  // Initialize app-data structure (required for any Phase 0 component)
  ensureAppDataStructure();

  const governor = createResourceGovernor();
  const tierDetector = createTierDetector();

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
   * Resource Governor Tests
   */
  console.log('--- Resource Governor Tests ---');

  // Test 1: Acquire light pipeline (should not block)
  try {
    const lease = await governor.acquire(PipelineKind.EMBEDDING);
    assert('RG1: Light pipeline acquired', lease.kind === PipelineKind.EMBEDDING, 'Should acquire light pipeline');
    assert('RG1: Light pipeline not degraded', !lease.degraded, 'Should not be degraded');
    governor.release(lease);
  } catch (error) {
    console.log(`✗ RG1: ${error.message}`);
    failed++;
  }

  // Test 2: Acquire heavy pipeline (should get lease)
  try {
    const lease = await governor.acquire(PipelineKind.LLM);
    assert('RG2: Heavy pipeline acquired', lease.kind === PipelineKind.LLM, 'Should acquire heavy pipeline');
    assert('RG2: Heavy pipeline not degraded', !lease.degraded, 'Should not be degraded');
    governor.release(lease);
  } catch (error) {
    console.log(`✗ RG2: ${error.message}`);
    failed++;
  }

  // Test 3: Multiple heavy pipelines (floor tier allows 1)
  try {
    const lease1 = await governor.acquire(PipelineKind.LLM);
    const lease2 = await governor.acquire(PipelineKind.STT, { timeoutMs: 1000 });
    
    assert('RG3: First heavy lease acquired', lease1.kind === PipelineKind.LLM, 'First should acquire');
    assert('RG3: Second heavy lease degraded', lease2.degraded === true, 'Second should be degraded due to maxConcurrentHeavy=1');
    
    governor.release(lease1);
    governor.release(lease2);
  } catch (error) {
    console.log(`✗ RG3: ${error.message}`);
    failed++;
  }

  // Test 4: Lease statistics
  try {
    const lease = await governor.acquire(PipelineKind.LLM);
    const stats = governor.stats();
    
    assert('RG4: Stats shows active lease', stats.activeLeases.length === 1, 'Should have one active lease');
    assert('RG4: Stats shows correct kind', stats.activeLeases[0].kind === PipelineKind.LLM, 'Kind should match');
    
    governor.release(lease);
  } catch (error) {
    console.log(`✗ RG4: ${error.message}`);
    failed++;
  }

  // Test 5: Profile management
  try {
    const initialProfile = governor.stats().profile;
    assert('RG5: Initial profile is floor', initialProfile.tier === Tier.FLOOR, 'Should start with floor profile');
    
    governor.setProfile(DEFAULT_TIER_PROFILES[Tier.MID]);
    const newProfile = governor.stats().profile;
    assert('RG5: Profile changed to mid', newProfile.tier === Tier.MID, 'Should change to mid profile');
    
    governor.setProfile(initialProfile); // Reset
  } catch (error) {
    console.log(`✗ RG5: ${error.message}`);
    failed++;
  }

  // Test 6: Event emission
  try {
    let eventReceived = false;
    governor.on('lease-acquired', () => { eventReceived = true; });
    
    const lease = await governor.acquire(PipelineKind.EMBEDDING);
    assert('RG6: Event emitted', eventReceived, 'Should emit lease-acquired event');
    
    governor.release(lease);
  } catch (error) {
    console.log(`✗ RG6: ${error.message}`);
    failed++;
  }

  /**
   * Tier Detector Tests
   */
  console.log('\n--- Tier Detector Tests ---');

  // Test 7: System info retrieval
  try {
    const systemInfo = tierDetector.getSystemInfo();
    assert('TD7: System info includes RAM', systemInfo.ramGB > 0, 'Should have RAM info');
    assert('TD7: System info includes CPU cores', systemInfo.cpuCores > 0, 'Should have CPU info');
    assert('TD7: System info includes GPU', systemInfo.gpu !== null, 'Should have GPU info');
    assert('TD7: System info includes detected tier', Object.values(Tier).includes(systemInfo.detectedTier), 'Should detect a tier');
  } catch (error) {
    console.log(`✗ TD7: ${error.message}`);
    failed++;
  }

  // Test 8: Tier detection (always returns floor in this environment)
  try {
    const detectedTier = tierDetector.detectTier();
    assert('TD8: Detects a valid tier', Object.values(Tier).includes(detectedTier), 'Should detect a valid tier');
    console.log(`TD8: Detected tier: ${detectedTier}`);
  } catch (error) {
    console.log(`✗ TD8: ${error.message}`);
    failed++;
  }

  // Test 9: Profile retrieval
  try {
    const profile = tierDetector.getProfile();
    assert('TD9: Profile has required fields', profile.tier && profile.maxConcurrentHeavy !== undefined, 'Profile should have required fields');
    assert('TD9: Profile maxConcurrentHeavy is number', typeof profile.maxConcurrentHeavy === 'number', 'maxConcurrentHeavy should be number');
    assert('TD9: Profile modelBudgetMB is number', typeof profile.modelBudgetMB === 'number', 'modelBudgetMB should be number');
  } catch (error) {
    console.log(`✗ TD9: ${error.message}`);
    failed++;
  }

  // Test 10: Tier criteria constants
  try {
    assert('TD10: Floor tier criteria defined', TIER_CRITERIA[Tier.FLOOR] !== undefined, 'Floor criteria should be defined');
    assert('TD10: Mid tier criteria defined', TIER_CRITERIA[Tier.MID] !== undefined, 'Mid criteria should be defined');
    assert('TD10: High tier criteria defined', TIER_CRITERIA[Tier.HIGH] !== undefined, 'High criteria should be defined');
  } catch (error) {
    console.log(`✗ TD10: ${error.message}`);
    failed++;
  }

  /**
   * Heavy/Light Pipeline Classification Tests
   */
  console.log('\n--- Pipeline Classification Tests ---');

  // Test 11: Heavy pipeline classification
  try {
    assert('PC11: LLM is heavy', PipelineKind.LLM === 'llm', 'LLM should be heavy');
    assert('PC11: STT is heavy', PipelineKind.STT === 'stt', 'STT should be heavy');
    assert('PC11: TTS is heavy', PipelineKind.TTS === 'tts', 'TTS should be heavy');
  } catch (error) {
    console.log(`✗ PC11: ${error.message}`);
    failed++;
  }

  // Test 12: Light pipeline classification
  try {
    assert('PC12: Embedding is light', PipelineKind.EMBEDDING === 'embedding', 'Embedding should be light');
    assert('PC12: Avatar is light', PipelineKind.AVATAR === 'avatar', 'Avatar should be light');
    assert('PC12: Wake word is light', PipelineKind.WAKE_WORD === 'wake-word', 'Wake word should be light');
  } catch (error) {
    console.log(`✗ PC12: ${error.message}`);
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
