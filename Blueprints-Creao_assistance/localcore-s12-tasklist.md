# LocalCore — S1.2 Implementation Task List

Slice: **S1.2 — Chat engine, turn store, streaming, cancel, regenerate, thinking indicator**
Source: Phase 1 §2; Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- `Turn` and `Conversation` domain types.
- A turn store with store-assigned monotonic `seq` per conversation.
- Conversation lifecycle: create, title, search, delete.
- `ChatEngine`: `send`, `cancel`, `regenerate`.
- Streaming token re-emission and the `thinking` indicator.
- Cancellation, regeneration, and crash recovery semantics.
- Provider registry, provider selection, and the deterministic **test double provider (Provider C)**.
- Atomic persistence and history replay.
- Encryption at rest and integration with the S0.2 governor for lease acquisition.

**Explicit non-goals (do not build here):**
- No real model provider (S1.3); the engine runs entirely on the test double.
- No latency tuning against real hardware (S1.4).
- No memory retrieval or extraction (Phase 2); the engine passes an empty memory block.
- No persona authoring UI (S1.1) and no avatar/voice/emotion cues (Phases 3–4).
- No tool calling (Phase 5).

Rationale: S1.2 is the first slice that produces a real, persisted conversation. It is built against
the test double so the entire chat lifecycle — including cancel, regenerate, crash recovery, and
provider swap — can be verified before any model exists.

---

## 1. Ordering principles

1. **Domain types before the store** — `seq` semantics are defined by the model.
2. **Store before the engine** — the engine persists through the store.
3. **Store before conversation lifecycle** — search and delete operate on the store.
4. **Provider abstraction before the engine loop** — the engine depends on the contract, not a model.
5. **Streaming before cancel** — there must be a stream to abort.
6. **Cancel before regenerate** — regenerate reuses the same turn-creation path.
7. **Durability before recovery tests** — crash handling depends on the in-progress marker.
8. **The engine never awaits model load before emitting `thinking`.** This is a lifecycle rule, not
   an optimization; it is asserted in tests.

---

## 2. Task list

### Group 1 — Domain model & turn store

**A1 — `Turn` and `Conversation` types**

Deliverable: the domain types from Phase 1 §2.1.

Definition of done:
- [ ] `Turn` includes `id`, `conversationId`, `seq`, `role`, `content`, `createdAt`, `status`,
      `modelId`, `personaId`, `tokenCount`, `latencyMs`, `parentTurnId`.
- [ ] `Conversation` includes `id`, `title`, `personaId`, `modelId`, `createdAt`, `updatedAt`,
      `turnCount`.
- [ ] `status` is a union: `complete` | `cancelled` | `error`.
- [ ] `role` is a union: `user` | `assistant`.
- [ ] Types compile under strict mode with no `any`.

**A2 — Turn store with monotonic `seq`**

Deliverable: the ordering guarantee.

Definition of done:
- [ ] `seq` is assigned by the store, never by the caller (test A2-T1).
- [ ] `seq` is monotonic per conversation and never reused, even after deletion.
- [ ] Appending is atomic; two concurrent appends cannot produce the same `seq` (test A2-T2).
- [ ] Reading a conversation returns turns ordered by `seq` deterministically.

**A3 — Conversation store**

Deliverable: conversation create, list, get, update, delete.

Definition of done:
- [ ] Conversations are stored under the S0.1 app-data layout using the S0.1 write wrapper.
- [ ] Writes are atomic; a partial write cannot corrupt a conversation.
- [ ] `turnCount` is maintained consistently with the turn store (test A3-T1).
- [ ] Listing returns conversations ordered by `updatedAt` descending, deterministically.

**A4 — Encryption at rest**

Deliverable: conversations and turns encrypted.

Definition of done:
- [ ] Turn and conversation records are written through the S0.1 encryption wrapper.
- [ ] A record cannot be read without the OS user context (test A4-T1).
- [ ] Encryption failure fails the write rather than storing plaintext (ties to S0.1 B2).
- [ ] The no-writes-outside watcher still passes with the store in place.

