/**
 * Resource Sampler
 *
 * Phase 0 §3.6: Instrumentation
 *
 * Samples system resources (memory, CPU, GPU) for governor decisions.
 * Provides metrics for the floor-tier feasibility test (S0.4).
 */

const os = require('os');

/**
 * Create Resource Sampler instance
 */
function createResourceSampler() {
  /**
   * Sample memory usage
   */
  function sampleMemory() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      totalMB: total / (1024 * 1024),
      freeMB: free / (1024 * 1024),
      usedMB: used / (1024 * 1024),
      usagePercent: (used / total) * 100
    };
  }

  /**
   * Sample CPU usage
   */
  function sampleCPU() {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // Calculate average CPU usage from all cores
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type of ['user', 'nice', 'sys', 'irq', 'steal']) {
        totalTick += cpu.times[type];
      }
      totalTick += cpu.times.idle;
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = ((total - idle) / total) * 100;

    return {
      usagePercent: usage,
      cores: cpus.length,
      loadAverage1m: loadAverage[0],
      loadAverage5m: loadAverage[1],
      loadAverage15m: loadAverage[2]
    };
  }

  /**
   * Sample GPU usage (placeholder)
   * In production, this would use:
   * - Windows: WMI, DirectX, nvidia-smi
   * - Linux: nvidia-smi, AMD GPU tools
   * - macOS: system_profiler
   */
  function sampleGPU() {
    // Placeholder implementation
    return {
      vramTotalMB: 0,
      vramUsedMB: 0,
      vramFreeMB: 0,
      utilizationPercent: 0,
      temperatureC: 0,
      name: 'unknown'
    };
  }

  /**
   * Sample all resources
   */
  function sampleAll() {
    return {
      timestamp: Date.now(),
      memory: sampleMemory(),
      cpu: sampleCPU(),
      gpu: sampleGPU()
    };
  }

  /**
   * Continuous sampling with callback
   */
  function startSampling(intervalMs, callback) {
    const interval = setInterval(() => {
      try {
        const sample = sampleAll();
        callback(sample);
      } catch (error) {
        console.error('[ResourceSampler] Sampling error:', error);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }

  return {
    sampleMemory,
    sampleCPU,
    sampleGPU,
    sampleAll,
    startSampling
  };
}

module.exports = {
  createResourceSampler
};
