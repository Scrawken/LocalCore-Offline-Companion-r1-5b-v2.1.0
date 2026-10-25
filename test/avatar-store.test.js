const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createAvatarStore, maximumAvatarBytes, validateAvatarBytes } = require('../electron/avatar-store.js');

async function run() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'localcore-avatar-test-'));
  try {
    const store = createAvatarStore(directory);
    assert.strictEqual(await store.load(), null, 'no avatar is reported before one is saved');
    const bytes = new Uint8Array(16);
    bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
    new DataView(bytes.buffer).setUint32(4, 2, true);
    new DataView(bytes.buffer).setUint32(8, bytes.byteLength, true);
    await store.save(bytes);
    assert.deepStrictEqual(await store.load(), bytes, 'saved avatar bytes are restored exactly');
    const replacement = new Uint8Array(bytes);
    replacement[12] = 42;
    await store.save(replacement);
    assert.deepStrictEqual(await store.load(), replacement, 'replacement atomically becomes the active avatar');
    assert(maximumAvatarBytes >= 334680528, 'the accepted size includes the Sombra VRM file');
    assert.throws(() => validateAvatarBytes(new Uint8Array([1, 2, 3])), /between 12 bytes and 512 MB/);
    const invalidVersion = new Uint8Array(bytes);
    new DataView(invalidVersion.buffer).setUint32(4, 1, true);
    assert.throws(() => validateAvatarBytes(invalidVersion), /not a binary VRM\/GLB/);
    const invalidLength = new Uint8Array(bytes);
    new DataView(invalidLength.buffer).setUint32(8, 12, true);
    assert.throws(() => validateAvatarBytes(invalidLength), /not a binary VRM\/GLB/);
    console.log('Avatar storage tests passed.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('Avatar storage tests failed:', error);
  process.exitCode = 1;
});
