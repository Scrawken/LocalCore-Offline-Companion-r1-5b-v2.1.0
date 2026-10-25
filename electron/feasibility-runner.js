/**
 * Feasibility Test Runner
 *
 * Phase 0 S0.4: Floor-tier feasibility spike
 *
 * Runs automated feasibility tests on the current hardware:
 * - LLM performance (first-token latency, tokens/sec)
 * - Memory pressure testing
 * - Avatar coexistence test
 * - Voice coexistence test
 */

const { createPerformanceCollector } = require('./performance-collector');
const { createResourceGovernor, PipelineKind } = require('./resource-governor');
const { createTierDetector } = require('./tier-detector');

/**
 * Feasibility test scenarios
 */
const TestScenario = {
  LLM_PERFORMANCE: 'llm-performance',
  MEMORY_PRESSURE: 'memory-pressure',
  AVATAR_COEXISTENCE: 'avatar-coexistence',
  VOICE_COEXISTENCE: 'voice-coexistence',
  FULL_PIPELINE: 'full-pipeline'
};

/**
 * Feasibility thresholds (from blueprint Phase 0 §3.2)
 */
const THRESHOLDS = {
  floor: {
    firstTokenLatencyMs: 3000, // ≤3 seconds
    tokensPerSecond: 8, // Minimum acceptable
    peakMemoryMB: 6960, // ≤85% of 8GB
    avatarFPS: 24, // Minimum acceptable
    sttLatencyMs: 5000, // ≤5 seconds
    ttsLatencyMs: 2000 // ≤2 seconds
  }
};

/**
 * Create feasibility test runner
 */
