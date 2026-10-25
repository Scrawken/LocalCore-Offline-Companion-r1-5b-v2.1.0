# LocalCore — S1.3 Implementation Task List

Slice: **S1.3 — Local provider behind the auth proxy**
Source: Phase 1 §3.1 (provider contract) and §3.3 (bundled Ollama behind the authenticated proxy);
S0.3 (proxy, server, containment); S1.2 (engine, registry); S0.2 (governor).
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- `LocalModelProvider` implementing the `ModelProvider` contract.
- An authenticated client to the Local Inference Proxy (LIP) built in S0.3.
- Request mapping to Ollama's chat API and response stream mapping to `CompletionChunk`.
- Streaming with cancellation and no buffering.
- Token counting, with a calibrated fallback to the S1.1 estimator.
- `capabilities()` and `health()`.
- Governor integration: `llm` lease per stream, released on every exit path.
- `load()` / `unload()` and `keep_alive` wiring from `llmIdleEvictMs`.
- Transparent reload after eviction.
- Error mapping into the engine's `ChatError` taxonomy.
- Registration as the default provider.

**Explicit non-goals (do not build here):**
- No latency baseline or tuning against real hardware (S1.4).
- No cloud provider (Phase 6).
- No tool calling, vision, or embeddings support (`capabilities()` reports false).
- No prompt assembly or persona changes (S1.1).
- No server bring-up, proxy, or containment work (S0.3) — this slice consumes them.

Rationale: S1.3 is the first slice that connects the real model to the chat engine. It converts the
S0.3 substrate into a provider the S1.2 engine can drive, without touching either.

---

## 1. Ordering principles

1. **Contract before transport** — the provider's shape is fixed before its I/O.
2. **Transport before streaming** — there must be a connection before a stream.
3. **Streaming before governor integration** — the lease wraps a working stream.
4. **Governor integration before eviction tests** — reload is only meaningful once leases exist.
5. **Token counting before context limits** — limits are expressed in tokens.
6. **Error mapping alongside transport**, not after — failures are part of the transport contract.
7. **The provider never talks to Ollama directly.** Only the proxy is permitted a loopback client
   connection (S0.3 D1-T2). This is an invariant, asserted in tests.

---

## 2. Task list

### Group 1 — Contract & registration

**A1 — `LocalModelProvider` skeleton**

Deliverable: a class implementing `ModelProvider` from Phase 1 §3.1.

Definition of done:
- [ ] Implements `id`, `displayName`, `capabilities()`, `load()`, `unload()`, `stream()`,
      `countTokens()`, `health()`.
- [ ] Compiles against the interface with no `any` and no interface drift.
- [ ] Contains no provider-specific logic in the engine (engine depends only on the contract).
- [ ] `id` is stable and matches the value used in the registry and in recorded `modelId`.

**A2 — Registry registration and default**

Deliverable: the provider is discoverable and is the default.

Definition of done:
- [ ] The provider registers with the S1.2 registry at startup.
- [ ] It is set as the default provider when no cloud provider is configured.
- [ ] Registration is idempotent across restarts.
- [ ] An unknown provider id still produces `provider-unavailable`, never a silent fallback to
      local.

**A3 — Capabilities descriptor**

Deliverable: an accurate `ModelCapabilities`.

Definition of done:
- [ ] Reports `minTier: "floor"`, `supportsStreaming: true`.
- [ ] Reports `supportsTools: false`, `supportsVision: false`, `supportsEmbeddings: false` for v1.
- [ ] Reports `consumesHeavySlot: true`. The provider owns the `llm` lease; the engine holds none
      (Phase 1 §2.5). Cloud providers report `false` so they are never serialized behind local work.
- [ ] `contextWindow` reflects the active tier/model configuration, not a hard-coded constant.
- [ ] `maxOutputTokens` matches the output reserve used by the S1.1 budget model.

---

### Group 2 — Transport & streaming

**B1 — Authenticated proxy client**

Deliverable: the client that talks to LIP.

