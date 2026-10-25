# LocalCore — S2.2 Implementation Task List

Slice: **S2.2 — Retrieval and memory-block assembly**
Source: Phase 2 §1.5 (memory block assembly, budget) and §4.8 (`retrieve`);
S1.1 (assembly seam, budget, trimming); S2.1 (stores, embedder).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- `MemoryService.retrieve(query, opts) → MemoryContext`.
- Vector similarity search over facts and summaries using the S2.1 embedder.
- Ranking: facts by similarity × recency × confidence; summaries by similarity × recency.
- Deterministic ordering and tie-breaking.
- Memory-block formatting and budget-aware selection.
- Category gating and global disable behaviour.
- Injection of the memory block into the S1.1 assembly seam.
- Retrieval performance within the S1.4 latency budget.

**Explicit non-goals (do not build here):**
- No fact extraction or summarization (S2.3, S2.4) — retrieval reads what exists.
- No pruning or retention (S2.4).
- No transparency UI, indicator, or write log (S2.5).
- No changes to the fact/summary schemas (S2.1) or the persona/assembly contract (S1.1).
- No cloud embeddings.

Rationale: S2.2 makes stored memory useful. It is deliberately separate from the extraction
pipeline so retrieval can be verified against seeded stores, without depending on a model's ability
to extract facts well.

---

## 1. Ordering principles

1. **Store reads before ranking** — ranking operates on candidates.
2. **Ranking before selection** — selection needs an order.
3. **Selection before formatting** — format what fits, not what was found.
4. **Budget model before overflow handling** — the drop order is meaningless without a limit.
5. **Gating before assembly** — a disabled category must never reach the assembler.
6. **Retrieval before injection** — the memory block exists before it is placed.
7. **Determinism throughout** — identical store state and query must produce identical output, or
   the S1.1 golden tests become flaky.

---

## 2. Task list

### Group 1 — Retrieval core

**A1 — `retrieve()` entry point**

Deliverable: the retrieval API from Phase 2 §4.8.

Definition of done:
- [ ] `retrieve(query, opts)` returns a typed `MemoryContext`.
- [ ] `MemoryContext` includes `facts`, `summaries`, `recentTurns`, and `tokenEstimate`.
- [ ] `opts` supports `topK`, `categories`, `conversationId`, and a token budget hint.
- [ ] Retrieval is read-only: it never writes a fact or summary (except `lastUsedAt`, see B5).

**A2 — Fact vector search**

Deliverable: similarity search over facts.

Definition of done:
- [ ] The query is embedded with the S2.1 embedder.
- [ ] Facts are ranked by cosine similarity against the query vector.
- [ ] Facts without an embedding are excluded from vector search but may still be included by
      recency/confidence (test A2-T1).
- [ ] Search is scoped to the active `characterId`.

**A3 — Summary vector search**

Deliverable: similarity search over summaries.

Definition of done:
- [ ] Summaries are ranked by cosine similarity against the query vector.
- [ ] Search is scoped to the active `characterId` and, where relevant, the conversation.
- [ ] Summaries without an embedding are handled consistently with A2-T1.
- [ ] The `seq` range of each returned summary is available to the caller for traceability.

**A4 — Recent-turn retrieval**

Deliverable: the active conversation's recent turns.

Definition of done:
- [ ] Recent turns come from the S2.1 session buffer, not a transcript copy.
- [ ] The most recent N turns are returned in `seq` order.
- [ ] The turn count is bounded and configurable.
- [ ] Recent turns are always available for immediate conversational coherence, independent of
      the facts/summaries toggles.

**A5 — Retrieval options**

Definition of done:
- [ ] `topK` bounds the candidate count for facts and summaries independently.
- [ ] `categories` restricts which memory categories are consulted.
- [ ] `conversationId` scopes summary retrieval where appropriate.
- [ ] Invalid options are rejected with a structured error, not silently ignored.

---

### Group 2 — Ranking & scoring

**B1 — Fact ranking**

Deliverable: similarity × recency × confidence.

Definition of done:
- [ ] The score combines similarity, recency, and confidence with documented weights.
- [ ] Weights are data, not scattered constants (test B1-T1).
- [ ] A high-confidence, recent, similar fact outranks a low-confidence, old one in a fixture test.
- [ ] The scoring function is pure and deterministic.

**B2 — Summary ranking**

Deliverable: similarity × recency.

Definition of done:
- [ ] The score combines similarity and recency with documented weights.
- [ ] More recent summaries outrank older ones at equal similarity (fixture test).
- [ ] Scoring is pure and deterministic.

