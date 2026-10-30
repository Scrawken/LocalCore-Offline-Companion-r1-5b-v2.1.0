/**
 * safeStorage crypto provider for at-rest encryption.
 *
 * Wraps Electron's safeStorage (Windows DPAPI on this target) behind a small
 * provider interface consumed by local-memory-store.js. Encryption keys are
 * managed by the OS and tied to the current user's login; no key material is
 * stored by LocalCore.
 *
 * safeStorage is only available in the real Electron main process after
 * app.whenReady(); callers must tolerate isAvailable() === false (e.g. Linux
 * dev without a keyring, or unit tests running under plain Node).
 */

function createSafeStorageCrypto() {
  let safeStorage = null;
  try {
    // Defer require so this module can be loaded under plain Node in tests.
    safeStorage = require('electron').safeStorage;
  } catch {
    safeStorage = null;
  }

  return {
    isAvailable() {
      try {
        return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
      } catch {
        return false;
      }
    },
    encrypt(utf8String) {
      if (!this.isAvailable()) throw new Error('Encryption is not available on this device.');
      return safeStorage.encryptString(utf8String);
    },
    decrypt(buffer) {
      if (!this.isAvailable()) throw new Error('Encryption is not available on this device.');
      return safeStorage.decryptString(buffer);
    }
  };
}

module.exports = { createSafeStorageCrypto };
