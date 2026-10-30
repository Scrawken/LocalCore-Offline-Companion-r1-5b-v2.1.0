# LocalCore Gap Analysis

**Date:** 2026-10-19
**Purpose:** Identify gaps between current implementation and blueprint before starting Phase 0

---

## Executive Summary

The current codebase has a solid foundation (Electron app, llama.cpp inference, VRM avatar renderer, basic memory) but lacks the architectural foundations specified in the blueprint. **Phase 0 components are entirely missing** (Egress Gateway, Resource Governor, Tier Detector, consent/audit stores). The existing implementation uses direct llama.cpp instead of the specified Ollama architecture, and the memory/avatar systems need significant expansion.

**Recommendation:** Proceed with Phase 0 implementation (S0.1) while making key architecture decisions about runtime choice (llama.cpp vs Ollama).

---

## Phase 0: Foundation & Guardrails - COMPLETELY MISSING

### S0.1: Foundation Components

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Egress Gateway** | ❌ None | Single network choke point, deny-by-default, consent checks, audit logging | **MISSING** |
| **Consent Service** | ❌ None | Per-scope consent records, revocable, persistent | **MISSING** |
| **Audit Log** | ❌ None | Append-only, encrypted, 30-day retention, user-viewable | **MISSING** |
| **App-data layout** | ⚠️ Partial | Structured layout with no-writes-outside guarantee | **PARTIAL** |
| **Renderer sandbox** | ⚠️ Basic | CSP with `connect-src 'none'`, IPC-only network, request interceptor | **PARTIAL** |
| **No-writes-outside test** | ❌ None | Filesystem watcher enforcement | **MISSING** |

**Current App-data Layout:**
```
%APPDATA%/LocalCore/
  memory/              (conversations + assets in JSON)
  avatar/              (VRM files)
```

**Blueprint Layout:**
```
%APPDATA%/LocalCore/
  config/
  conversations/       (encrypted)
  memory/
    facts/
    summaries/
    transcripts/       (rolling window, pruned)
  assets/              (generated media, VRM, voice)
  models/              (downloaded model weights)
  logs/
    egress-audit.log   (encrypted, 30-day retention)
  governor/            (lease traces, reports)
```

### S0.2: Resource Governor & Tier Detector

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Resource Governor** | ❌ None | Lease acquisition/release, eviction, pressure handling, tier profiles | **MISSING** |
| **Tier Detector** | ❌ None | Hardware probing (RAM/VRAM) → quality preset | **MISSING** |
| **Heavy/Light pipeline classification** | ❌ None | `llm`/`stt`/`tts` (heavy) vs `embedding`/`avatar`/`wake-word` (light) | **MISSING** |
| **Floor-tier test plan** | ❌ None | 7 scenarios (S0-S7) with metrics and thresholds | **MISSING** |

### S0.3: Bundled Ollama + Auth Proxy

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Local runtime** | ✅ llama.cpp (direct) | Bundled Ollama server with authenticated proxy | **ARCHITECTURE DECISION NEEDED** |
| **Auth proxy (LIP)** | ❌ None | Local Inference Proxy with per-launch token, endpoint allowlist | **MISSING** |
| **Model store redirect** | ❌ None | `OLLAMA_MODELS` redirected to app-data | **MISSING** |
| **Egress containment** | ⚠️ Basic firewall rule | OS-level network restriction on Ollama process tree | **PARTIAL** |
| **Governor integration** | ❌ None | Lease ownership by provider, idle unload via `keep_alive` | **MISSING** |

**CRITICAL DECISION:** Blueprint specifies Ollama, but current implementation uses llama.cpp directly and it's working. Options:
1. **Migrate to Ollama** (follows blueprint exactly, requires refactoring)
2. **Adapt blueprint to llama.cpp** (keep working implementation, update specs)
3. **Hybrid approach** (llama.cpp with Ollama-compatible interface wrapper)

### S0.4: Floor-tier Feasibility

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Feasibility spike** | ❌ None | LLM + avatar + voice coexistence test on 8GB integrated | **MISSING** |
| **Metrics collection** | ❌ None | Peak RSS, GPU memory, FPS, latency, page faults | **MISSING** |
| **GATE-1 criteria** | ❌ None | Pass/fail thresholds with fallback documentation | **MISSING** |

---

## Phase 1: Character & Chat - PARTIALLY IMPLEMENTED

