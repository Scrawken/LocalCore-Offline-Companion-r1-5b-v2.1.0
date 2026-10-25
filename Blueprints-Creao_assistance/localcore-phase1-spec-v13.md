
# LocalCore — Phase 1 Technical Spec: Character & Chat (v1.3, final)

Scope: persona schema, streaming chat contract, and two swappable model providers
(floor-tier bundled Ollama behind an authenticated local proxy + optional OpenAI-compatible cloud).

Depends on Phase 0 contracts (Egress Gateway, Resource Governor, app-data layout). Supersedes
v1.0–v1.2.

---

## 0. Decisions locked in this spec

| # | Decision | Choice |
|---|---|---|
| C1 | Local inference runtime | **Bundled Ollama server** |
| C2 | Floor model | **Spike-dependent** — Phase 1 §0.1. P0 = Qwen2.5-3B-Instruct Q4_K_M; P1 = Qwen2.5-1.5B-Instruct Q4_K_M |
| C3 | Cancel semantics | **Keep the user turn** (retry/regenerate available) |
| C4 | First cloud provider | **OpenAI-compatible** adapter |
| C5 | Model delivery | **User chooses at install time** (small installer + download, or offline bundle) |
| C6 | Local server protection | **Authenticated local proxy in front of Ollama** |

Phase 1 invariants:
- **Local is the default provider. Cloud is never used without an explicit consent record.**
- **Fallback is one-way.** Cloud → local allowed; local → cloud never silently.
- **History is immutable.** Swapping providers writes new turns; never rewrites old ones.
- **Cancelled output is never persisted.**
- **Ordering is stable.** Monotonic `seq` per conversation.
- **The proxy is the only loopback client.** No other module may open a client connection to the
  bundled server. This replaces the earlier general loopback exemption with a single owner.

## 0.1 Spike-dependent parameters (applied without a rewrite)

Three things in this spec are **empirically determined, not decided**: the floor model (C2), the
floor tier profile, and the GATE-2 latency target. They are held as **parameters**, not literals, so
a S0.4 spike outcome is applied by writing one profile to config — **not** by editing this document.

### 0.1.1 The floor profile parameter block

| Parameter | P0 — default (pending spike) | P1 — memory-bound | P2 — avatar-bound | P3 — voice-bound |
|---|---|---|---|---|
| `floor.model` | Qwen2.5-3B-Instruct Q4_K_M | Qwen2.5-1.5B-Instruct Q4_K_M | Qwen2.5-3B-Instruct Q4_K_M | Qwen2.5-3B-Instruct Q4_K_M |
| `floor.modelBudgetMB` | 3000 | 1800 | 3000 | 3000 |
| `floor.contextWindow` | 4096 | 4096 | 4096 | 4096 |
| `floor.maxConcurrentHeavy` | 1 | 1 | 1 | 1 |
| `floor.avatarFps` | 24 | 24 | 20 | 24 |
| `floor.avatarQuality` | low | low | low | low |
| `floor.avatarResidency` | persistent | persistent | on-demand | persistent |
| `floor.wakeWordEnabled` | true | true | true | false |
| `floor.ttsOverlapGeneration` | per S4 | per S4 | false | false |
| `floor.firstTokenTargetMs` | 3000 | 3000 | 3500 | 3000 |
| `floor.coldStartTargetMs` | 8000 | 6000 | 8000 | 8000 |
| `floor.peakMemoryCeilingMB` | 6960 | 6960 | 6960 | 6960 |

**P0 is the value in force until the spike reports.** It is the Phase 0 §3.4 starting profile
restated as parameters; Phase 0 §3.4 remains the narrative form of the same values.

### 0.1.2 Selection rule

| Spike finding (S0.4) | Apply |
|---|---|
| All thresholds met at 2–3B | **P0** — no change |
| Memory ceiling breached at 2–3B | **P1** — drop the model to 1.5B |
| Avatar load dominates the budget | **P2** — avatar on-demand, 20 FPS, no TTS overlap |
| Wake word does not fit the floor budget (S7) | **P3** — disable wake word on the floor tier |
| 2–3B fits but misses the latency target | **P1** — a smaller model is faster, not slower |
| No model fits at acceptable quality | **Floor tier unsupported** — raise the minimum spec; a product decision, not a parameter |