Definition of done:
- [ ] The client sends the per-launch bearer token on every request (S0.3 D2).
- [ ] The token is obtained from the proxy handle and is **never logged** (test B1-T1).
- [ ] The client addresses the proxy's app port only; it never constructs an Ollama URL directly
      (test B1-T2).
- [ ] The client is the only module in the provider that performs I/O.

**B2 — Request mapping**

Deliverable: `CompletionRequest` → Ollama chat payload.

Definition of done:
- [ ] `messages` map to Ollama's message array preserving role and order.
- [ ] `maxTokens`, `temperature`, and `stop` map to the corresponding options.
- [ ] `keep_alive` is set from the active tier's `llmIdleEvictMs` (ties to D4).
- [ ] Streaming is explicitly requested; a non-streaming response is treated as a mapping bug
      (test B2-T1).

**B3 — Response stream mapping**

Deliverable: Ollama NDJSON → `CompletionChunk`.

Definition of done:
- [ ] Each token maps to a `token` chunk in order, with no loss or duplication (test B3-T1).
- [ ] Usage (`prompt_eval_count`, `eval_count`) maps to a single `usage` chunk when present.
- [ ] Stream end maps to a `done` chunk with the correct `finishReason`
      (`stop` | `length` | `cancelled` | `error`).
- [ ] A malformed or truncated stream produces a `done` chunk with `error`, not a hang or a throw
      that bypasses cleanup (test B3-T2).

**B4 — Streaming semantics**

Deliverable: incremental, cancellable streaming.

Definition of done:
- [ ] Chunks are emitted as they arrive; the provider does not buffer the full response
      (test B4-T1).
- [ ] An `AbortSignal` cancels the upstream request and emits `done` with `cancelled`
      (test B4-T2).
- [ ] Client disconnect propagates to the upstream request (no leaked generation).
- [ ] Accumulated text equals the concatenation of emitted tokens exactly.

**B5 — Timeout and abort propagation**

Deliverable: bounded requests that clean up fully.

Definition of done:
- [ ] A request timeout aborts the upstream stream and surfaces a recoverable error.
- [ ] Abort propagates through the proxy to Ollama (no orphaned upstream generation) (test B5-T1).
- [ ] Every abort path releases the `llm` lease (ties to D2).
- [ ] A timeout during model load is distinguished from a timeout during generation.

---

### Group 3 — Token counting & context

**C1 — Runtime tokenizer integration**

Deliverable: accurate token counting where the runtime exposes it.

Definition of done:
- [ ] If the runtime exposes a tokenizer, `countTokens()` uses it (S1.1 F1).
- [ ] Counts are consistent between budgeting and what the model actually receives (test C1-T1).
- [ ] The tokenizer is used by the S1.1 assembler through the `TokenCounter` interface.
- [ ] Tokenizer unavailability is detected, not assumed.

**C2 — Calibrated fallback**

Deliverable: a defensible estimate when no tokenizer is available.

Definition of done:
- [ ] When no runtime tokenizer exists, the S1.1 conservative estimator is used.
- [ ] The estimator is **calibrated against observed `prompt_eval_count`** from real responses
      (test C2-T1).
- [ ] The calibration factor and its error bound are recorded and visible in debug output.
- [ ] The estimator over-estimates rather than under-estimates.

**C3 — Context and output limits**

Deliverable: limits that match the running model.

Definition of done:
- [ ] `contextWindow` and `maxOutputTokens` are derived from the model/tier configuration.
- [ ] A request exceeding the context window is prevented by the assembler, not discovered by the
      model (test C3-T1).
- [ ] The engine receives `context-overflow` when the assembler reports `overBudget`.

---

### Group 4 — Governor & lifecycle

**D1 — `llm` lease acquisition**

Deliverable: generation holds a heavy slot.

**The provider is the sole owner of the `llm` lease.** The engine does not acquire one (Phase 1
§2.5). This is what prevents a request from blocking on a lease its own caller already holds.

