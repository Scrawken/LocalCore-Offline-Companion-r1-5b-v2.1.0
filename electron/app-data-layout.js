/**
 * App-Data Layout Manager
 *
 * Phase 0 §4: App-data layout and no-writes-outside guarantee
 *
 * Manages the LocalCore application data directory structure:
 * %APPDATA%/LocalCore/
 *   config/
 *   conversations/       (encrypted)
 *   memory/
 *     facts/
 *     summaries/
 *     transcripts/       (rolling window; pruned per retention)
 *   assets/              (generated media, VRM, voice)
 *   models/              (downloaded model weights)
 *   logs/
 *     egress-audit.log   (append-only, encrypted, clearable, default 30-day retention)
 *   governor/            (lease traces, reports)
 */

const fs = require('fs');
const path = require('path');

/**
 * Get the LocalCore app-data directory
 */
function getAppDataPath() {
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'LocalCore');
  }
  // Fallback for non-Windows (shouldn't happen in production)
  return path.join(require('electron').app.getPath('userData'), 'LocalCore');
}

/**
 * Ensure all required directories exist
 */
function ensureAppDataStructure() {
  const basePath = getAppDataPath();
  const directories = [
    basePath,
    path.join(basePath, 'config'),
    path.join(basePath, 'conversations'),
    path.join(basePath, 'memory'),
    path.join(basePath, 'memory', 'facts'),
    path.join(basePath, 'memory', 'summaries'),
    path.join(basePath, 'memory', 'transcripts'),
    path.join(basePath, 'assets'),
    path.join(basePath, 'models'),
    path.join(basePath, 'logs'),
    path.join(basePath, 'governor')
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return basePath;
}

/**
 * Get path for a specific app-data subdirectory
 */
function getPath(subdirectory) {
  const basePath = getAppDataPath();
  return path.join(basePath, subdirectory);
}

/**
 * Validate that all writes are within app-data
 * Phase 0 no-writes-outside test helper
 */
function isWithinAppData(filePath) {
  const basePath = getAppDataPath();
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(basePath);
  return resolvedPath.startsWith(resolvedBase);
}

/**
 * Get allowed write paths for validation
 */
function getAllowedWritePaths() {
  const basePath = getAppDataPath();
  return [
    basePath,
    path.join(basePath, 'config'),
    path.join(basePath, 'conversations'),
    path.join(basePath, 'memory'),
    path.join(basePath, 'assets'),
    path.join(basePath, 'models'),
    path.join(basePath, 'logs'),
    path.join(basePath, 'governor')
  ].map(p => path.resolve(p));
}

module.exports = {
  getAppDataPath,
  ensureAppDataStructure,
  getPath,
  isWithinAppData,
  getAllowedWritePaths
};