Findings are independent, so profiles may be **combined** (e.g. P1 + P2). When combined, take the
more conservative value for each parameter: the smaller model, lower FPS, on-demand residency, fewer
concurrent heavy pipelines.

### 0.1.3 Application rule

Applying an outcome is a **configuration write, not an edit**:

1. Write the selected profile to `config/` as the active floor profile.
2. The Tier Detector (Phase 0 §3.2) loads it; the Resource Governor (Phase 0 §3.3) enforces it.
3. Nothing else changes — every reference in this spec is to the **parameter**, never to a literal.

**Prose is parameterised deliberately.** Where an earlier draft said "Qwen2.5-3B", this spec now says
`floor.model`. That is what makes any outcome applicable without a rewrite.

### 0.1.4 Parameter references in this spec

| Where | Parameter |
|---|---|
| C2 — floor model | `floor.model` |
| §1.5 — floor context window | `floor.contextWindow` |
| §3.3.2 — model and delivery | `floor.model`, `floor.modelBudgetMB` |
| §3.3.3 — governor integration | `floor.maxConcurrentHeavy` |
| §4 P1-13 — GATE-2 latency | `floor.firstTokenTargetMs`, `floor.coldStartTargetMs` |
| Phase 0 §3.4 — floor profile | the whole P0 column |

### 0.1.5 What the spike cannot change

The parameters above are the **only** spike-dependent values. These remain fixed regardless of
outcome and must not be relaxed by a spike finding:

- The memory ceiling of 6960MB (85% of 8GB) — a safety bound, not a target.
- STT and the LLM never running concurrently on the floor tier.
- The `thinking` indicator within 300ms, before any model load.
- Streaming begins immediately; a response is never buffered whole.
- The single-loopback-client rule and the egress-containment regime.
- Summarize-before-prune and the one-way fallback rule.

---

# 1. Persona schema

## 1.1 Design goals

Declarative, versioned, migratable, importable/exportable; multi-character-ready (keyed
collection, v1 resolves one active `characterId`); bounded for small models; separable from memory
and turns.

## 1.2 Document shape

    interface PersonaDocument {
      schemaVersion: number;          // starts at 1
      characterId: string;
      identity: PersonaIdentity;
      traits: string[];
      backstory: string;
      speakingStyle: SpeakingStyle;
      values: string[];
      boundaries: PersonaBoundaries;
      behavior: BehaviorSettings;
      greeting?: string;
      examples?: PersonaExample[];
      assets: PersonaAssets;
      metadata: PersonaMetadata;
    }

    interface PersonaIdentity { name: string; pronouns?: string; tagline?: string; }

    interface SpeakingStyle {
      tone: string;
      formality: "casual" | "neutral" | "formal";
      verbosity: "terse" | "balanced" | "expansive";
      humor: 0 | 1 | 2 | 3 | 4 | 5;
      empathy: 0 | 1 | 2 | 3 | 4 | 5;
      quirks?: string[];
      forbiddenPhrases?: string[];
    }

    interface PersonaBoundaries {
      avoidTopics?: string[];
      refusalStyle: string;
      safetyPosture: "standard" | "strict";
      escalateToUser?: string;
    }

    interface BehaviorSettings {
      askClarifyingQuestions: boolean;
      proactiveOffers: boolean;
      initiative: 0 | 1 | 2 | 3 | 4 | 5;
      maxReplyTokensHint?: number;
    }

    interface PersonaExample { user: string; assistant: string; }
    interface PersonaAssets { avatarRef?: string; voiceRef?: string; }
    interface PersonaMetadata { author?: string; license?: string; createdAt: number; updatedAt: number; }

## 1.3 Validation rules