---

### Group 2 — Conversation lifecycle

**B1 — Conversation creation and binding**

Deliverable: a new conversation bound to a persona and default provider.

Definition of done:
- [ ] A new conversation records the active `personaId` and the current default `modelId`.
- [ ] Creation fails cleanly if the active persona cannot be resolved.
- [ ] The first user turn triggers title derivation (from the first message, bounded length).
- [ ] Creation is idempotent under retry (no duplicate conversation).

**B2 — Conversation search**

Deliverable: local full-text search over turn content.

Definition of done:
- [ ] Search matches turn content and conversation titles.
- [ ] Search is scoped to the active persona (test B2-T1).
- [ ] Results are ordered by relevance then recency, deterministically.
- [ ] Search returns only turns inside the retention window (Phase 2 will enforce this; the hook
      exists now).

**B3 — Conversation delete**

Deliverable: idempotent, complete deletion.

Definition of done:
- [ ] Deleting removes the conversation, its turns, and any derived data (P1-6).
- [ ] A second delete of the same id is a **no-op**, not an error (P1-6).
- [ ] Deletion is atomic; an interrupted delete does not leave orphaned turns (test B3-T1).
- [ ] Deletion of the active conversation returns the UI to a defined empty state.

**B4 — Rename and title**

Deliverable: editable conversation titles.

Definition of done:
- [ ] A conversation can be renamed; the change persists and updates `updatedAt`.
- [ ] Auto-derived titles are replaced, not appended.
- [ ] Title length is bounded and validated.
- [ ] Rename is atomic.

---

### Group 3 — Engine & streaming

**C1 — `ChatEngine.send()`**

Deliverable: the async iterable chat entry point.

Definition of done:
- [ ] `send(conversationId, input, opts)` returns an `AsyncIterable<ChatEvent>`.
- [ ] `opts` supports `personaId`, `modelId`, `maxTokens`, `temperature`, `signal`.
- [ ] The engine does **not** acquire an `llm` lease; the provider owns it (Phase 1 §2.5, S1.3 D1).
      The test asserts that **no lease remains held after the turn**, on success, cancel, and error
      (test C1-T1).
- [ ] A send for a non-existent conversation fails with a structured error.

**C2 — Thinking indicator**

Deliverable: the `thinking` event.

Definition of done:
- [ ] `thinking` is emitted **immediately on send**, before any model load or lease acquisition
      (test C2-T1).
- [ ] On the floor tier it is emitted within 300ms (P1-7), asserted by test.
- [ ] It carries the `turnId` and timestamp.
- [ ] It is emitted exactly once per turn.

**C3 — Token stream re-emission**

Deliverable: streamed tokens surfaced to the caller.

Definition of done:
- [ ] Provider chunks are re-emitted as `token` events in order, with no loss or duplication
      (test C3-T1).
- [ ] Streaming is incremental — the engine does not buffer the whole response before emitting.
- [ ] Backpressure from a slow consumer does not corrupt ordering.
- [ ] The accumulated text matches the concatenated token stream exactly.

**C4 — Turn lifecycle orchestration**

Deliverable: the 8-step lifecycle from Phase 1 §2.3.

Definition of done:
- [ ] Order is: `thinking` → assemble prompt (S1.1) → persist user turn → invoke the provider
      (which acquires the `llm` lease) → persist assistant turn → emit `turnCompleted`.
- [ ] The engine holds no `llm` lease of its own; lease lifecycle belongs to the provider.
- [ ] The user turn is persisted **before** generation begins (test C4-T1).
- [ ] The assistant turn is persisted only on successful completion.
- [ ] The assistant turn records `modelId`, `personaId`, `tokenCount`, and `latencyMs`.

**C5 — Error mapping**

Deliverable: the `ChatError` taxonomy.

