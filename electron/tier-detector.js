/**
 * Tier Detector
 *
 * Phase 0 §3.2: Tier Detector
 *
 * Probes hardware (RAM/VRAM) and selects appropriate quality preset.
 * Determines whether the machine is floor, mid, or high tier.
 */

const os = require('os');
const { Tier, DEFAULT_TIER_PROFILES } = require('./resource-governor');

/**
 * Tier detection criteria
 * Phase 0 §3.2
 */
const TIER_CRITERIA = {
  [Tier.FLOOR]: {
    minRAMGB: 8,
    minVRAMGB: 0, // Integrated GPU
    cpuCores: 4
  },
  [Tier.MID]: {
    minRAMGB: 16,
    minVRAMGB: 8,
    cpuCores: 6
  },
  [Tier.HIGH]: {
    minRAMGB: 32,
    minVRAMGB: 16,
    cpuCores: 8
  }
};

/**
 * Create Tier Detector instance
 */
function createTierDetector() {
  /**
   * Get system RAM in GB
   */
  function getSystemRAMGB() {
    return os.totalmem() / (1024 * 1024 * 1024);
  }

  /**
   * Get CPU core count
   */
  function getCPUCores() {
    return os.cpus().length;
  }

  /**
   * Get GPU information (placeholder)
   * In production, this would use:
   * - Windows: WMI or DirectX
   * - Linux: lspci, nvidia-smi
   * - macOS: system_profiler
   */
  function getGPUInfo() {
    // Placeholder implementation
    // In production, integrate with actual GPU detection
    return {
      hasDedicatedGPU: false,
      vramGB: 0,
      name: 'unknown'
    };
  }

  /**
   * Detect the system tier
   */
  function detectTier() {
    const ramGB = getSystemRAMGB();
    const cpuCores = getCPUCores();
    const gpuInfo = getGPUInfo();

    // Check high tier
    if (ramGB >= TIER_CRITERIA[Tier.HIGH].minRAMGB &&
        gpuInfo.vramGB >= TIER_CRITERIA[Tier.HIGH].minVRAMGB &&
        cpuCores >= TIER_CRITERIA[Tier.HIGH].cpuCores) {
      return Tier.HIGH;
    }

    // Check mid tier
    if (ramGB >= TIER_CRITERIA[Tier.MID].minRAMGB &&
        gpuInfo.vramGB >= TIER_CRITERIA[Tier.MID].minVRAMGB &&
        cpuCores >= TIER_CRITERIA[Tier.MID].cpuCores) {
      return Tier.MID;
    }

    // Default to floor tier
    return Tier.FLOOR;
  }

  /**
   * Get the tier profile for detected tier
   */
  function getProfile() {
    const tier = detectTier();
    return DEFAULT_TIER_PROFILES[tier];
  }

  /**
   * Get system information for debugging
   */
  function getSystemInfo() {
    return {
      ramGB: getSystemRAMGB(),
      cpuCores: getCPUCores(),
      gpu: getGPUInfo(),
      detectedTier: detectTier()
    };
  }

  return {
    detectTier,
    getProfile,
    getSystemInfo
  };
}

module.exports = {
  createTierDetector,
  TIER_CRITERIA
};