| Field | Rule |
|---|---|
| `identity.name` | required, 1–40 chars |
| `backstory` | ≤ 1200 chars |
| `traits` | ≤ 8 items, each ≤ 40 chars |
| `values` | ≤ 6 items |
| `speakingStyle.tone` | required, ≤ 120 chars |
| `forbiddenPhrases` | ≤ 20 items |
| `avoidTopics` | ≤ 20 items |
| `examples` | ≤ 4 items; ≤ 2 on floor; each side ≤ 300 chars |
| `greeting` | ≤ 300 chars |
| Assembled persona block | ≤ 400 tokens on floor; validator warns above |

Invalid personas are rejected with a structured error; the app falls back to a built-in default
persona rather than failing to start.

## 1.4 System prompt assembly

Deterministic order, once per turn: identity → traits → speaking style → boundaries → behavior →
examples. The persona block is immutable and separate from memory and turns. Same persona + tier →
byte-identical text (testable).

## 1.5 Context window budget

| Tier | Context window | Output reserve | Persona block | Memory block (Phase 2) | Turns |
|---|---|---|---|---|---|
| Floor | `floor.contextWindow` (4096) | 512 | ≤ 400 | ≤ 400 | ~2784 |
| Mid | 8192 | 1024 | ≤ 600 | ≤ 800 | ~5768 |
| High | 16384 | 2048 | ≤ 800 | ≤ 1200 | ~12336 |

Trimming: drop oldest turns → drop memory block → never drop persona or current user message →
if still over, truncate `backstory` and warn.

---

# 2. Streaming chat contract

## 2.1 Turn model

    interface Turn {
      id: string;
      conversationId: string;
      seq: number;
      role: "user" | "assistant";
      content: string;
      createdAt: number;
      status: "complete" | "cancelled" | "error";
      modelId?: string;
      personaId?: string;
      tokenCount?: number;
      latencyMs?: number;
      parentTurnId?: string;
    }

    interface Conversation {
      id: string;
      title: string;
      personaId: string;
      modelId: string;
      createdAt: number;
      updatedAt: number;
      turnCount: number;
    }

`seq` is store-assigned, never reused. Restart replays by `seq`.

## 2.2 Engine interface

    interface ChatEngine {
      send(conversationId: string, input: string, opts?: SendOptions): AsyncIterable<ChatEvent>;
      cancel(turnId: string): Promise<void>;
      regenerate(turnId: string, opts?: SendOptions): AsyncIterable<ChatEvent>;
    }

    interface SendOptions {
      personaId?: string;
      modelId?: string;
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
    }

    type ChatEvent =
      | { type: "thinking"; turnId: string; at: number }
      | { type: "token"; turnId: string; text: string }
      | { type: "turnCompleted"; turn: Turn }
      | { type: "cancelled"; turnId: string }
      | { type: "error"; turnId: string; error: ChatError; recoverable: boolean };

    type ChatErrorCode =
      | "provider-unavailable" | "model-load-failed" | "context-overflow"
      | "consent-denied" | "rate-limited" | "offline" | "cancelled" | "unknown";

    interface ChatError { code: ChatErrorCode; message: string; providerId?: string; }

## 2.3 Turn lifecycle

1. Caller iterates `send(...)`.
2. Engine emits `thinking` immediately (≤300ms on floor, before any model load).
3. Engine invokes the provider. **The provider — not the engine — acquires the `llm` lease.** The
   lease represents local heavy-resource consumption, and only a local provider consumes it; a
   cloud provider acquires none. The provider ensures the proxy + Ollama are up and the model
   loaded.
4. Engine assembles the prompt per §1.5.
5. Engine persists the user turn (status `complete`) before generation.
6. Provider streams tokens; engine re-emits `token` events.
7. On completion, engine persists the assistant turn atomically and emits `turnCompleted`.
8. Engine releases the `llm` lease; idle unload via Ollama `keep_alive`.

## 2.4 Cancellation semantics (per C3)