**B3 — Near-duplicate suppression**

Definition of done:
- [ ] Near-duplicate facts are suppressed in the returned set (test B3-T1).
- [ ] Suppression prefers the higher-ranked member and does not lose information silently.
- [ ] The suppression threshold is configurable and documented.
- [ ] Suppression is deterministic.

**B4 — Deterministic tie-breaking**

Definition of done:
- [ ] Equal scores are broken by a stable key (e.g. `id`), never by iteration order
      (test B4-T1).
- [ ] The same store state and query produce an identical ordered result across runs.
- [ ] Ordering does not depend on object key insertion order.

**B5 — `lastUsedAt` update**

Definition of done:
- [ ] Facts actually injected into a prompt have `lastUsedAt` updated.
- [ ] Facts retrieved but not injected do not get their `lastUsedAt` touched (test B5-T1).
- [ ] The update is batched and does not write on every retrieval call.
- [ ] `lastUsedAt` updates never change ranking within the same retrieval.

---

### Group 3 — Memory block assembly & budget

**C1 — Memory-block formatting**

Deliverable: the structured text injected into the prompt.

Definition of done:
- [ ] The block has a stable, documented structure (facts section, then summaries section).
- [ ] Formatting is deterministic and free of timestamps or locale-dependent output.
- [ ] Empty sections produce no stray headings (test C1-T1).
- [ ] The block is produced by a pure function of its inputs.

**C2 — Budget-aware selection**

Deliverable: fill the block within the tier budget.

Definition of done:
- [ ] The block respects the tier budget: floor ≤ 400 tokens, mid ≤ 800, high ≤ 1200.
- [ ] Facts are selected first (highest signal, most compact), then summaries (test C2-T1).
- [ ] Selection stops when the budget is reached; it does not exceed the budget to fit one more.
- [ ] The budget is read from the active `TierProfile`, not hard-coded.

**C3 — Overflow drop order**

Deliverable: the specified drop order.

Definition of done:
- [ ] On overflow, the lowest-ranked **summaries** are dropped first, then the lowest-ranked
      **facts** (Phase 2 §1.5).
- [ ] Dropping is recorded in a report so the debug view can show what was omitted.
- [ ] Dropping is deterministic.
- [ ] The block never exceeds its budget after dropping.

**C4 — Persona and user message protection**

Definition of done:
- [ ] The memory block is dropped **before** the persona block or the current user message
      (ties to S1.1 E2).
- [ ] A test asserts that an over-budget prompt drops memory, never the persona or the user message
      (test C4-T1).
- [ ] Memory-block dropping is reported in the S1.1 `TrimReport`.

**C5 — Token estimate reporting**

Definition of done:
- [ ] `tokenEstimate` reflects the selected block's size using the S1.1 `TokenCounter`.
- [ ] The estimate is consistent with the assembler's own accounting (no double-counting)
      (test C5-T1).
- [ ] The estimate is conservative (over- rather than under-estimates).
- [ ] The estimate is available before assembly, so callers can decide whether to retrieve.

---

### Group 4 — Category gating & disable

**D1 — Category toggles**

Definition of done:
- [ ] Disabling `facts` removes facts from retrieval output.
- [ ] Disabling `summaries` removes summaries from retrieval output.
- [ ] Disabling `transcripts` prevents the persisted transcript layer from being consulted beyond
      the active session (the active buffer remains available for coherence).
- [ ] Disabled categories are **neither returned nor used**, and the behaviour is documented
      (test D1-T1).

**D2 — Global disable**

Definition of done:
- [ ] With memory disabled, `retrieve()` returns an empty memory block (facts and summaries)
      (test D2-T1).
- [ ] Recent turns remain available, because the active conversation is not "memory".
- [ ] Disabling takes effect immediately, with no restart and no cached stale block.
- [ ] The distinction between "memory disabled" and "active conversation" is documented.

**D3 — No writes from retrieval**

Definition of done:
- [ ] Retrieval never creates, updates, or deletes facts or summaries (other than `lastUsedAt`).
- [ ] A disabled category cannot be reintroduced by a cached block (ties to F4).
- [ ] Gating is applied at retrieval, not only at injection (defence in depth).

---

### Group 5 — Integration with S1.1

**E1 — Injection into the assembly seam**

Deliverable: the memory block placed into `PromptAssembler`.

Definition of done:
- [ ] The S1.1 `MemoryBlock` seam is populated by `retrieve()`.
- [ ] The assembler remains pure: it receives the block, it does not perform retrieval
      (test E1-T1).
