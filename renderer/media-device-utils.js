(function exposeMediaDeviceUtils(root) {
  function preferredDeviceId(devices, preferredLabel, selectedId) {
    const available = Array.isArray(devices) ? devices : [];
    if (selectedId && available.some(device => device.deviceId === selectedId)) return selectedId;
    const preferred = available.find(device =>
      typeof device.label === 'string' &&
      device.label.toLowerCase().includes(preferredLabel.toLowerCase())
    );
    return preferred ? preferred.deviceId : '';
  }

  const api = { preferredDeviceId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.localCoreMediaDeviceUtils = api;
})(globalThis);
