# Model Provider Architecture Decision

**Date:** 2026-10-19
**Decision:** Create ModelProvider interface wrapping llama.cpp (Option C from gap analysis)

---

## Background

The Phase 1 blueprint specifies **Ollama** as the local inference runtime with an authenticated Local Inference Proxy (LIP). However, the current implementation uses **llama.cpp directly** and it's working.

## Options Considered

### Option A: Migrate to Ollama (follows blueprint exactly)
- **Pros:**
  - Matches blueprint specification exactly
  - Ollama has better model management and ecosystem
  - Built-in model registry and versioning
- **Cons:**
  - Requires complete refactoring of working code
  - Larger binary bundle (~100MB+ for Ollama)
  - Higher memory footprint
  - Delays Phase 0 implementation
- **Impact:** High - affects S0.3, S1.3, S1.4

### Option B: Keep llama.cpp, adapt blueprint (pragmatic)
- **Pros:**
  - Keep working implementation
  - Smaller footprint (~50MB for llama.cpp)
  - Faster to market
- **Cons:**
  - Blueprint changes needed across multiple documents
  - Loses Ollama ecosystem benefits
  - Model management must be reimplemented
- **Impact:** Medium - update Phase 1 spec, keep S0.3 architecture similar

### Option C: Hybrid - llama.cpp with ModelProvider interface (CHOSEN)
- **Pros:**
  - Keep working llama.cpp implementation
  - Add abstraction layer for future flexibility
  - Minimal disruption to existing code
  - Can swap to Ollama later by replacing one provider
  - Aligns with blueprint's pluggable provider philosophy
- **Cons:**
  - Extra abstraction layer
  - Still need minor spec updates (llama.cpp instead of Ollama)
- **Impact:** Medium - create ModelProvider interface, update Phase 1 spec to reference llama.cpp

## Decision Rationale

**Option C was chosen** because:

1. **Preserves working code:** The current llama.cpp implementation is functional and tested. Replacing it would introduce risk without clear benefit.

2. **Blueprint alignment:** The blueprint's core insight is pluggable providers, not Ollama specifically. The ModelProvider interface is the key abstraction.

3. **Future flexibility:** By implementing the interface now, we can swap to Ollama (or any other runtime) later by only replacing the provider implementation.

4. **Minimal disruption:** Existing `engine/local-inference-daemon.js` continues to work; we just wrap it in the new interface.

5. **Smaller footprint:** llama.cpp is significantly smaller than Ollama, which matters for the floor-tier 8GB target.

## Implementation

### Files Created

1. **`engine/llama-cpp-provider.js`**
   - Implements `ModelProvider` interface (Phase 1 §3.1)
   - Wraps existing llama.cpp daemon
   - Integrates with Resource Governor (when available)
   - Provides streaming completion, health checks, load/unload

2. **`engine/ModelProviderRegistry`**
   - Implements provider registry (Phase 1 §3.2)
   - Allows multiple providers to be registered
   - Supports default provider selection

### Key Features

- **Lease ownership:** Provider acquires/releases `llm` lease per Phase 1 §3.3.3
- **Streaming:** Implements `AsyncIterable<CompletionChunk>` per Phase 1 §3.1
- **Health checks:** Provides provider health status
- **Governor integration:** Placeholder for Resource Governor (will be connected in Phase 0 S0.2)
- **Error handling:** Handles server startup, timeouts, and cancellation

### Integration Points

```javascript
// Phase 0 S0.2: Connect Resource Governor
const { setResourceGovernor } = require('./engine/llama-cpp-provider');
setResourceGovernor(resourceGovernor);

// Phase 1 S1.2: Use provider in ChatEngine
const { providerRegistry } = require('./engine/llama-cpp-provider');
const provider = providerRegistry.getDefault();
const stream = provider.stream(req);
```

## Blueprint Updates Needed

The following blueprint sections should be updated to reference llama.cpp instead of Ollama:

### Phase 1 §3.3 (Provider A)
- Change title from "Bundled Ollama behind an authenticated proxy" to "Bundled llama.cpp with ModelProvider interface"
- Remove LIP (Local Inference Proxy) specification
- Replace Ollama-specific configuration with llama.cpp equivalents
- Keep auth proxy concept for future cloud providers
- Update model delivery section (direct GGUF download instead of Ollama pull)

### Phase 1 §3.3.3 (Governor integration)
- Update to reference llama.cpp process tree instead of Ollama
- Keep lease ownership and idle unload concepts

### Phase 1 §3.3.4 (Authenticated proxy contract)
- Mark as "deferred to Phase 6" for cloud providers only
- Local llama.cpp doesn't need a proxy (direct loopback is safe)

### Phase 1 §3.3.5 (Egress containment)
- Update to apply to llama.cpp process instead of Ollama
- Configure llama.cpp with no external network access

## Migration Path to Ollama (Future)

If Ollama becomes preferable in the future:

1. Create `engine/ollama-provider.js` implementing the same `ModelProvider` interface
2. Register it in the registry: `providerRegistry.register(new OllamaProvider())`
3. Update configuration to use Ollama as default
4. Remove llama.cpp provider (or keep as fallback)
5. No changes needed to ChatEngine or other consuming code

## Testing

The provider should be tested with:

1. **Load/unload cycle:** Verify model loads and unloads correctly
2. **Streaming:** Verify tokens stream correctly
3. **Cancellation:** Verify AbortSignal works
4. **Health checks:** Verify health status reporting
5. **Governor integration:** Verify lease acquisition/release (after Phase 0 S0.2)
6. **Error handling:** Verify graceful failure on missing model/runtime

## Conclusion

This decision keeps the project moving forward while maintaining architectural flexibility. The llama.cpp provider implements the blueprint's ModelProvider contract, making future runtime swaps trivial. The only blueprint changes needed are documentation updates to reflect the actual runtime being used.

**Status:** ✅ Implemented - `engine/llama-cpp-provider.js` created and ready for Phase 0 integration.