- `cancel(turnId)` aborts the stream and discards the in-memory assistant buffer.
- **The user turn is kept**; the assistant turn is not persisted; retry/regenerate is offered.
- Next user turn appends cleanly with the next `seq`; no gap, no duplicate.
- `regenerate` creates a new assistant turn with `parentTurnId`; history never overwritten.
- Crash during streaming: in-progress marker written; on startup any assistant turn still marked
  in-progress is discarded. Conversation remains valid.

## 2.5 Persistence

Storage uses the Phase 0 app-data layout; conversations and turns encrypted at rest. Assistant
turns committed atomically. Delete removes turns + summaries; second delete is a no-op. Search is
local full-text scoped to the active persona. Every assistant turn records `modelId`.

### Lease ownership (resolves an earlier ambiguity)

The **provider owns the `llm` lease**; the engine never acquires one. Centralizing it in the engine
would wrongly serialize cloud requests behind local heavy work, since a cloud provider consumes no
local heavy resources. The provider declares `consumesHeavySlot` in its capabilities so the engine
can report degradation. See §3.1 and Phase 2 §3.3.

### Ephemeral sessions (memory off, or disclosure unacknowledged)

**Chat works without saving history.** Turn persistence is conditional:

| Condition | Behaviour |
|---|---|
| Disclosure acknowledged **and** `transcripts` category enabled | Turns are persisted; history survives restart |
| Disclosure unacknowledged | **Ephemeral session:** turns are held in memory only and never written |
| Memory globally disabled | **Ephemeral session:** turns are held in memory only and never written |
| `transcripts` category disabled (memory on) | **Ephemeral session:** turns are not persisted; facts and summaries may still be captured if their categories are enabled |

- The conversation is fully functional within the session; closing it discards the history.
- The UI must clearly indicate that history is not being saved.
- P1-1 ("50-turn session survives restart") is scoped to the persisted case.
- Phase 2 §1.2 defines the transcript layer as this same turn store, so the conditional applies
  there identically. This resolves the apparent conflict between "Phase 1 stores chat turns" and
  "Phase 2 stops transcript writes when memory is off".

---

# 3. Model providers

## 3.1 Provider interface

    interface ModelProvider {
      readonly id: string;
      readonly displayName: string;
      capabilities(): ModelCapabilities;
      load?(modelRef: string): Promise<void>;
      unload?(): Promise<void>;
      stream(req: CompletionRequest): AsyncIterable<CompletionChunk>;
      countTokens?(text: string): number;
      health(): ProviderHealth;
    }

    interface ModelCapabilities {
      contextWindow: number;
      maxOutputTokens: number;
      supportsStreaming: boolean;
      supportsTools: boolean;
      supportsVision: boolean;
      supportsEmbeddings: boolean;
      minTier: Tier;
      consumesHeavySlot: boolean;   // true for local providers, false for cloud
    }

    interface CompletionRequest {
      messages: ChatMessage[];
      maxTokens?: number;
      temperature?: number;
      stop?: string[];
      signal?: AbortSignal;
    }

    interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

    type CompletionChunk =
      | { type: "token"; text: string }
      | { type: "usage"; promptTokens: number; completionTokens: number }
      | { type: "done"; finishReason: "stop" | "length" | "cancelled" | "error" };

    interface ProviderHealth { state: "ready" | "loading" | "unavailable"; detail?: string; }

## 3.2 Registry and selection

    interface ModelProviderRegistry {
      register(provider: ModelProvider): void;
      get(id: string): ModelProvider | undefined;
      list(): ModelProvider[];
      setDefault(id: string): void;
      getDefault(): ModelProvider;
    }

- A conversation stores its `modelId`; turns may override via `SendOptions.modelId`.
- Swapping mid-session affects only future turns; existing turns keep their recorded `modelId`.
- Unavailable provider → `provider-unavailable`. No auto-substitution **unless** it is cloud → local
  and the user enabled fallback.

## 3.3 Provider A — Bundled Ollama behind an authenticated proxy (floor, default)

### 3.3.1 Architecture

Two components:

