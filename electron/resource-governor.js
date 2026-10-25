/**
 * Resource Governor
 *
 * Phase 0 §3: Floor-tier Resource Governor
 *
 * Manages heavy/light pipeline leases, eviction, and pressure handling.
 * Ensures LLM, STT, and TTS can coexist on the floor tier (8GB integrated GPU).
 */

const { randomUUID } = require('crypto');

/**
 * PipelineKind enum
 * Phase 0 §3.2
 */
const PipelineKind = {
  LLM: 'llm',
  STT: 'stt',
  TTS: 'tts',
  EMBEDDING: 'embedding',
  AVATAR: 'avatar',
  WAKE_WORD: 'wake-word'
};

/**
 * Tier enum
 */
const Tier = {
  FLOOR: 'floor',
  MID: 'mid',
  HIGH: 'high'
};

/**
 * Tier Profile
 * Phase 0 §3.2
 */
const DEFAULT_TIER_PROFILES = {
  [Tier.FLOOR]: {
    tier: Tier.FLOOR,
    maxConcurrentHeavy: 1,
    modelBudgetMB: 3000,
    avatarFps: 24,
    avatarQuality: 'low',
    llmIdleEvictMs: 90000,
    freeMemoryFloorMB: 700,
    peakMemoryCeilingMB: 6960,
    sttEnabled: true,
    ttsEnabled: true
  },
  [Tier.MID]: {
    tier: Tier.MID,
    maxConcurrentHeavy: 2,
    modelBudgetMB: 6000,
    avatarFps: 30,
    avatarQuality: 'medium',
    llmIdleEvictMs: 120000,
    freeMemoryFloorMB: 1000,
    peakMemoryCeilingMB: 10240,
    sttEnabled: true,
    ttsEnabled: true
  },
  [Tier.HIGH]: {
    tier: Tier.HIGH,
    maxConcurrentHeavy: 3,
    modelBudgetMB: 12000,
    avatarFps: 60,
    avatarQuality: 'high',
    llmIdleEvictMs: 180000,
    freeMemoryFloorMB: 2000,
    peakMemoryCeilingMB: 20480,
    sttEnabled: true,
    ttsEnabled: true
  }
};

/**
 * Heavy pipelines (mutually constrained)
 * Phase 0 §3.2
 */
const HEAVY_PIPELINES = [PipelineKind.LLM, PipelineKind.STT, PipelineKind.TTS];

/**
 * Light pipelines (always allowed, throttled)
 * Phase 0 §3.2
 */
const LIGHT_PIPELINES = [PipelineKind.EMBEDDING, PipelineKind.AVATAR, PipelineKind.WAKE_WORD];

/**
 * Check if a pipeline is heavy
 */
function isHeavy(kind) {
  return HEAVY_PIPELINES.includes(kind);
}

/**
 * Create Resource Governor instance
 */