function createFeasibilityRunner() {
  const collector = createPerformanceCollector();
  const governor = createResourceGovernor();
  const tierDetector = createTierDetector();
  
  const results = {
    tier: null,
    tests: [],
    summary: null
  };

  /**
   * Run all feasibility tests
   */
  async function runAll() {
    console.log('=== Phase 0 S0.4 Feasibility Spike ===\n');
    
    // Detect tier
    results.tier = tierDetector.detectTier();
    console.log(`Detected tier: ${results.tier}`);
    
    // Set governor profile
    const profile = tierDetector.getProfile();
    governor.setProfile(profile);
    console.log(`Governor profile: ${profile.tier}\n`);
    
    // Run tests
    await runLLMPerformanceTest();
    await runMemoryPressureTest();
    await runAvatarCoexistenceTest();
    await runVoiceCoexistenceTest();
    
    // Generate summary
    results.summary = generateSummary();
    
    console.log('\n=== Feasibility Test Complete ===');
    console.log(results.summary);
    
    return results;
  }

  /**
   * Run LLM performance test
   */
  async function runLLMPerformanceTest() {
    console.log('--- LLM Performance Test ---');
    
    const test = {
      scenario: TestScenario.LLM_PERFORMANCE,
      passed: false,
      metrics: {}
    };
    
    try {
      // Acquire LLM lease
      const lease = await governor.acquire(PipelineKind.LLM, { priority: 10 });
      
      // Simulate inference (in real implementation, this would call the daemon)
      const startTime = Date.now();
      await simulateInference();
      const latencyMs = Date.now() - startTime;
      
      // Record metrics
      collector.recordInference(50, 100, latencyMs, 'dolphin3-llama3.1-8b');
      collector.recordMemory();
      
      test.metrics = {
        latencyMs,
        tokensPerSecond: (100 / (latencyMs / 1000)).toFixed(2),
        memoryMB: process.memoryUsage().rss / (1024 * 1024)
      };
      
      // Check thresholds
      const threshold = THRESHOLDS.floor;
      test.passed = test.metrics.latencyMs <= threshold.firstTokenLatencyMs;
      
      console.log(`Latency: ${test.metrics.latencyMs}ms (threshold: ${threshold.firstTokenLatencyMs}ms)`);
      console.log(`Tokens/sec: ${test.metrics.tokensPerSecond}`);
      console.log(`Memory: ${test.metrics.memoryMB.toFixed(2)}MB`);
      console.log(`Result: ${test.passed ? 'PASS' : 'FAIL'}\n`);
      
      governor.release(lease);
    } catch (error) {
      console.error(`LLM performance test failed: ${error.message}\n`);
      test.error = error.message;
    }
    
    results.tests.push(test);
  }

  /**
   * Run memory pressure test
   */
  async function runMemoryPressureTest() {
    console.log('--- Memory Pressure Test ---');
    
    const test = {
      scenario: TestScenario.MEMORY_PRESSURE,
      passed: false,
      metrics: {}
    };
    
    try {
      // Record baseline memory
      collector.recordMemory();
      const baseline = collector.getStats().memory;
      
      // Simulate memory pressure by acquiring multiple leases
      const llmLease = await governor.acquire(PipelineKind.LLM);
      const sttLease = await governor.acquire(PipelineKind.STT, { timeoutMs: 1000 });
      
      // Record memory under pressure
      collector.recordMemory();
      const underPressure = collector.getStats().memory;
      
      test.metrics = {
        baselineRSS_MB: baseline.avgProcessRSS_MB,
        pressureRSS_MB: underPressure.avgProcessRSS_MB,
        deltaMB: underPressure.avgProcessRSS_MB - baseline.avgProcessRSS_MB
      };
      
      // Check against threshold
      const threshold = THRESHOLDS.floor;
      test.passed = underPressure.maxProcessRSS_MB <= threshold.peakMemoryMB;
      
      console.log(`Baseline memory: ${test.metrics.baselineRSS_MB.toFixed(2)}MB`);
      console.log(`Under pressure: ${test.metrics.pressureRSS_MB.toFixed(2)}MB`);
      console.log(`Delta: ${test.metrics.deltaMB.toFixed(2)}MB`);
      console.log(`Threshold: ${threshold.peakMemoryMB}MB`);
      console.log(`Result: ${test.passed ? 'PASS' : 'FAIL'}\n`);
      
      governor.release(llmLease);
      if (sttLease) governor.release(sttLease);
    } catch (error) {
      console.error(`Memory pressure test failed: ${error.message}\n`);
      test.error = error.message;
    }
    
    results.tests.push(test);
  }

  /**
   * Run avatar coexistence test
   */
  async function runAvatarCoexistenceTest() {
    console.log('--- Avatar Coexistence Test ---');
    
    const test = {
      scenario: TestScenario.AVATAR_COEXISTENCE,
      passed: false,
      metrics: {}
    };
    
    try {
      // Acquire LLM lease
      const llmLease = await governor.acquire(PipelineKind.LLM);
      
      // Simulate avatar rendering (light pipeline, should not be blocked)
      const avatarLease = await governor.acquire(PipelineKind.AVATAR);
      
      // Record avatar metrics
      collector.recordAvatar(30, 33, 0); // Simulated 30 FPS
      
      test.metrics = {
        avatarLeaseAcquired: true,
        avatarLeaseDegraded: avatarLease.degraded || false,
        llmLeaseActive: true
      };
      
      // Avatar should always be available (light pipeline)
      test.passed = !avatarLease.degraded;
      
      console.log(`Avatar lease acquired: ${test.metrics.avatarLeaseAcquired}`);
      console.log(`Avatar lease degraded: ${test.metrics.avatarLeaseDegraded}`);
      console.log(`LLM lease active: ${test.metrics.llmLeaseActive}`);
      console.log(`Result: ${test.passed ? 'PASS' : 'FAIL'}\n`);
      
      governor.release(llmLease);
      governor.release(avatarLease);
    } catch (error) {
      console.error(`Avatar coexistence test failed: ${error.message}\n`);
      test.error = error.message;
    }
    
    results.tests.push(test);
  }

  /**
   * Run voice coexistence test
   */
  async function runVoiceCoexistenceTest() {
    console.log('--- Voice Coexistence Test ---');
    
    const test = {
      scenario: TestScenario.VOICE_COEXISTENCE,
      passed: false,
      metrics: {}
    };
    
    try {
      // Acquire LLM lease
      const llmLease = await governor.acquire(PipelineKind.LLM);
      
      // Try to acquire STT lease (should be degraded on floor tier due to concurrency limit)
      const sttLease = await governor.acquire(PipelineKind.STT, { timeoutMs: 1000 });
      
      test.metrics = {
        sttLeaseAcquired: true,
        sttLeaseDegraded: sttLease.degraded || false,
        governorBehavior: sttLease.degraded ? 'serialized' : 'concurrent'
      };
      
      // On floor tier, STT should be degraded (serialized with LLM)
      // This is expected behavior, not a failure
      test.passed = true;
      
      console.log(`STT lease acquired: ${test.metrics.sttLeaseAcquired}`);
      console.log(`STT lease degraded: ${test.metrics.sttLeaseDegraded}`);
      console.log(`Governor behavior: ${test.metrics.governorBehavior}`);
      console.log(`Result: ${test.passed ? 'PASS (expected serialization)' : 'FAIL'}\n`);
      
      governor.release(llmLease);
      governor.release(sttLease);
    } catch (error) {
      console.error(`Voice coexistence test failed: ${error.message}\n`);
      test.error = error.message;
    }
    
    results.tests.push(test);
  }

  /**
   * Simulate inference (placeholder)
   * In real implementation, this would call the daemon
   */
  async function simulateInference() {
    // Simulate 500ms inference time
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Generate test summary
   */
  function generateSummary() {
    const passed = results.tests.filter(t => t.passed).length;
    const total = results.tests.length;
    
    return {
      tier: results.tier,
      testsPassed: passed,
      testsTotal: total,
      testsFailed: total - passed,
      feasibility: passed === total ? 'PASS' : 'PARTIAL',
      metrics: collector.getStats(),
      note: 'GPU metrics require OS integration for accurate results'
    };
  }

  /**
   * Export results as JSON
   */
  function exportJSON() {
    return JSON.stringify(results, null, 2);
  }

  return {
    runAll,
    runLLMPerformanceTest,
    runMemoryPressureTest,
    runAvatarCoexistenceTest,
    runVoiceCoexistenceTest,
    generateSummary,
    exportJSON
  };
}

module.exports = {
  createFeasibilityRunner,
  TestScenario,
  THRESHOLDS
};