Definition of done:
- [ ] `stream()` acquires an `llm` lease from the S0.2 governor before the request is sent
      (test D1-T1).
- [ ] The engine does not acquire the lease, so a caller can never hold the lease its provider needs.
- [ ] The lease is released when the stream ends, on every path (D2).
- [ ] The lease is acquired **after** the engine emits `thinking`, so perceived responsiveness is
      unaffected (ties to S1.2 C2).
- [ ] A degraded lease is honoured by reducing output length or reporting the degradation.
- [ ] On the floor tier, the lease serializes generation against STT/TTS (Phase 3).

**D2 — Lease release on all paths**

Deliverable: no lease leaks.

Definition of done:
- [ ] The lease is released on success, cancel, timeout, and error (test D2-T1).
- [ ] Release happens in a `finally`-equivalent path, not on the happy path only.
- [ ] A release failure is logged and does not mask the original outcome.
- [ ] Leak tests assert the governor's active-lease set returns to empty after each outcome.

**D3 — `load()` and `unload()` semantics**

Deliverable: explicit lifecycle control.

Definition of done:
- [ ] `load()` ensures the server is running and the model is available (via S0.3 `ensureRunning`).
- [ ] `load()` is idempotent and safe to call concurrently (single-flight).
- [ ] `unload()` releases the model without destroying conversation state.
- [ ] Both are wired to the governor's unload hook (S0.3 F1).

**D4 — `keep_alive` wiring**

Deliverable: idle unload driven by the tier profile.

Definition of done:
- [ ] `keep_alive` is derived from `TierProfile.llmIdleEvictMs` on every request (S0.3 F4).
- [ ] The mapping from milliseconds to the runtime's expected unit is defined and tested.
- [ ] Setting the value to unload-immediately is verified to unload (test D4-T1).
- [ ] Changing the tier profile changes the effective `keep_alive` without a restart.

**D5 — Transparent reload after eviction**

Deliverable: eviction is invisible to the user.

Definition of done:
- [ ] After an idle or pressure eviction, the next `stream()` reloads the model and succeeds
      (P1-19).
- [ ] No conversation state is lost, because state lives in the S1.2 store (P1-19).
- [ ] Reload does not duplicate or reorder turns.
- [ ] The reload is observable in the trace but not surfaced as an error to the user.

**D6 — Server availability integration**

Deliverable: correct behaviour when the server is down.

Definition of done:
- [ ] `stream()` calls `ensureRunning()` and waits for readiness rather than failing during startup.
- [ ] A server that cannot start produces `provider-unavailable` with the captured reason.
- [ ] A server crash mid-stream produces a recoverable error and a clean lease release.
- [ ] The provider never spawns or configures the server itself; that remains S0.3's job.

---

### Group 5 — Errors & health

**E1 — Error mapping**

Deliverable: provider failures mapped to the engine's taxonomy.

Definition of done:
- [ ] Mapping is defined for: auth failure, server unavailable, model not found, model load
      failure, timeout, malformed stream, and context overflow.
- [ ] Each maps to a specific `ChatErrorCode` (S1.2 C5), never to a generic `unknown` where a
      specific code exists (test E1-T1).
- [ ] A denied endpoint (e.g. `/api/pull`) is treated as an internal error and logged, since the
      provider should never call it.
- [ ] Error messages never include the token or raw upstream internals.

**E2 — `health()` reporting**

Deliverable: a truthful readiness signal.

Definition of done:
- [ ] Reports `ready` / `loading` / `unavailable` with a detail string.
- [ ] Reflects server readiness, model availability, and provisioning state.
- [ ] `unavailable` includes a safe, actionable reason (e.g. "model not provisioned").
- [ ] Health checks are cheap and do not trigger a model load (test E2-T1).

**E3 — Degraded behaviour**

Deliverable: defined behaviour when the provider is not fully usable.

Definition of done:
- [ ] When the model is not provisioned, `stream()` fails with a structured error and guidance,
      not a hang.
- [ ] When the tier is overridden below the model's requirement, the mismatch is reported.
- [ ] Degraded state is visible to the UI without requiring a failed request.

