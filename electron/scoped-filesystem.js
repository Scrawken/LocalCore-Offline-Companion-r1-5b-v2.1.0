/**
 * Scoped FileSystem — Phase 5 §3
 *
 * Filesystem access confined to user-granted roots. Every path is canonicalized
 * and must resolve inside a granted root; traversal (`..`) and symlink escapes
 * are rejected. Read-only roots reject write/move/delete. Protected system
 * paths are deny-listed even under a broad root.
 *
 * The app never grants a root on its own — roots come from the user.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

// Protected locations that are never writable, even under a broad root.
const PROTECTED_SUBSTRINGS = [
  '\\LocalCore\\config\\',
  '\\LocalCore\\logs\\',
  '\\Windows\\',
  '\\Program Files',
  '\\System32\\'
];

function normalizeForContainment(p) {
  // Windows: case-insensitive, normalize separators and resolve . / ..
  return path.resolve(p).replace(/\//g, '\\').toLowerCase();
}

function createScopedFileSystem(roots = []) {
  // roots: [{ path, mode: 'read' | 'read-write' }]
  const grantedRoots = roots.map(r => ({
    path: r.path,
    mode: r.mode,
    normalized: normalizeForContainment(r.path)
  }));

  function findRoot(filePath, { write = false } = {}) {
    const normalized = normalizeForContainment(filePath);
    // Protected deny-list applies first.
    if (PROTECTED_SUBSTRINGS.some(sub => normalized.includes(sub.toLowerCase()))) {
      return { error: 'That location is protected and cannot be accessed.' };
    }
    for (const root of grantedRoots) {
      if (normalized === root.normalized || normalized.startsWith(root.normalized + '\\')) {
        if (write && root.mode !== 'read-write') {
          return { error: 'The folder "' + root.path + '" is read-only.' };
        }
        return { root };
      }
    }
    return { error: 'That path is outside every granted folder.' };
  }

  async function resolveContained(filePath, opts) {
    // Reject traversal before touching the disk.
    if (filePath.includes('..')) {
      throw new Error('Paths containing ".." are not allowed.');
    }
    const check = findRoot(filePath, opts);
    if (check.error) throw new Error(check.error);
    // Resolve symlinks: the final target must stay inside a root.
    try {
      const real = await fs.realpath(filePath);
      const realCheck = findRoot(real, opts);
      if (realCheck.error) throw new Error('That link points outside the granted folders.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // ENOENT is fine for write targets
    }
    return check.root;
  }

  return {
    async read(filePath) {
      await resolveContained(filePath, { write: false });
      return fs.readFile(filePath);
    },
    async write(filePath, data) {
      await resolveContained(filePath, { write: true });
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);
    },
    async list(dirPath) {
      await resolveContained(dirPath, { write: false });
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    },
    async move(from, to) {
      await resolveContained(from, { write: true });
      await resolveContained(to, { write: true });
      await fs.rename(from, to);
    },
    async delete(filePath) {
      // Quarantine by default (T3): move to a quarantine area, never hard-delete.
      await resolveContained(filePath, { write: true });
      const quarantineDir = path.join(grantedRoots[0] ? grantedRoots[0].path : path.dirname(filePath), '.localcore-quarantine');
      await fs.mkdir(quarantineDir, { recursive: true });
      const quarantineId = Date.now() + '-' + path.basename(filePath);
      await fs.rename(filePath, path.join(quarantineDir, quarantineId));
      return { quarantineId };
    },
    async restore(quarantineId, originalPath) {
      const quarantineDir = path.join(grantedRoots[0].path, '.localcore-quarantine');
      const quarantined = path.join(quarantineDir, path.basename(quarantineId));
      await fs.rename(quarantined, originalPath);
    },
    listRoots() {
      return grantedRoots.map(r => ({ path: r.path, mode: r.mode }));
    }
  };
}

module.exports = { createScopedFileSystem };