Definition of done:
- [ ] Error codes are implemented: `provider-unavailable`, `model-load-failed`, `context-overflow`,
      `consent-denied`, `rate-limited`, `offline`, `cancelled`, `unknown`.
- [ ] Each error is emitted as an `error` event with `recoverable` set correctly.
- [ ] `context-overflow` is produced when the S1.1 assembler reports `overBudget`.
- [ ] An error leaves the conversation in a valid state (user turn present, no assistant turn).

---

### Group 4 — Cancellation & regenerate

**D1 — Cancel**

Deliverable: cancel semantics per C3 (keep the user turn).

Definition of done:
- [ ] `cancel(turnId)` aborts the provider stream and discards the in-memory assistant buffer.
- [ ] **No partial assistant turn is persisted** (P1-3).
- [ ] The **user turn is kept**, and retry/regenerate is offered (P1-3).
- [ ] The next user turn appends cleanly with the next `seq` — no gap, no duplicate (P1-3).
- [ ] The provider's `llm` lease is released on cancel; the engine holds none (test D1-T1).

**D2 — Regenerate**

Deliverable: regenerate without overwriting history.

Definition of done:
- [ ] `regenerate(turnId)` creates a **new** assistant turn with `parentTurnId` set (P1-4).
- [ ] The original turn is never modified or deleted (P1-4).
- [ ] The new turn uses the current provider/persona unless overridden.
- [ ] Regenerating a turn that is not an assistant turn is rejected with a structured error.

**D3 — Crash during streaming**

Deliverable: recovery from an interrupted generation.

Definition of done:
- [ ] An in-progress marker is written when generation begins.
- [ ] On startup, any assistant turn still marked in-progress is **discarded** (P1-5).
- [ ] The conversation remains valid and usable after recovery (P1-5).
- [ ] Recovery is idempotent; running it twice changes nothing.

**D4 — Concurrency guards**

Deliverable: one active generation per conversation.

Definition of done:
- [ ] A second `send` on a conversation with an active generation is rejected with a defined error
      (test D4-T1).
- [ ] Different conversations can generate concurrently.
- [ ] A cancelled or errored generation releases the guard so the next send proceeds.

---

### Group 5 — Provider abstraction & test double

**E1 — Provider registry and selection**

Deliverable: the registry from Phase 1 §3.2.

Definition of done:
- [ ] `register`, `get`, `list`, `setDefault`, `getDefault` are implemented.
- [ ] Selection resolves per turn: `opts.modelId` > conversation `modelId` > default (test E1-T1).
- [ ] An unknown provider id produces `provider-unavailable`, never a silent substitution.
- [ ] The registry holds only contracts; no provider-specific logic leaks into the engine.

**E2 — Provider C: deterministic test double**

Deliverable: a scriptable, offline provider.

Definition of done:
- [ ] Emits scripted token sequences deterministically (test E2-T1).
- [ ] Can simulate: normal completion, mid-stream error, slow start, and a stream that never ends.
- [ ] Reports `capabilities()` and `health()` like any provider.
- [ ] It is registered only in test/dev builds, never in production.

**E3 — Provider swap mid-session**

Deliverable: swappable providers without history corruption.

Definition of done:
- [ ] Swapping providers affects only future turns; existing turns keep their recorded `modelId`
      (P1-2).
- [ ] Two test-double providers with different scripts can be swapped mid-conversation (P1-2).
- [ ] No turn is rewritten, duplicated, or reordered by a swap (P1-2).
- [ ] The UI surface can display which turns were produced by which provider.

---

### Group 6 — Persistence & durability

**F1 — Atomic assistant turn commit**

Deliverable: no partial turns on disk.

Definition of done:
- [ ] The assistant turn is written in a single atomic commit (test F1-T1).
- [ ] A crash between generation and commit leaves no assistant turn, not a truncated one.
- [ ] The commit includes `seq`, `modelId`, `tokenCount`, and `latencyMs` in one write.
- [ ] `turnCount` is updated in the same atomic operation.
- [ ] Persistence is **conditional**: with `transcripts` disabled or the disclosure unacknowledged,
      no turn is written and the session is ephemeral (Phase 1 §2.5).