---

### Group 6 — Model reference & availability

**F1 — Model reference resolution**

Deliverable: the provider knows which model to load.

Definition of done:
- [ ] The model reference resolves from the S0.3 provisioning result (stable tag).
- [ ] The reference is recorded in the conversation's `modelId` and in each assistant turn.
- [ ] A missing or ambiguous reference fails with a structured error.
- [ ] Changing the configured model updates the reference without touching conversation history.

**F2 — Availability verification**

Deliverable: the provider only claims what it can do.

Definition of done:
- [ ] Availability requires a verification probe, not just file presence (S0.3 C5).
- [ ] The probe result is cached and invalidated on server restart.
- [ ] A model present but failing to load is reported as `unavailable`, not `ready` (test F2-T1).
- [ ] Verification does not load the model unnecessarily.

**F3 — Not-provisioned handling**

Deliverable: a clear path when the model is absent.

Definition of done:
- [ ] `stream()` returns a structured error naming the missing model and pointing to provisioning.
- [ ] The engine surfaces this as a recoverable error, not a crash.
- [ ] The provider does not attempt to download or import anything itself (that is S0.3).

---

### Group 7 — Verification

**G1 — Test doubles**

Deliverable: deterministic tests without a real model.

Definition of done:
- [ ] A mock proxy can serve scripted NDJSON streams.
- [ ] The mock can simulate: normal completion, mid-stream error, slow start, auth rejection,
      malformed stream, and timeout.
- [ ] No test requires the real binary or a downloaded model.
- [ ] The governor's clock and memory are injectable (S0.2 G1).

**G2 — Contract conformance tests**

Definition of done:
- [ ] The provider satisfies every method of `ModelProvider` (A1).
- [ ] `capabilities()` and `health()` return well-formed values.
- [ ] The engine drives the provider without provider-specific branches (test G2-T1).

**G3 — Streaming and cancellation tests**

Definition of done:
- [ ] Incremental streaming is asserted (no full buffering).
- [ ] Cancellation emits `done` with `cancelled` and aborts upstream.
- [ ] Malformed/truncated streams terminate cleanly.
- [ ] Accumulated text equals concatenated tokens.

**G4 — Governor integration tests**

Definition of done:
- [ ] A lease is acquired before send and released on success, cancel, timeout, and error.
- [ ] On the floor tier, a concurrent heavy acquisition blocks or degrades as specified.
- [ ] No lease leaks across the full matrix of outcomes (test G4-T1).

**G5 — Eviction and reload tests**

Definition of done:
- [ ] P1-19 passes: idle eviction unloads the model; the next turn reloads losslessly.
- [ ] Pressure eviction does not interrupt an active stream (ties to S0.2 D1-T2/D2-T2).
- [ ] Reload is transparent: no duplicate or reordered turns.

**G6 — Error and health tests**

Definition of done:
- [ ] Every mapped error code has a test.
- [ ] `health()` never triggers a model load.
- [ ] A model that fails to load reports `unavailable`, not `ready`.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S1.2-E1 (contract), S0.3-B5 | A2, A3 |
| A2 | A1, S1.2-E1 | G2 |
| A3 | A1, S0.2-A2 | C3, G2 |
| B1 | A1, S0.3-D2 (token) | B2 |
| B2 | B1, S0.3-A2 | B3, D4 |
| B3 | B2 | B4, B5, G3 |
| B4 | B3 | G3 |
| B5 | B3 | D2, G3 |
| C1 | S1.1-F1, S0.3-B5 | C3, G2 |
| C2 | C1, S1.1-F2 | C3, G2 |
| C3 | A3, C1, C2 | E1 |
| D1 | A1, S0.2-C1 | D2, G4 |
| D2 | D1, B5 | G4 |
| D3 | A1, S0.3-B5, S0.3-F1 | D5 |
| D4 | D3, S0.3-F4, B2 | D5 |
| D5 | D3, D4 | G5 |
| D6 | D3, S0.3-B5 | E2 |
| E1 | B3, B5, C3 | G6 |
| E2 | D6, F2 | E3, G6 |
| E3 | E2, F3 | — |
| F1 | S0.3-C5 | F2 |
| F2 | F1, S0.3-B2 | E2, G6 |
| F3 | F1 | E3 |
| G1 | B1, D1 | G2–G6 |
| G2 | G1, A1–A3, C1–C3 | — |
| G3 | G1, B3–B5 | — |
| G4 | G1, D1–D2 | — |
| G5 | G1, D3–D5 | — |
| G6 | G1, E1–E3, F2 | — |

