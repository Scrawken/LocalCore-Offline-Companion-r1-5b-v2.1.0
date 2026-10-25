/**
 * Performance Metrics Collector
 *
 * Phase 0 S0.4: Floor-tier feasibility spike
 *
 * Collects performance metrics for feasibility testing:
 * - First-token latency
 * - Tokens per second
 * - Memory usage (RSS, working set)
 * - GPU memory
 * - Avatar FPS
 * - STT/TTS latency
 */

const os = require('os');
const { createResourceSampler } = require('./resource-sampler');

/**
 * Create performance metrics collector
 */
function createPerformanceCollector() {
  const resourceSampler = createResourceSampler();
  const metrics = {
    inference: [],
    memory: [],
    gpu: [],
    avatar: [],
    speech: []
  };

  /**
   * Record inference metrics
   */
  function recordInference(promptTokens, completionTokens, latencyMs, modelId) {
    const metricsEntry = {
      timestamp: Date.now(),
      modelId,
      promptTokens,
      completionTokens,
      latencyMs,
      tokensPerSecond: (completionTokens / (latencyMs / 1000)).toFixed(2),
      firstTokenLatencyMs: null // To be measured separately
    };
    metrics.inference.push(metricsEntry);
    return metricsEntry;
  }

  /**
   * Record memory snapshot
   */
  function recordMemory() {
    const processMemory = process.memoryUsage();
    const systemMemory = resourceSampler.sampleMemory();
    
    const metricsEntry = {
      timestamp: Date.now(),
      process: {
        rssMB: processMemory.rss / (1024 * 1024),
        heapTotalMB: processMemory.heapTotal / (1024 * 1024),
        heapUsedMB: processMemory.heapUsed / (1024 * 1024),
        externalMB: processMemory.external / (1024 * 1024)
      },
      system: {
        totalMB: systemMemory.totalMB,
        freeMB: systemMemory.freeMB,
        usedMB: systemMemory.usedMB,
        usagePercent: systemMemory.usagePercent
      }
    };
    metrics.memory.push(metricsEntry);
    return metricsEntry;
  }

  /**
   * Record GPU metrics (placeholder)
   * Phase 0 S0.4: Requires OS-specific integration
   */
  function recordGPU() {
    const gpuData = resourceSampler.sampleGPU();
    
    const metricsEntry = {
      timestamp: Date.now(),
      vramTotalMB: gpuData.vramTotalMB,
      vramUsedMB: gpuData.vramUsedMB,
      vramFreeMB: gpuData.vramFreeMB,
      utilizationPercent: gpuData.utilizationPercent,
      temperatureC: gpuData.temperatureC,
      note: 'GPU data is placeholder - requires OS integration'
    };
    metrics.gpu.push(metricsEntry);
    return metricsEntry;
  }

  /**
   * Record avatar performance
   */
  function recordAvatar(fps, frameTimeMs, droppedFrames) {
    const metricsEntry = {
      timestamp: Date.now(),
      fps,
      frameTimeMs,
      droppedFrames,
      quality: determineAvatarQuality(fps)
    };
    metrics.avatar.push(metricsEntry);
    return metricsEntry;
  }

  /**
   * Determine avatar quality based on FPS
   */
  function determineAvatarQuality(fps) {
    if (fps >= 60) return 'high';
    if (fps >= 30) return 'medium';
    if (fps >= 24) return 'low';
    return 'degraded';
  }

  /**
   * Record speech metrics
   */
  function recordSpeech(type, durationMs, audioLengthMs) {
    const metricsEntry = {
      timestamp: Date.now(),
      type, // 'stt' or 'tts'
      durationMs,
      audioLengthMs,
      processingOverheadMs: durationMs - audioLengthMs,
      realtimeFactor: audioLengthMs / durationMs
    };
    metrics.speech.push(metricsEntry);
    return metricsEntry;
  }

  /**
   * Get aggregated statistics
   */
  function getStats() {
    return {
      inference: aggregateInferenceStats(),
      memory: aggregateMemoryStats(),
      gpu: aggregateGPUStats(),
      avatar: aggregateAvatarStats(),
      speech: aggregateSpeechStats()
    };
  }

  /**
   * Aggregate inference statistics
   */
  function aggregateInferenceStats() {
    if (metrics.inference.length === 0) return null;

    const latencies = metrics.inference.map(m => m.latencyMs);
    const tps = metrics.inference.map(m => parseFloat(m.tokensPerSecond));

    return {
      count: metrics.inference.length,
      avgLatencyMs: average(latencies),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      avgTokensPerSecond: average(tps),
      minTokensPerSecond: Math.min(...tps),
      maxTokensPerSecond: Math.max(...tps)
    };
  }

  /**
   * Aggregate memory statistics
   */
  function aggregateMemoryStats() {
    if (metrics.memory.length === 0) return null;

    const rss = metrics.memory.map(m => m.process.rssMB);
    const systemUsage = metrics.memory.map(m => m.system.usagePercent);

    return {
      count: metrics.memory.length,
      avgProcessRSS_MB: average(rss),
      maxProcessRSS_MB: Math.max(...rss),
      avgSystemUsagePercent: average(systemUsage),
      maxSystemUsagePercent: Math.max(...systemUsage)
    };
  }

  /**
   * Aggregate GPU statistics
   */
  function aggregateGPUStats() {
    if (metrics.gpu.length === 0) return null;

    const vramUsed = metrics.gpu.filter(m => m.vramUsedMB > 0).map(m => m.vramUsedMB);
    
    if (vramUsed.length === 0) {
      return { count: metrics.gpu.length, note: 'No GPU data available' };
    }

    return {
      count: metrics.gpu.length,
      avgVRAMUsedMB: average(vramUsed),
      maxVRAMUsedMB: Math.max(...vramUsed),
      note: 'GPU data requires OS integration'
    };
  }

  /**
   * Aggregate avatar statistics
   */
  function aggregateAvatarStats() {
    if (metrics.avatar.length === 0) return null;

    const fps = metrics.avatar.map(m => m.fps);
    const dropped = metrics.avatar.map(m => m.droppedFrames);

    return {
      count: metrics.avatar.length,
      avgFPS: average(fps),
      minFPS: Math.min(...fps),
      maxFPS: Math.max(...fps),
      totalDroppedFrames: dropped.reduce((sum, d) => sum + d, 0)
    };
  }

  /**
   * Aggregate speech statistics
   */
  function aggregateSpeechStats() {
    if (metrics.speech.length === 0) return null;

    const stt = metrics.speech.filter(m => m.type === 'stt');
    const tts = metrics.speech.filter(m => m.type === 'tts');

    return {
      count: metrics.speech.length,
      stt: {
        count: stt.length,
        avgLatencyMs: stt.length > 0 ? average(stt.map(m => m.durationMs)) : null
      },
      tts: {
        count: tts.length,
        avgLatencyMs: tts.length > 0 ? average(tts.map(m => m.durationMs)) : null
      }
    };
  }

  /**
   * Calculate average
   */
  function average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Clear all metrics
   */
  function clear() {
    metrics.inference = [];
    metrics.memory = [];
    metrics.gpu = [];
    metrics.avatar = [];
    metrics.speech = [];
  }

  /**
   * Export metrics as JSON
   */
  function exportJSON() {
    return JSON.stringify(metrics, null, 2);
  }

  return {
    recordInference,
    recordMemory,
    recordGPU,
    recordAvatar,
    recordSpeech,
    getStats,
    clear,
    exportJSON
  };
}

module.exports = {
  createPerformanceCollector
};