- [ ] An empty block produces an unchanged prompt versus S1.1's no-memory behaviour.
- [ ] The block's placement is between the persona block and recent turns.

**E2 — Assembly order**

Definition of done:
- [ ] Order is: persona → memory → recent turns → current user message.
- [ ] The order is asserted by a golden-file test.
- [ ] Reordering is impossible without failing a test.
- [ ] The order matches Phase 2 §1.5 and Phase 1 §1.4.

**E3 — Interaction with trimming**

Definition of done:
- [ ] When the prompt is over budget, S1.1's trimming drops memory before persona or the user
      message (C4).
- [ ] Trimming interacts correctly with C3's drop order (summaries then facts).
- [ ] The combined behaviour is covered by a test that overflows on purpose.
- [ ] No double-trimming occurs (the assembler and the selector do not both drop the same content).

**E4 — Determinism with memory**

Definition of done:
- [ ] The same store state, query, and turns produce a byte-identical prompt across 100 runs
      (test E4-T1).
- [ ] The S1.1 golden-file tests are extended to cover a populated memory block.
- [ ] Retrieval introduces no clock or randomness into the prompt.

---

### Group 6 — Performance & governor

**F1 — Retrieval latency budget**

Definition of done:
- [ ] End-to-end retrieval (embed query + search + select + format) is measured.
- [ ] Retrieval latency is reported against the S1.4 TTFT budget and shown not to dominate it
      (test F1-T1).
- [ ] A retrieval that would exceed a documented bound degrades by reducing `topK` rather than
      stalling the turn.
- [ ] Latency is recorded in the trace alongside the other stages.

**F2 — Query embedding**

Definition of done:
- [ ] The query is embedded once per turn, not once per category (test F2-T1).
- [ ] Query embedding runs as a light pipeline (S2.1 E4) and does not evict the chat model.
- [ ] A query-embedding failure degrades to non-vector retrieval (recency/confidence) rather than
      failing the turn.
- [ ] Query embedding cost is included in F1's measurement.

**F3 — Governor interaction**

Definition of done:
- [ ] Retrieval yields to active generation and voice under the priority order.
- [ ] Retrieval never requests a heavy slot.
- [ ] On the floor tier, retrieval does not push the chat model out of memory (ties to P2-23).

**F4 — Caching correctness**

Definition of done:
- [ ] If retrieval results are cached, the cache is invalidated on any fact/summary change.
- [ ] A deleted fact is absent from retrieval within one turn (P2-4), cached or not (test F4-T1).
- [ ] A disabled category cannot be served from a stale cache (ties to D3).
- [ ] Cache keys include the query, character, and category set.

---

### Group 7 — Verification

**G1 — Fixtures and doubles**

Definition of done:
- [ ] Seeded fact and summary stores with known similarity relationships.
- [ ] A stub embedder produces deterministic vectors for ranking tests.
- [ ] Fixtures cover: high/low confidence, recent/old, duplicate, and no-embedding cases.
- [ ] Tests run offline and deterministically.

**G2 — P2-4: deleted fact gone from retrieval**

Definition of done:
- [ ] P2-4 passes: deleting a fact removes it from retrieval within one turn.
- [ ] The test covers both a cold cache and a warm cache.
- [ ] It asserts the embedding is gone too (ties to S2.1 F3).

**G3 — P2-18: budget assembly**

Definition of done:
- [ ] P2-18 passes: the memory block respects the tier budget; the persona is never dropped.
- [ ] The test overflows deliberately and asserts the drop order (summaries then facts).
- [ ] It asserts the persona block and current user message survive.

**G4 — Ranking correctness**

Definition of done:
- [ ] Fixture tests assert the expected order for fact and summary rankings.
- [ ] Tie-breaking is asserted to be stable and deterministic.
- [ ] Near-duplicate suppression is asserted.

**G5 — Determinism**

Definition of done:
- [ ] 100 retrievals with identical inputs produce identical ordered output.
- [ ] The assembled prompt with memory is byte-identical across runs.
- [ ] The extended golden file pins the default persona plus a populated memory block.

**G6 — Performance**