1. **Local Inference Proxy (LIP)** — an HTTP server running **inside the Electron main process**.
   It is the only component permitted to open a loopback client connection to Ollama.
2. **Ollama** — a supervised child process providing model management and runner execution.

    interface LocalInferenceProxy {
      start(opts: { ollamaPort: number; appPort: number }): Promise<ProxyHandle>;
      stop(): Promise<void>;
      health(): ProxyHealth;
    }

    interface ProxyHandle { appPort: number; token: string; pid: number; }

Lifecycle:
- Ollama is **spawned on demand** (first generation), not at boot.
- Ollama binds `127.0.0.1:<ephemeral-port>` (never `0.0.0.0`), known only to the proxy.
- The proxy binds `127.0.0.1:<app-port>` and requires a **per-launch bearer token** on every request.
- **Model store redirected:** `OLLAMA_MODELS=<app-data>/models/ollama`, preserving the Phase 0
  no-writes-outside guarantee.
- **Idle unload:** per-request `keep_alive` from the governor's `llmIdleEvictMs`.
- **Floor concurrency:** `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1`.
- **Supervision:** health checks, bounded restart on crash with backoff, clean shutdown on exit.

### 3.3.2 Model and delivery (per C2, C5)

- Model: **`floor.model`** (see §0.1). The P0 default is Qwen2.5-3B-Instruct Q4_K_M; the S0.4 spike
  may select P1 (Qwen2.5-1.5B-Instruct Q4_K_M) instead. The id is read from the active floor
  profile — never hard-coded — and the model budget is `floor.modelBudgetMB`.
- **Install-time choice** presented to the user:
  - *Small installer:* Ollama binary only. On first run, the app acquires the model **through the
    Egress Gateway** (`network:model-download`, host allowlist), stores the GGUF under app-data
    `models/`, and imports it locally with `ollama create` from a Modelfile. Ollama's own pull is
    never used, so model acquisition stays inside the gateway.
  - *Offline bundle:* the installer includes the GGUF; first run imports it with zero network.
- The choice is recorded and reversible (the user can fetch or remove the bundle later).
- License metadata ships with the model and is surfaced in the UI.

### 3.3.3 Governor integration (extends Phase 0)

- `stream()` requires an `llm` lease; released on completion.
- The governor measures **the whole Ollama process tree** — daemon *and* its model runner
  subprocesses — not just the app's RSS. Model memory lives in the runner.
- Idle eviction maps to Ollama `keep_alive` (unload model, keep daemon).
- Under pressure, unload the model first; if insufficient, stop the daemon. Reload is lossless
  because conversation state lives in the store.

### 3.3.4 Authenticated proxy contract (per C6)

The proxy is a policy boundary, not just a pipe. On every request it:

1. **Authenticates** — validates the per-launch bearer token; rejects otherwise with 401.
2. **Allowlists endpoints** — permits only what the app needs (`/api/chat`, `/api/tags`,
   `/api/show`, `/api/create`, `/api/delete`). Explicitly **denies `/api/pull`** and any endpoint
   that could cause egress.
3. **Bounds payloads** — max body size, request timeout, basic rate limit.
4. **Logs** — every proxied request is written to the Phase 0 audit log with caller `lip`.
5. **Forwards** — only then does it connect to Ollama on the private port.

Token lifecycle:
- 256-bit token from a CSPRNG, generated **per app launch**, held only in app memory, never
  persisted, rotated on every launch.
- The app is the only holder; it is passed to the provider, never to the renderer.

