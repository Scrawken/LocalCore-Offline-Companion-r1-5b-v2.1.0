const assert = require('assert');
const { preferredDeviceId } = require('../renderer/media-device-utils.js');

const devices = [
  { deviceId: 'default', label: 'Default - Microphone' },
  { deviceId: 'razer', label: 'Microphone (Razer Seiren X)' },
  { deviceId: 'emeet', label: 'HD Webcam eMeet C960' }
];

assert.strictEqual(preferredDeviceId(devices, 'Razer Seiren X', ''), 'razer');
assert.strictEqual(preferredDeviceId(devices, 'HD Webcam eMeet C960', ''), 'emeet');
assert.strictEqual(preferredDeviceId(devices, 'Razer Seiren X', 'default'), 'default');
assert.strictEqual(preferredDeviceId(devices, 'Razer Seiren X', 'removed'), 'razer');
assert.strictEqual(preferredDeviceId([], 'Razer Seiren X', ''), '');
console.log('Media device preference tests passed.');
