/**
 * Phase 0 No-Writes-Outside Test
 *
 * Phase 0 §4: no-writes-outside guarantee.
 *
 * Verifies the filesystem watcher flags writes outside the app-data directory
 * and permits writes inside it, and that app-data-layout's isWithinAppData
 * guard classifies paths correctly.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFilesystemWatcher } = require('../electron/filesystem-watcher');
const { isWithinAppData, getAppDataPath, getAllowedWritePaths } = require('../electron/app-data-layout');

function runTests() {
  console.log('=== Phase 0 No-Writes-Outside Test ===\n');

  // 1. isWithinAppData classification.
  const base = getAppDataPath();
  const inside = path.join(base, 'memory', 'memory.json');
  const outside = path.join(os.tmpdir(), 'localcore-outside-' + Date.now() + '.tmp');
  if (!isWithinAppData(inside)) throw new Error('FAIL: app-data path not recognized as inside');
  if (isWithinAppData(outside)) throw new Error('FAIL: temp path wrongly recognized as inside');
  console.log('[PASS] isWithinAppData classifies inside/outside correctly');

  // 2. Watcher flags an out-of-bounds write and permits an in-bounds write.
  const watcher = createFilesystemWatcher();
  watcher.clearViolations();
  watcher.start();
  try {
    // In-bounds write (allowed).
    const inFile = path.join(base, 'logs', 'watcher-test-' + Date.now() + '.log');
    fs.mkdirSync(path.dirname(inFile), { recursive: true });
    fs.writeFileSync(inFile, 'ok');
    fs.unlinkSync(inFile);

    // Out-of-bounds write (should be flagged). Write then clean up.
    fs.writeFileSync(outside, 'violation');
    fs.unlinkSync(outside);
  } finally {
    watcher.stop();
  }

  const violations = watcher.getViolations();
  const flaggedOutside = violations.some(v => path.resolve(v.filePath) === path.resolve(outside));
  const flaggedInside = violations.some(v => path.resolve(v.filePath) === path.resolve(base, 'logs'));
  if (!flaggedOutside) throw new Error('FAIL: watcher did not flag the out-of-bounds write');
  if (flaggedInside) throw new Error('FAIL: watcher incorrectly flagged an in-bounds write');
  console.log('[PASS] watcher flags out-of-bounds writes and permits in-bounds writes');

  // 3. Allowed write paths are all within app-data.
  const allowed = getAllowedWritePaths();
  if (!allowed.length) throw new Error('FAIL: no allowed write paths configured');
  for (const p of allowed) {
    if (!isWithinAppData(p)) throw new Error('FAIL: allowed write path escapes app-data: ' + p);
  }
  console.log('[PASS] all allowed write paths are within app-data (' + allowed.length + ' paths)');

  console.log('\n=== No-Writes-Outside Test: 3/3 passed ===');
}

try {
  runTests();
} catch (error) {
  console.error('\n[FAIL] ' + error.message);
  process.exitCode = 1;
}