Isolation of Ollama's port:
- The proxy is the only allowed client. Enforced with an OS-level filter scoped to the app
  process (Windows Filtering Platform rule keyed to the app's process path), permitting loopback
  to Ollama's port only from the app binary.
- **Fallback** if process-scoped WFP filtering proves impractical on target Windows versions:
  launch Ollama inside an AppContainer / restricted context for loopback isolation, and document
  the residual risk. This is resolved during the Phase 0/1 prototype, not assumed.

### 3.3.5 Egress containment (still required)

Ollama is a separate process; the Electron request interceptor does not cover it. Therefore:
- **Primary control:** the Ollama process tree runs under an OS restriction blocking all outbound
  network except loopback.
- **Secondary control:** configure Ollama inert — no pull, no update check, no telemetry.
  Configuration is defense in depth, not the guarantee.
- **Verification:** P1-18 confirms zero external network access with the restriction active.

### 3.3.6 Capabilities

`minTier: "floor"`, streaming true (Ollama `/api/chat` NDJSON), tools false (Phase 5), embeddings
false (Phase 2 uses a separate local embedder).

## 3.4 Provider B — Cloud, OpenAI-compatible (per C4)

Disabled until the user grants consent for `network:cloud-inference` via the Egress Gateway. Every
call goes through the gateway with a redaction preview. `consent-denied`, `offline`, and
`rate-limited` are recoverable errors. Never retries on cloud without consent; never falls back
local → cloud.

## 3.5 Provider C — Test double (CI only)

Deterministic, offline provider echoing scripted tokens. Tests streaming, cancel, ordering, and
provider swap without a real model. Not shipped.

---

# 4. Acceptance tests

| # | Test | Expected |
|---|---|---|
| P1-1 | 50-turn session, restart | History identical and ordered (`seq` stable) |
| P1-2 | Swap provider mid-session | New turns use new provider; old turns unchanged |
| P1-3 | Cancel mid-stream | No partial assistant turn; user turn kept; retry offered; no `seq` gap |
| P1-4 | Regenerate | New assistant turn with `parentTurnId`; original intact |
| P1-5 | Crash during streaming | In-progress turn discarded on restart; conversation valid |
| P1-6 | Delete conversation, delete again | First removes turns + summaries; second is a no-op |
| P1-7 | Thinking indicator | Within 300ms on floor, before model load |
| P1-8 | Persona validation | Invalid persona rejected; default used; app starts |
| P1-9 | Prompt assembly determinism | Same persona + tier → byte-identical block |
| P1-10 | Context overflow | Oldest turns dropped first; persona and user message kept |
| P1-11 | Cloud without consent | `consent-denied`; no network attempt; no silent local retry |
| P1-12 | Local → cloud fallback | Never occurs silently |
| P1-13 | Floor latency | First token ≤ `floor.firstTokenTargetMs` (P0: 3s); cold start ≤ `floor.coldStartTargetMs` (P0: 8s); streaming per Phase 0 thresholds |
| P1-14 | Persona token budget | Over-budget persona warns, does not crash |
| P1-15 | Ollama binds loopback only | Not reachable on `0.0.0.0` / LAN |
| P1-16 | No writes outside app-data | `OLLAMA_MODELS` redirect verified; watcher test passes |
| P1-17 | Server crash | Supervised restart within bounded time; conversation intact |
| P1-18 | Server external egress | With OS restriction active, zero external network access |
| P1-19 | Idle eviction | `keep_alive` unloads the model; next turn reloads losslessly |
| P1-20 | No external install | Bundled Ollama runs with no user-installed runtime |
| P1-21 | Small-installer path | Model acquired via gateway; `ollama pull` never invoked |
| P1-22 | Offline-bundle path | Model imported from bundled GGUF with network fully blocked |
| P1-23 | Proxy auth | Request without the per-launch token → 401, not forwarded |
| P1-24 | Proxy allowlist | `/api/pull` and non-allowlisted endpoints → denied |
| P1-25 | Token rotation | Token differs across launches; old token rejected |
| P1-26 | Direct Ollama access | Another same-user process cannot reach Ollama's port |
| P1-27 | Proxy audit | Every proxied request appears in the audit log with caller `lip` |
| P1-28 | Install-time choice | Both delivery paths selectable; choice recorded and reversible |

---

# 5. Open items needing your input

- Proxy isolation mechanism on Windows: process-scoped WFP filtering (proposed) vs AppContainer
  loopback isolation — resolve in the Phase 0/1 prototype.