**F2 — In-progress marker**

Deliverable: the durability primitive behind D3.

Definition of done:
- [ ] The marker is written before the first token and cleared on completion.
- [ ] The marker is durable across a process crash (test F2-T1).
- [ ] A marker for a conversation that no longer exists is cleaned up harmlessly.
- [ ] Markers never appear as turns in history.

**F3 — History replay by `seq`**

Deliverable: identical history across restarts.

Definition of done:
- [ ] Replaying a conversation by `seq` reproduces the exact order after restart (P1-1).
- [ ] Replay is independent of file ordering or timestamps (test F3-T1).
- [ ] A 50-turn session survives restart with byte-identical history and order (P1-1).
- [ ] Replay is efficient enough for a long conversation (no full-store scan per turn).
- [ ] With transcripts disabled or unacknowledged, nothing survives restart, and that is the
      asserted behaviour, not a failure (Phase 1 §2.5).

---

### Group 7 — Verification

**G1 — Test harness**

Deliverable: deterministic, offline engine tests.

Definition of done:
- [ ] A harness can drive the engine against Provider C with scripted streams.
- [ ] The clock is injectable for latency and timestamp assertions.
- [ ] Tests run offline and deterministically in CI.
- [ ] No test depends on the real model.

**G2 — P1-1: history and restart**

Definition of done:
- [ ] P1-1 passes: 50-turn session survives restart with identical history and order.
- [ ] The test asserts `seq` continuity explicitly.

**G3 — P1-2: provider swap**

Definition of done:
- [ ] P1-2 passes: new turns use the new provider; old turns unchanged.
- [ ] The test asserts each turn's recorded `modelId`.

**G4 — P1-3, P1-4, P1-5: cancel, regenerate, crash**

Definition of done:
- [ ] P1-3 passes: no partial assistant turn; user turn kept; no `seq` gap.
- [ ] P1-4 passes: regenerate creates a new turn with `parentTurnId`; original intact.
- [ ] P1-5 passes: in-progress turn discarded on restart; conversation valid.
- [ ] Each test also asserts no `llm` lease remains held after the turn (the provider owns and
      releases it).

**G5 — P1-6, P1-7: delete and thinking**

Definition of done:
- [ ] P1-6 passes: first delete removes turns and derived data; second is a no-op.
- [ ] P1-7 passes: `thinking` emitted within 300ms, before model load.
- [ ] The thinking test uses an artificially slow provider to prove the ordering.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1 (shared types) | A2, A3, C1 |
| A2 | A1, S0.1-B3 | A3, F1, F3 |
| A3 | A1, A2 | A4, B1–B4 |
| A4 | A3, S0.1-B2 | F1 |
| B1 | A3, S1.1-C2 | C1 |
| B2 | A3 | — |
| B3 | A3 | G5 |
| B4 | A3 | — |
| C1 | A2, A3, S1.1-D1, S0.2-C1 | C2–C5, D1 |
| C2 | C1 | G5 |
| C3 | C1, E2 | G1 |
| C4 | C1, C2, C3, S1.1-D1 | D1–D3, F1 |
| C5 | C4 | G4 |
| D1 | C4 | G4 |
| D2 | C4, A2 | G4 |
| D3 | F2 | G4 |
| D4 | C4 | — |
| E1 | S0.1 | E3, C1 |
| E2 | E1 | C3, G1 |
| E3 | E1, A1 | G3 |
| F1 | A4, C4 | G2 |
| F2 | A2, A3 | D3, G4 |
| F3 | A2 | G2 |
| G1 | E2, C3 | G2–G5 |
| G2 | G1, F1, F3 | — |
| G3 | G1, E3 | — |
| G4 | G1, D1–D3, C5 | — |
| G5 | G1, C2, B3 | — |