Definition of done:
- [ ] Retrieval latency is measured and reported against the budget.
- [ ] A large store (documented size) does not blow the budget.
- [ ] Degradation under load reduces `topK` rather than stalling.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S2.1-B1, S2.1-C1, S2.1-D1 | A2–A5 |
| A2 | A1, S2.1-E3 | B1 |
| A3 | A1, S2.1-E3 | B2 |
| A4 | A1, S2.1-D1 | C2, E2 |
| A5 | A1 | D1 |
| B1 | A2 | C2, G4 |
| B2 | A3 | C2, G4 |
| B3 | B1 | G4 |
| B4 | B1, B2 | G5 |
| B5 | B1, S2.1-B2 | — |
| C1 | A2, A3 | C2 |
| C2 | C1, S1.1-E1 | C3, G3 |
| C3 | C2 | E3, G3 |
| C4 | C2, S1.1-E2 | E3, G3 |
| C5 | C2, S1.1-F1 | E1 |
| D1 | A5, S2.1 (category flags) | D3, G2 |
| D2 | A1 | D3 |
| D3 | D1, D2, F4 | — |
| E1 | C2, S1.1-D1 | E2 |
| E2 | E1 | E4, G5 |
| E3 | E2, C3, C4 | G3 |
| E4 | E2 | G5 |
| F1 | A1, C2 | G6 |
| F2 | A1, S2.1-E4 | F1, G6 |
| F3 | F1, S0.2-A1 | — |
| F4 | A1, S2.1-B2, S2.1-C2 | G2 |
| G1 | A1, B1 | G2–G6 |
| G2 | G1, F4, D1 | — |
| G3 | G1, C2–C4 | — |
| G4 | G1, B1–B3 | — |
| G5 | G1, E2, B4 | — |
| G6 | G1, F1, F2 | — |

Parallel opportunities: Group 2 (ranking) can proceed alongside Group 3 (assembly) once A2–A4
return candidates. Group 4 (gating) is independent of ranking and can be built early.

---

## 4. Slice-level Definition of Done

S2.2 is complete when **all** of the following hold:

- [ ] `retrieve()` returns facts, summaries, recent turns, and a token estimate (A1).
- [ ] Facts and summaries are ranked by the specified formulas, with deterministic tie-breaking
      (B1, B2, B4).
- [ ] The memory block respects the tier budget and drops summaries before facts on overflow
      (C2, C3).
- [ ] The persona block and current user message are never dropped in favour of memory (C4).
- [ ] Disabled categories are neither returned nor used; global disable yields an empty memory
      block while keeping the active conversation coherent (D1, D2).
- [ ] The memory block is injected between the persona block and recent turns, and the assembler
      remains pure (E1, E2).
- [ ] The prompt with memory is byte-identical across 100 runs (E4, G5).
- [ ] A deleted fact is absent from retrieval within one turn, cache or not (P2-4, G2).
- [ ] The memory block respects the budget without dropping the persona (P2-18, G3).
- [ ] Retrieval latency is measured and does not dominate TTFT (F1, G6).
- [ ] All tests run offline and deterministically with a stub embedder.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Retrieval cached across a delete | Deleted memory resurfaces | Invalidate on any change; P2-4 covers warm cache (F4, G2) |
| Disabled category served from a stale block | User's setting silently ignored | Gating at retrieval, cache keyed by category set (D3, F4) |
| Memory crowds out the persona | Prompt overflow drops the wrong thing | Memory dropped before persona; asserted (C4, G3) |
| Double-trimming (selector and assembler) | Content dropped twice, budget under-used | Single responsibility; combined test (E3) |
| Non-deterministic ordering | Flaky golden tests; unstable prompts | Stable tie-break keys; 100-run assertion (B4, E4) |
| Query embedded once per category | Wasted latency on every turn | Embed once per turn (F2) |
| Large store blows the latency budget | Slow first token | `topK` bounding and degradation rather than stalling (F1) |
| Vector search misses facts without embeddings | Relevant memory never surfaces | Fall back to recency/confidence for un-embedded facts (A2) |
| `lastUsedAt` writes on every retrieval | Write amplification | Batch updates; only for injected facts (B5) |

---

## 6. Traceability

| Phase 2 reference / test | Covered by |
|---|---|
| §1.5 `MemoryContext` | A1 |
| §1.5 Assembly order (facts → summaries → turns) | E2 |
| §1.5 Budget (floor ≤400, mid ≤800, high ≤1200) | C2 |
| §1.5 Ranking (similarity × recency × confidence) | B1, B2 |
| §1.5 Overflow order (summaries, then facts) | C3 |
| §1.5 Never drop persona or user message | C4 |
| §4.8 `retrieve` signature | A1, A5 |
| §4.8 Disabled categories neither written nor retrieved | D1, D2 |
| P2-4 Deleted fact gone from retrieval | F4, G2 |
| P2-18 Budget assembly | C2–C4, G3 |

S2.2 output (retrieval, memory block) is consumed by S2.5 (transparency panel shows what was
retrieved) and by every chat turn through the S1.1 assembly seam.