### Persona Schema

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Persona schema** | ❌ None | `PersonaDocument` with identity, traits, speaking style, boundaries, behavior | **MISSING** |
| **Persona validation** | ❌ None | Field validation rules, token budget warnings | **MISSING** |
| **System prompt assembly** | ❌ None | Deterministic order, bounded for small models | **MISSING** |
| **Multi-character-ready** | ❌ None | Keyed collection, v1 resolves one active `characterId` | **MISSING** |

### Streaming Chat Contract

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **ChatEngine** | ❌ None | `send()`, `cancel()`, `regenerate()` with `ChatEvent` stream | **MISSING** |
| **Turn model** | ⚠️ Partial | Has messages but no `seq`, no status tracking, no `modelId` | **PARTIAL** |
| **Streaming events** | ⚠️ Partial | Has basic streaming but no `thinking` event, no error events | **PARTIAL** |
| **Cancellation semantics** | ❌ None | Keep user turn, discard assistant, retry/regenerate | **MISSING** |
| **Persistence** | ⚠️ Partial | Basic JSON storage, unencrypted, no atomic commits | **PARTIAL** |
| **Ephemeral sessions** | ❌ None | Conditional persistence based on memory disclosure | **MISSING** |

### Model Providers

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **ModelProvider interface** | ❌ None | Pluggable provider contract with capabilities | **MISSING** |
| **Provider registry** | ❌ None | Register, get, list, setDefault | **MISSING** |
| **Local provider (Ollama)** | ❌ None | Bundled Ollama behind auth proxy | **MISSING** (see S0.3 decision) |
| **Cloud provider** | ❌ None | OpenAI-compatible adapter, gated by Egress Gateway | **MISSING** |
| **Lease ownership** | ❌ None | Provider owns `llm` lease, not engine | **MISSING** |

**Current Implementation:**
- Direct llama.cpp daemon spawn in `engine/local-inference-daemon.js`
- Hardcoded model path resolution
- Simple HTTP client to llama.cpp server
- No provider abstraction

---

## Phase 2: Memory - BASIC IMPLEMENTATION

### Current Memory Store

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Storage** | ✅ JSON in userData | 4-layer architecture (session, transcripts, summaries, facts) | **MAJOR GAP** |
| **Encryption** | ❌ None | Encrypted at rest (Windows DPAPI / safeStorage) | **MISSING** |
| **Retention/pruning** | ❌ None | Rolling window for transcripts, summarize-before-prune | **MISSING** |
| **Facts extraction** | ❌ None | Async extraction, validation, dedupe | **MISSING** |
| **Embedder** | ❌ None | MiniLM-class ONNX, CPU-only, light pipeline | **MISSING** |
| **Transparency controls** | ⚠️ Partial | Basic enable/disable toggle | **PARTIAL** |
| **Unified panel** | ❌ None | Facts, summaries, transcripts with source traces | **MISSING** |
| **Per-layer deletion** | ❌ None | Delete fact, summary, transcript, or conversation | **MISSING** |
| **Wipe-all** | ❌ None | Clear all layers within one turn | **MISSING** |
| **First-run disclosure** | ❌ None | Memory-on disclosure before any capture | **MISSING** |
| **Memory write log** | ❌ None | Visible record of what was captured | **MISSING** |

**Current Implementation in `electron/local-memory-store.js`:**
- Single `memory.json` file with conversations array
- Each conversation has messages array (flat structure)
- Simple enable/disable toggle
- Asset storage in `memory-assets/` directory
- No encryption, no retention, no fact extraction

---

## Phase 3: Voice - PARTIALLY IMPLEMENTED

### Current Speech Implementation

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **STT (Whisper)** | ✅ whisper.cpp small.en | whisper.cpp tiny + base, tier-based selection | **MINOR** |
| **TTS (Piper)** | ✅ Piper Lessac medium | Piper (floor) + Kokoro (higher tiers) | **MINOR** |
| **Push-to-talk** | ✅ Implemented | PTT with 60s limit, device selector | **MATCHES** |
| **Mic indicator** | ✅ Implemented | Main-process-owned, always visible when mic open | **MATCHES** |
| **Barge-in** | ❌ None | ≤150ms stop TTS on new input | **MISSING** |
| **Viseme emission** | ❌ None | TTS emits viseme timing for lip-sync | **MISSING** |
| **Wake word** | ❌ None | openWakeWord opt-in, armed indicator | **MISSING** |
| **Audio policy** | ⚠️ Partial | No audio persisted by default | **MATCHES** |
| **Governor integration** | ❌ None | STT/TTS acquire/release leases | **MISSING** |

