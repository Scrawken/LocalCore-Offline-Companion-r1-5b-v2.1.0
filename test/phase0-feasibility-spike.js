/**
 * Phase 0 S0.4 Feasibility Spike Test
 *
 * Run this script to test floor-tier feasibility.
 * Usage: node test/phase0-feasibility-spike.js
 */

const { ensureAppDataStructure } = require('../electron/app-data-layout');
const { createFeasibilityRunner } = require('../electron/feasibility-runner');

async function runFeasibilitySpike() {
  console.log('=== Phase 0 S0.4 Floor-Tier Feasibility Spike ===\n');
  
  // Initialize app-data structure
  ensureAppDataStructure();
  
  // Create runner
  const runner = createFeasibilityRunner();
  
  // Run all tests
  const results = await runner.runAll();
  
  // Save results
  const fs = require('fs');
  const path = require('path');
  const { getPath } = require('../electron/app-data-layout');
  
  const resultsPath = path.join(getPath('logs'), 'feasibility-spike-results.json');
  fs.writeFileSync(resultsPath, runner.exportJSON());
  
  console.log(`\nResults saved to: ${resultsPath}`);
  
  // Exit with appropriate code
  process.exit(results.summary.feasibility === 'PASS' ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  runFeasibilitySpike().catch(error => {
    console.error('Feasibility spike error:', error);
    process.exit(1);
  });
}

module.exports = { runFeasibilitySpike };