function createResourceGovernor() {
  let currentProfile = DEFAULT_TIER_PROFILES[Tier.FLOOR];
  const leases = new Map();
  const residentMB = new Map();
  const eventListeners = new Map();
  let evictions = 0;
  let lastPressureAt = null;

  /**
   * Acquire a lease for a pipeline
   * Phase 0 §3.3: Governor interface
   */
  async function acquire(kind, opts = {}) {
    const priority = opts.priority || 5;
    const timeoutMs = opts.timeoutMs || 30000;
    const leaseId = randomUUID();

    // Light pipelines are never blocked
    if (!isHeavy(kind)) {
      const lease = {
        id: leaseId,
        kind,
        acquiredAt: Date.now(),
        priority
      };
      leases.set(leaseId, lease);
      emit('lease-acquired', lease);
      return lease;
    }

    // Heavy pipelines require lease management
    const startTime = Date.now();

    // Wait for available slot
    while (Date.now() - startTime < timeoutMs) {
      const activeHeavyLeases = Array.from(leases.values()).filter(l => isHeavy(l.kind));
      
      if (activeHeavyLeases.length < currentProfile.maxConcurrentHeavy) {
        // Slot available
        const lease = {
          id: leaseId,
          kind,
          acquiredAt: Date.now(),
          priority
        };
        leases.set(leaseId, lease);
        emit('lease-acquired', lease);
        return lease;
      }

      // Check if we can evict a lower-priority lease
      const lowerPriority = activeHeavyLeases.find(l => l.priority < priority);
      if (lowerPriority) {
        evict(lowerPriority.id);
        continue;
      }

      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Timeout - return degraded lease
    const degradedLease = {
      id: leaseId,
      kind,
      acquiredAt: Date.now(),
      priority,
      degraded: true
    };
    leases.set(leaseId, degradedLease);
    emit('lease-degraded', degradedLease);
    return degradedLease;
  }

  /**
   * Release a lease
   */
  function release(lease) {
    if (!leases.has(lease.id)) {
      return;
    }

    leases.delete(lease.id);
    residentMB.delete(lease.kind);
    emit('lease-released', lease);
  }

  /**
   * Evict a specific lease
   */
  function evict(leaseId) {
    const lease = leases.get(leaseId);
    if (!lease) {
      return;
    }

    leases.delete(leaseId);
    residentMB.delete(lease.kind);
    evictions++;
    emit('lease-evicted', lease);
  }

  /**
   * Evict idle LLM leases
   */
  async function evictIdle() {
    const now = Date.now();
    const idleThreshold = currentProfile.llmIdleEvictMs;

    for (const [id, lease] of leases.entries()) {
      if (lease.kind === PipelineKind.LLM && !lease.degraded) {
        const idleTime = now - lease.acquiredAt;
        if (idleTime > idleThreshold) {
          evict(id);
        }
      }
    }
  }

  /**
   * Update resident memory for a pipeline
   */
  function updateResidentMemory(kind, mb) {
    residentMB.set(kind, mb);

    // Check pressure
    const totalResident = Array.from(residentMB.values()).reduce((sum, val) => sum + val, 0);
    
    if (totalResident > currentProfile.peakMemoryCeilingMB) {
      emit('pressure', {
        total: totalResident,
        ceiling: currentProfile.peakMemoryCeilingMB,
        resident: Object.fromEntries(residentMB)
      });
      lastPressureAt = now;

      // Evict heavy leases to free memory
      const heavyLeases = Array.from(leases.values()).filter(l => isHeavy(l.kind));
      if (heavyLeases.length > 0) {
        evict(heavyLeases[0].id);
      }
    }

    // Check free memory floor
    const freeMemory = getAvailableMemoryMB();
    if (freeMemory < currentProfile.freeMemoryFloorMB) {
      emit('pressure', {
        type: 'low-memory',
        free: freeMemory,
        floor: currentProfile.freeMemoryFloorMB
      });
      lastPressureAt = now;
    }
  }

  /**
   * Get available memory (placeholder - would use OS APIs in production)
   */
  function getAvailableMemoryMB() {
    // Placeholder - in production, use OS-specific APIs
    // For now, return a reasonable default
    return 8192 - (Array.from(residentMB.values()).reduce((sum, val) => sum + val, 0));
  }

  /**
   * Set the active tier profile
   */
  function setProfile(profile) {
    currentProfile = profile;
    emit('profile-changed', profile);
  }

  /**
   * Get governor statistics
   * Phase 0 §3.3
   */
  function stats() {
    return {
      activeLeases: Array.from(leases.values()),
      residentMB: Object.fromEntries(residentMB),
      evictions,
      lastPressureAt,
      profile: currentProfile
    };
  }

  /**
   * Register event listener
   */
  function on(event, callback) {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, []);
    }
    eventListeners.get(event).push(callback);
  }

  /**
   * Emit event to listeners
   */
  function emit(event, data) {
    const listeners = eventListeners.get(event) || [];
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error('[ResourceGovernor] Event listener error:', error);
      }
    }
  }

  return {
    acquire,
    release,
    evict,
    evictIdle,
    updateResidentMemory,
    setProfile,
    stats,
    on
  };
}

module.exports = {
  createResourceGovernor,
  PipelineKind,
  Tier,
  DEFAULT_TIER_PROFILES,
  HEAVY_PIPELINES,
  LIGHT_PIPELINES,
  isHeavy
};