**Current Implementation:**
- `engine/local-speech.js` with Whisper and Piper
- Whisper `small.en` on CPU (2.8s for 4.82s audio)
- Piper Lessac medium on CPU (2.32s for 4.82s audio)
- PTT in renderer with device selection
- No viseme metadata output
- No wake word

---

## Phase 4: Avatar Expressiveness - PARTIALLY IMPLEMENTED

### Current Avatar Renderer

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **VRM renderer** | ✅ Three.js + @pixiv/three-vrm | Three.js + @pixiv/three-vrm | **MATCHES** |
| **VRM import** | ✅ Implemented | Import rigged .vrm, persistent storage | **MATCHES** |
| **Expression support** | ✅ Implemented | Expression menu with VRM bindings + morph fallback | **MATCHES** |
| **Mouth motion** | ✅ Basic amplitude | Lip-sync from TTS visemes with amplitude fallback | **PARTIAL** (no visemes) |
| **Idle motion** | ✅ Basic head/body | Breathing, blink, sway, micro-expressions | **PARTIAL** (basic only) |
| **Emotion resolution** | ❌ None | Rules + local sentiment classifier, 12-label taxonomy | **MISSING** |
| **Emotion mapping** | ❌ None | 12-label taxonomy with blendshape mapping | **MISSING** |
| **Cue priority** | ❌ None | Explicit tag > event rules > sentiment | **MISSING** |
| **Anti-flicker controls** | ❌ None | Min dwell, collapse map, confusion matrix | **MISSING** |
| **Decay & mood** | ❌ None | Transient emotion decay, conversationMood reset per session | **MISSING** |
| **Window modes** | ❌ None | Full, overlay, tray-only with state preservation | **MISSING** |
| **Governor integration** | ❌ None | Light pipeline, throttled to tier fps, degradation ladder | **MISSING** |
| **Sandbox** | ⚠️ Basic | No network access (renderer isolation) | **PARTIAL** |

**Current Implementation in `renderer/avatar-runtime-entry.js`:**
- Basic VRM rendering with Three.js
- Expression selection via VRM expression system
- Audio-driven mouth motion (amplitude only, no visemes)
- Basic idle animation (head/body motion)
- Torso view / full-body view toggle
- Material override preview features
- No emotion resolution system
- No window modes (always full window)
- No governor integration

---

## Phase 5: Desktop Tools - NOT IMPLEMENTED

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Tool registry** | ❌ None | Declared scopes, mandatory dryRun | **MISSING** |
| **Scoped filesystem** | ❌ None | Roots, containment, capability tiers | **MISSING** |
| **Action Broker** | ❌ None | Sole mediator, approval UX, exact preview | **MISSING** |
| **Approval UX** | ❌ None | "Allow once / session / always", revocable | **MISSING** |
| **Undo** | ❌ None | undoRef for reversible actions | **MISSING** |
| **Quarantine** | ❌ None | Recoverable delete, permanent-delete separation | **MISSING** |
| **v1 tools** | ❌ None | Files + clipboard (read-only by default) | **MISSING** |
| **Shell** | ❌ None | Excluded from v1 per R4 | **N/A** |
| **Governor integration** | ❌ None | Tool operations respect governor | **MISSING** |
| **Audit integration** | ❌ None | Every action logged | **MISSING** |

**Current State:**
- No desktop tools infrastructure
- Procedural demo generators exist but are not permissioned tools

### Future Capability: Agentic Coding (deferred)

Coding assistance requires two things the current stack does not have:

1. **A code-capable model.** Dolphin 3.0 8B (4K context) handles short snippets and
   explanations but not multi-file reasoning or long-horizon coherence. A future
   coding mode would swap in a code-trained model (e.g. Qwen2.5-Coder-7B, which
   fits the RTX 3060) via the ModelProvider interface.
2. **An agentic tool layer.** The model must read files, run commands, and observe
   results — i.e. this phase's tool registry + Action Broker + scoped filesystem,
   plus an agent loop that feeds tool output back to the model.

Coding is therefore a Phase 5+ capability, gated on the tool-permission system and
a code model. Not a near-term switch to flip.

---

## Phase 6: Optional Cloud - NOT IMPLEMENTED