Parallel opportunities: Group 2 (transport) and Group 3 (token counting) can proceed concurrently
once A1–A3 are frozen. Group 5 (errors/health) can begin as soon as B3 defines the stream's failure
modes.

---

## 4. Slice-level Definition of Done

S1.3 is complete when **all** of the following hold:

- [ ] `LocalModelProvider` implements `ModelProvider` with no interface drift (A1).
- [ ] The provider is the registered default and the engine drives it with no provider-specific
      branches (A2, G2).
- [ ] All traffic goes through the authenticated proxy; the provider never addresses Ollama
      directly (B1).
- [ ] Streaming is incremental and cancellable, and accumulated text equals the token stream
      exactly (B3, B4).
- [ ] Token counting is accurate or conservatively calibrated, with the error bound recorded (C1,
      C2).
- [ ] An `llm` lease is acquired per stream and released on success, cancel, timeout, and error,
      with no leaks (D1, D2, G4).
- [ ] Idle eviction unloads the model and the next turn reloads losslessly (P1-19).
- [ ] `keep_alive` is derived from the tier profile and changes without a restart (D4).
- [ ] Every provider failure maps to a specific `ChatErrorCode`, never a generic `unknown` (E1).
- [ ] `health()` is truthful and never triggers a model load (E2, G6).
- [ ] All tests run offline and deterministically against a mock proxy.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Provider bypasses the proxy and talks to Ollama directly | Breaks the single-loopback-client invariant | Assert in tests; import rule from S0.3 D1-T2 (B1) |
| Token leaks into logs or error output | Credential exposure | Explicit non-logging tests (B1-T1) |
| No reliable runtime tokenizer | Budgeting is approximate | Calibrate against `prompt_eval_count`; bound and record the error (C2) |
| Lease released only on the happy path | Slot leak stalls all generation on floor | Release on every path; leak matrix test (D2, G4) |
| Eviction interrupts an active stream | Corrupts a user interaction | Governor already forbids it; assert in G5 |
| Malformed stream hangs the provider | Frozen chat | Malformed-stream test; `done` with `error` (B3-T2) |
| `keep_alive` unit mismatch with the runtime | Model never unloads, or unloads instantly | Define and test the mapping (D4) |
| Health check triggers a model load | Unwanted memory pressure | Health must not load; assert (E2-T1) |
| Engine gains provider-specific branches | Breaks swappability for Phase 6 | Contract-only dependency; asserted (G2-T1) |

---

## 6. Traceability

| Phase 1 reference / test | Covered by |
|---|---|
| §3.1 `ModelProvider` interface | A1, G2 |
| §3.1 `ModelCapabilities` | A3 |
| §3.1 `CompletionRequest` / `CompletionChunk` | B2, B3 |
| §3.2 Registry and selection | A2 |
| §3.3.1 Proxy client, lifecycle | B1, D6 |
| §3.3.2 Model reference | F1, F2, F3 |
| §3.3.3 Governor integration | D1, D2, D3, D4, D5 |
| §3.3.6 Capabilities (`minTier: floor`) | A3 |
| P1-19 Idle eviction reload | D5, G5 |
| P1-13 (deferred) | S1.4 |

S1.3 output is consumed by S1.4 (live model latency), Phase 3 (voice hands transcripts to the
engine), and Phase 6 (cloud providers register alongside it behind the same contract).