Parallel opportunities: Group 5 (provider abstraction and test double) can be built alongside
Group 1 (domain and store). Group 2 (conversation lifecycle) is independent of Group 3 once the
store exists.

---

## 4. Slice-level Definition of Done

S1.2 is complete when **all** of the following hold:

- [ ] A 50-turn session survives restart with identical history and order (P1-1).
- [ ] Swapping providers mid-session affects only future turns; existing turns keep their
      `modelId` (P1-2).
- [ ] Cancelling mid-stream persists no partial assistant turn, keeps the user turn, offers retry,
      and leaves no `seq` gap (P1-3).
- [ ] Regenerate creates a new assistant turn with `parentTurnId` and never overwrites history
      (P1-4).
- [ ] A crash during streaming discards the in-progress turn on restart, leaving the conversation
      valid (P1-5).
- [ ] Deleting a conversation removes its turns and derived data; a second delete is a no-op
      (P1-6).
- [ ] `thinking` is emitted within 300ms and before any model load (P1-7).
- [ ] `seq` is store-assigned, monotonic, never reused, and the sole ordering authority.
- [ ] The provider's `llm` lease is released on every exit path — success, cancel, and error — and
      the engine holds no lease of its own.
- [ ] With transcripts disabled or the disclosure unacknowledged, chat continues as an ephemeral
      session and nothing is persisted (Phase 1 §2.5).
- [ ] All tests run offline and deterministically against Provider C.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| `seq` assigned by a caller or reused after deletion | History corruption, ordering bugs | Store-assigned, never reused; asserted in tests (A2) |
| Thinking indicator waits on model load | Perceived hang on the floor tier | Emit before lease/load; slow-provider test (C2) |
| Cancel leaves a partial turn on disk | Corrupt history | Buffer in memory; commit only on completion (D1, F1) |
| Regenerate mutates the original turn | Lost history | New turn with `parentTurnId`; original immutable (D2) |
| Crash recovery runs before the marker is durable | Orphaned in-progress turn survives | Marker written before first token, durable (F2) |
| Concurrent sends on one conversation | Interleaved, out-of-order turns | One active generation per conversation (D4) |
| Provider swap rewrites old turns | Silent history mutation | Per-turn `modelId`; swap affects future only (E3) |
| Delete leaves orphaned turns | Storage leak, privacy issue | Atomic delete; idempotent; asserted (B3) |
| Engine couples to a concrete provider | S1.3 and Phase 6 require rework | Engine depends on the contract only (E1) |

---

## 6. Traceability

| Phase 1 reference / test | Covered by |
|---|---|
| §2.1 Turn model, `seq` guarantee | A1, A2 |
| §2.1 Conversation model | A1, A3 |
| §2.2 Engine interface | C1 |
| §2.2 `ChatEvent` union | C2, C3, C5 |
| §2.2 `ChatErrorCode` | C5 |
| §2.3 Turn lifecycle | C4 |
| §2.4 Cancellation semantics | D1, D2, D3 |
| §2.5 Persistence | A4, F1, F2, F3 |
| §3.2 Registry and selection | E1, E3 |
| §3.5 Provider C (test double) | E2 |
| P1-1 50-turn restart | F3, G2 |
| P1-2 Provider swap | E3, G3 |
| P1-3 Cancel | D1, G4 |
| P1-4 Regenerate | D2, G4 |
| P1-5 Crash during streaming | D3, F2, G4 |
| P1-6 Delete conversation | B3, G5 |
| P1-7 Thinking indicator | C2, G5 |

S1.2 output (`ChatEngine`, turn store, provider registry) is consumed by S1.3 (real local provider),
S2.1 (memory store reads the turn store), S3.1/S3.2 (voice hands transcripts to the engine),
S4.2 (emotion cues from `ChatEvent`), and S5.2 (model tool proposals).