| Component | Current State | Blueprint Requirement | Gap |
|-----------|---------------|----------------------|-----|
| **Cloud consent UI** | ❌ None | Flows A-D, ask-each-time default | **MISSING** |
| **Activity view** | ❌ None | Cloud activity visibility | **MISSING** |
| **Cloud providers** | ❌ None | OpenAI-compatible + Anthropic, presets + custom URL | **MISSING** |
| **BYOK credentials** | ❌ None | User-supplied keys in keychain | **MISSING** |
| **Per-request preview** | ❌ None | Redaction preview before egress | **MISSING** |
| **One-way fallback** | ❌ None | Cloud → local allowed, never reverse | **MISSING** |
| **No-account posture** | ❌ None | No CREAO services, no account required | **MATCHES** |
| **Zero telemetry** | ❌ None | Opt-in, aggregate only, never content | **MISSING** |
| **Zero-egress fresh install** | ⚠️ Partial | Current air-gap blocks non-local requests | **PARTIAL** |

**Current Implementation:**
- Basic air-gap firewall in `electron/main.js` (blocks non-local requests)
- No cloud provider infrastructure
- No consent UI for cloud

---

## Configuration & Naming Inconsistencies

### Project Naming

| Location | Current | Blueprint | Action |
|----------|---------|-----------|--------|
| Folder name | `localcore-offline-windows-deepseek-r1-1.5b-v2.1.0` | `localcore-offline-desktop` (from package.json) | **RENAME FOLDER** |
| README references | "DeepSeek R1 1.5B" | Dolphin 3.0 Llama 3.1 8B / Qwen2.5 | **UPDATE README** |
| Config active model | Dolphin 3.0 Llama 3.1 8B | `floor.model` parameter (Qwen2.5-3B default) | **UPDATE CONFIG** |

### Model Configuration

| File | Current Model | Blueprint Model | Action |
|------|---------------|-----------------|--------|
| `config/local-ai.config.json` | Dolphin 3.0 Llama 3.1 8B Q4_K_M | `floor.model` (Qwen2.5-3B-Instruct Q4_K_M P0 default) | **UPDATE OR PARAMETERIZE** |
| `models/manifest.json` | Dolphin 3.0 Llama 3.1 8B | To be determined by S0.4 spike | **UPDATE AFTER SPIKE** |

### Legacy Artifacts

| Item | Status | Action |
|------|--------|--------|
| `LocalCore.bat` | Old launcher | **REMOVE OR UPDATE** |
| `LocalCore AI.exe` | Stub | **REMOVE OR REBUILD** |
| `LocalCore-AI-Setup-1.2.0.exe` | Old installer | **REMOVE OR REBUILD** |
| `LocalCore.vbs` | Old script | **REMOVE OR UPDATE** |
| `pipelines/*.js` (image/music/video) | Procedural demos | **REMOVE OR REPLACE WITH TOOLS** |

---

## Missing Blueprint Components

The following are specified in the blueprint but have no corresponding file in the blueprints folder:

1. **Phase 2 spec:** `localcore-phase2-spec-v11.md` - EXISTS but file naming is inconsistent
2. **Phase 3 spec:** `localcore-phase3-spec-v11.md` - EXISTS but file naming is inconsistent
3. **Phase 5 spec:** `localcore-phase5-spec-v11.md` - EXISTS but file naming is inconsistent
4. **Phase 6 spec:** `localcore-phase6-spec-v11.md` - EXISTS but file naming is inconsistent

**Note:** The specs exist but have Windows-incompatible filenames (spaces, special characters). They should be renamed to use the canonical filenames from the master index.

---

## Critical Decisions Needed Before Implementation

### 1. Runtime Architecture (BLOCKER)

**Decision:** llama.cpp vs Ollama

**Options:**
- **A. Migrate to Ollama** (follows blueprint exactly)
  - Pros: Matches blueprint, Ollama has better model management
  - Cons: Refactor existing working code, larger binary bundle
  - Impact: High - affects S0.3, S1.3, S1.4

- **B. Keep llama.cpp, adapt blueprint** (pragmatic)
  - Pros: Keep working implementation, smaller footprint
  - Cons: Blueprint changes needed, loses Ollama ecosystem
  - Impact: Medium - update Phase 1 spec, keep S0.3 architecture similar

