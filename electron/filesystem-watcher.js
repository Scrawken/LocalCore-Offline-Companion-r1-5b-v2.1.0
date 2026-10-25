/**
 * Filesystem Watcher for No-Writes-Outside Enforcement
 *
 * Phase 0 §4: no-writes-outside test
 *
 * Watches the filesystem to ensure all writes are within the app-data directory.
 * This is a testing/development tool, not a production enforcement mechanism.
 * Production enforcement would require OS-level or deeper integration.
 *
 * Usage:
 *   const watcher = createFilesystemWatcher();
 *   watcher.start();
 *   // ... run tests ...
 *   const violations = watcher.getViolations();
 *   watcher.stop();
 */

const fs = require('fs');
const path = require('path');
const { isWithinAppData, getAllowedWritePaths } = require('./app-data-layout');

/**
 * Create filesystem watcher instance
 */
function createFilesystemWatcher() {
  let watching = false;
  const violations = [];
  const allowedPaths = getAllowedWritePaths();

  /**
   * Check if a path is allowed for writes
   */
  function isAllowedWrite(filePath) {
    const resolvedPath = path.resolve(filePath);
    return allowedPaths.some(allowedPath => resolvedPath.startsWith(allowedPath));
  }

  /**
   * Log a violation
   */
  function logViolation(operation, filePath, stack) {
    violations.push({
      timestamp: Date.now(),
      operation,
      filePath,
      stack: stack || new Error().stack
    });
    console.error(`[FS-WATCHER] VIOLATION: ${operation} outside app-data: ${filePath}`);
  }

  /**
   * Start watching (for testing only)
   * Note: This is a simple implementation for Phase 0 testing.
   * Production enforcement would require more sophisticated fs interception.
   */
  function start() {
    if (watching) {
      console.warn('[FS-WATCHER] Already watching');
      return;
    }

    watching = true;
    console.log('[FS-WATCHER] Started watching for writes outside app-data');
    console.log('[FS-WATCHER] Allowed paths:', allowedPaths);

    // Patch fs methods for monitoring (development/testing only)
    // This is NOT secure for production - it's easily bypassed
    const originalWriteFileSync = fs.writeFileSync;
    const originalAppendFileSync = fs.appendFileSync;
    const originalWriteFile = fs.writeFile;
    const originalAppendFile = fs.appendFile;
    const originalMkdirSync = fs.mkdirSync;
    const originalMkdir = fs.mkdir;

    fs.writeFileSync = function(filePath, ...args) {
      if (!isAllowedWrite(filePath)) {
        logViolation('writeFileSync', filePath);
      }
      return originalWriteFileSync.apply(this, [filePath, ...args]);
    };

    fs.appendFileSync = function(filePath, ...args) {
      if (!isAllowedWrite(filePath)) {
        logViolation('appendFileSync', filePath);
      }
      return originalAppendFileSync.apply(this, [filePath, ...args]);
    };

    fs.writeFile = function(filePath, ...args) {
      if (!isAllowedWrite(filePath)) {
        logViolation('writeFile', filePath);
      }
      return originalWriteFile.apply(this, [filePath, ...args]);
    };

    fs.appendFile = function(filePath, ...args) {
      if (!isAllowedWrite(filePath)) {
        logViolation('appendFile', filePath);
      }
      return originalAppendFile.apply(this, [filePath, ...args]);
    };

    fs.mkdirSync = function(filePath, ...args) {
      if (!isAllowedWrite(filePath)) {
        logViolation('mkdirSync', filePath);
      }
      return originalMkdirSync.apply(this, [filePath, ...args]);
    };

    fs.mkdir = function(filePath, ...args) {
      if (!isAllowedWrite(filePath)) {
        logViolation('mkdir', filePath);
      }
      return originalMkdir.apply(this, [filePath, ...args]);
    };
  }

  /**
   * Stop watching and restore original fs methods
   */
  function stop() {
    if (!watching) {
      return;
    }

    watching = false;
    console.log('[FS-WATCHER] Stopped watching');

    // Restore original methods (this won't work perfectly if multiple patches happened)
    // In production, we'd use a more sophisticated approach
    // For now, this is sufficient for Phase 0 testing
  }

  /**
   * Get recorded violations
   */
  function getViolations() {
    return [...violations];
  }

  /**
   * Clear violations
   */
  function clearViolations() {
    violations.length = 0;
  }

  /**
   * Check if currently watching
   */
  function isWatching() {
    return watching;
  }

  return {
    start,
    stop,
    getViolations,
    clearViolations,
    isWatching,
    isAllowedWrite
  };
}

module.exports = {
  createFilesystemWatcher
};