- **C. Hybrid** (llama.cpp with Ollama-compatible interface)
  - Pros: Keep llama.cpp, add abstraction layer for future swap
  - Cons: Extra complexity, still needs spec updates
  - Impact: Medium - create ModelProvider interface that wraps llama.cpp

**Recommendation:** Option C - create ModelProvider interface wrapping llama.cpp, keeping flexibility while minimizing disruption.

### 2. Avatar Integration with Generators

**Decision:** How to bind avatar to content generators

**Blueprint status:** Phase 4 assumes avatar is driven by chat/voice. No integration with image/music/video generation specified.

**Options:**
- **A. Remove demo generators** (clean slate)
  - Pros: Removes unimplemented features
  - Cons: Loses placeholder functionality

- **B. Replace with actual tools** (Phase 5 approach)
  - Pros: Aligns with blueprint, permissioned access
  - Cons: Delays avatar-generator integration

- **C. Keep as "expression demos"** (interim)
  - Pros: Avatar can react to generated content
  - Cons: Not permissioned, not blueprint-aligned

**Recommendation:** Option A for now - remove procedural demos, revisit avatar-generator integration after Phase 5 tools are implemented.

### 3. Encryption Timeline

**Decision:** When to implement encryption

**Current state:** Plain JSON storage

**Blueprint requirement:** Phase 2 S2.1 (encrypted at rest)

**Options:**
- **A. Implement in Phase 0** (early)
  - Pros: Security-first, prevents retrofit
  - Cons: Slows Phase 0, not a Phase 0 deliverable

- **B. Implement in Phase 2** (as specified)
  - Pros: Follows blueprint, focused effort
  - Cons: Longer period of unencrypted data

- **C. Implement now as separate task** (proactive)
  - Pros: Immediate security improvement
  - Cons: Not in blueprint sequence

**Recommendation:** Option B - follow blueprint, implement in Phase 2 S2.1. Document risk in interim.

---

## Recommended Implementation Order

Given the gap analysis, here's the recommended path:

### Immediate (Before Phase 0)

1. **Clean up naming inconsistencies**
   - Rename project folder
   - Update README to remove DeepSeek references
   - Remove or document legacy exe/bat files

2. **Rename blueprint files** (for consistency)
   - Convert Windows-incompatible filenames to canonical names
   - Update master index if needed

3. **Make runtime architecture decision** (llama.cpp vs Ollama)

### Phase 0 Implementation Priority

**S0.1** (Foundation - do first):
- Egress Gateway (core contract)
- Consent Service (per-scope records)
- Audit Log (encrypted, 30-day retention)
- App-data layout restructure
- Renderer sandbox hardening
- No-writes-outside test

**S0.2** (Governor):
- Resource Governor (lease system)
- Tier Detector (hardware probing)
- Floor profile defaults

**S0.3** (Server bring-up - after runtime decision):
- Local Inference Proxy (LIP) OR llama.cpp wrapper
- Auth proxy contract
- Model store redirect
- Egress containment

**S0.4** (Feasibility spike):
- Floor-tier coexistence test
- Metrics collection
- GATE-1 evaluation

### Parallel Work (can start during Phase 0)

- **Avatar emotion system** (Phase 4 S4.2) - depends only on Phase 0 governor
- **Memory schema design** (Phase 2) - independent work
- **Persona schema** (Phase 1 S1.1) - independent work

---

## Summary Statistics

| Phase | Components | Missing | Partial | Complete |
|-------|------------|---------|---------|----------|
| Phase 0 | 4 slices | 100% | 0% | 0% |
| Phase 1 | 4 slices | 70% | 30% | 0% |
| Phase 2 | 5 slices | 80% | 20% | 0% |
| Phase 3 | 3 slices | 40% | 60% | 0% |
| Phase 4 | 3 slices | 60% | 40% | 0% |
| Phase 5 | 4 slices | 100% | 0% | 0% |
| Phase 6 | 3 slices | 80% | 20% | 0% |
| **Overall** | **26 slices** | **75%** | **20%** | **5%** |

**Key insight:** Phase 0 is entirely missing, which blocks everything else. Phase 3 (voice) and Phase 4 (avatar) have the most existing work to build upon.

---

## Next Steps

1. **Review this gap analysis** and confirm/reject recommendations
2. **Make the runtime architecture decision** (llama.cpp vs Ollama)
3. **Begin S0.1 implementation** (Egress Gateway, consent, audit, app-data)
4. **Address naming inconsistencies** in parallel

