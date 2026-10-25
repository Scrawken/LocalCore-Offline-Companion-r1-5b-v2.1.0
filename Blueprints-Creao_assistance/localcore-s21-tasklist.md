# LocalCore — S2.1 Implementation Task List

Slice: **S2.1 — Memory stores, encryption, and the ONNX embedder**
Source: Phase 2 §1 (memory layers, fact/summary schemas) and §3.3 (embeddings, M4);
S0.1 (encryption, app-data, write wrapper); S0.2 (governor); S1.2 (turn store).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The memory store layout and schema versioning.
- The **declaration** that the raw-transcript layer is the Phase 1 turn store — no second copy.
- The fact store, with source traceability and user-edit protection.
- The rolling-summary store, with `seq`-range invariants.
- The in-memory session buffer.
- The bundled MiniLM-class ONNX embedder, CPU-only, 384-dim.
- Encryption at rest for every layer, including embeddings.
- Deletion semantics that remove a record and its embedding together.

**Explicit non-goals (do not build here):**
- No retrieval or vector search (S2.2) — this slice stores and embeds, it does not query.
- No fact extraction pipeline (S2.3).
- No pruning, summarization, or retention (S2.4) — the summary *store* exists; the job does not.
- No transparency UI, indicator, or write log (S2.5).
- No second transcript table. This is a hard constraint, not a preference.

Rationale: S2.1 builds the durable substrate for memory. It deliberately stops before retrieval and
extraction so the storage layer can be verified — including its encryption and its no-duplication
guarantee — without depending on a model or a job scheduler.

---

## 1. Ordering principles

1. **Layout before stores** — every store writes into a defined place.
2. **Transcript-layer declaration first** — the no-second-copy rule must be fixed before any store
   is written, or a duplicate will appear by accident.
3. **Encryption before content** — no layer is written unencrypted at any point, not even briefly.
4. **Stores before embeddings linkage** — embeddings attach to records that exist.
5. **Embedder before embedding linkage** — the reference must point at something real.
6. **Deletion semantics alongside creation** — a record that can be written but not fully removed is
   a privacy defect.
7. **Embeddings are records too.** They are encrypted, traced, and deleted with their parent.

---

## 2. Task list

### Group 1 — Store foundation

**A1 — Memory store layout and schema versioning**

Deliverable: the memory directory structure and versioned schemas.

Definition of done:
- [ ] Stores live under the S0.1 app-data layout: `memory/facts/`, `memory/summaries/`,
      `memory/transcripts/` (see A2).
- [ ] Every record carries a `schemaVersion` with a migration stub.
- [ ] An unknown future version fails to load with a clear error rather than partially parsing.
- [ ] All writes go through the S0.1 write wrapper (atomic, path-validated).

**A2 — Transcript-layer declaration (no second copy)**

Deliverable: the explicit mapping from the memory model to the Phase 1 turn store.

Definition of done:
- [ ] The raw-transcript layer is implemented as a **read-only view over the S1.2 turn store**.
- [ ] **No separate transcript table, file, or cache is created** (P2-22).
- [ ] The view exposes turns for the future transparency panel without copying content.
- [ ] A test asserts exactly one on-disk copy of transcript content exists (G3).
- [ ] The `memory/transcripts/` directory is either unused or holds only a pointer/manifest — and
      that choice is documented.

**A3 — Encrypted, atomic write path**

Deliverable: the single write path for all memory records.

Definition of done:
- [ ] Every memory write is encrypted before it reaches disk (ties to F1).
- [ ] Writes are atomic; an interrupted write leaves no partial record.
- [ ] A write that fails encryption fails the operation rather than storing plaintext.
- [ ] The write path is shared by fact, summary, and embedding records.

---

### Group 2 — Fact store

**B1 — `Fact` type and schema**

Deliverable: the fact record from Phase 2 §1.4.

Definition of done:
- [ ] Fields: `id`, `characterId`, `content`, `category`, `sourceTurnIds`, `createdAt`,
      `updatedAt`, `confidence`, `lastUsedAt`, `userEdited`, `embeddingRef`.
- [ ] `category` is a union: `preference` | `identity` | `relationship` | `goal` | `event` |
      `other`.
- [ ] `confidence` is a bounded number (0–1) and validated on write.
- [ ] The type compiles under strict mode with no `any`.

**B2 — Fact CRUD**

Deliverable: `listFacts`, `addFact`, `updateFact`, `deleteFact`.

Definition of done:
- [ ] Each operation validates before writing; an invalid fact cannot be persisted.
- [ ] `updateFact` preserves `createdAt` and bumps `updatedAt`.
- [ ] `deleteFact` removes the record **and its embedding** (ties to F3).
- [ ] Listing supports filtering by `characterId` and `category` (test B2-T1).

**B3 — Source traceability**

Deliverable: every fact traces to its origin turns.

Definition of done:
- [ ] `sourceTurnIds` is populated on creation and validated against existing turns.
- [ ] A fact whose source turns have been pruned retains the ids as historical references without
      failing (the prune job is S2.4; the behaviour is defined now).
- [ ] Traceability is queryable for the future transparency panel (S2.5).
- [ ] A fact with no source is permitted only for user-created facts, and marked as such
      (test B3-T1).

**B4 — User-edit protection**

Deliverable: the `userEdited` flag is meaningful.

Definition of done:
- [ ] Editing a fact sets `userEdited: true`.
- [ ] A `userEdited` fact is protected from later automatic overwrite (the overwrite attempt is
      S2.3's; the protection is enforced here) (test B4-T1).
- [ ] The flag is preserved across updates and round-trips through export/import.
- [ ] The flag's semantics are documented.

**B5 — Embedding linkage**

Deliverable: facts can carry an embedding reference.

Definition of done:
- [ ] `embeddingRef` points at an embedding record owned by the fact.
- [ ] Deleting the fact deletes the embedding (ties to F3).
- [ ] An orphaned `embeddingRef` is detected and repaired on load (test B5-T1).
- [ ] A fact without an embedding is valid and is simply not vector-retrievable.

---

### Group 3 — Summary store

**C1 — `RollingSummary` type and schema**

Deliverable: the summary record from Phase 2 §1.3.

Definition of done:
- [ ] Fields: `id`, `conversationId`, `characterId`, `coversFromSeq`, `coversToSeq`, `content`,
      `createdAt`, `tokenCount`, `embeddingRef`.
- [ ] `coversFromSeq` ≤ `coversToSeq` is validated.
- [ ] `tokenCount` is populated using the S1.1 `TokenCounter`.
- [ ] The type compiles under strict mode with no `any`.

**C2 — Summary CRUD**

Deliverable: `listSummaries`, `createSummary`, `deleteSummary`.

Definition of done:
- [ ] Creating a summary validates its `seq` range against existing summaries (C3).
- [ ] `deleteSummary` removes the record and its embedding.
- [ ] Listing supports filtering by `conversationId` and `characterId`.
- [ ] Summaries are ordered by `coversFromSeq` deterministically.

**C3 — `seq` range invariants**

Deliverable: summaries never overlap.

Definition of done:
- [ ] Summaries for a conversation never overlap (test C3-T1).
- [ ] Contiguity gaps are permitted but detectable, so S2.4 can reason about coverage.
- [ ] Attempting to create an overlapping summary is rejected with a structured error.
- [ ] The invariant is enforced on write, not merely documented.

**C4 — Embedding linkage**

Definition of done:
- [ ] `embeddingRef` is owned by the summary and deleted with it.
- [ ] Orphan repair matches the fact-store behaviour (B5).
- [ ] A summary without an embedding is valid and simply not vector-retrievable.

---

### Group 4 — Session buffer

**D1 — In-memory session buffer**

Deliverable: the current session's turns held in memory.

Definition of done:
- [ ] The buffer holds the current session's turns for prompt assembly.
- [ ] It is in-memory only; **it does not persist anything beyond what S1.2 already writes**
      (test D1-T1).
- [ ] It exposes recent turns for the S1.1 assembly seam.
- [ ] Its capacity is bounded, with the oldest turns evicted in memory only.

**D2 — Buffer lifecycle**

Definition of done:
- [ ] Turns are appended as they occur in the session.
- [ ] The buffer is cleared on session end and on conversation switch.
- [ ] Clearing the buffer never deletes persisted turns (test D2-T1).
- [ ] The buffer's contents are never written to disk by this module.

---

### Group 5 — Embedder (ONNX)

**E1 — Bundle the MiniLM-class ONNX model**

Deliverable: the embedding model shipped with the app.

Definition of done:
- [ ] A MiniLM-class sentence-embedder (384-dim) is bundled; no download is required (M4).
- [ ] The model file, tokenizer assets, and license text are included.
- [ ] Model integrity is verified at load (hash manifest); a mismatch is fatal with a clear error.
- [ ] The embedding dimension (384) is asserted at load, not assumed (test E1-T1).

**E2 — Embedder runtime**

Deliverable: CPU-only ONNX inference.

Definition of done:
- [ ] Inference runs CPU-only via the bundled ONNX runtime; no GPU dependency.
- [ ] Inference runs off the main thread (worker) so the UI is never blocked (test E2-T1).
- [ ] Model load is lazy and unloaded when idle, consistent with the governor's eviction model.
- [ ] A failed model load degrades gracefully: facts/summaries are stored without embeddings rather
      than failing the write.

**E3 — Embedding API**

Deliverable: `embed(text)` and `embedBatch(texts)`.

Definition of done:
- [ ] `embed` returns a normalized 384-dim vector.
- [ ] `embedBatch` processes a batch with bounded concurrency.
- [ ] Empty or whitespace input is handled without error.
- [ ] Errors are structured and do not leak model internals.

**E4 — Governor integration**

Definition of done:
- [ ] Embedding is classified as a **light** pipeline, not a heavy one (Phase 2 §3.3).
- [ ] It never requests an `llm` slot (test E4-T1).
- [ ] It yields to active generation and voice under the governor's priority order.
- [ ] Batch size is bounded so a large batch cannot starve the app.

**E5 — Determinism and normalization**

Definition of done:
- [ ] The same text produces the same vector across runs (test E5-T1).
- [ ] Vectors are L2-normalized so cosine similarity is a dot product.
- [ ] Normalization is verified numerically, not assumed from the model.
- [ ] No randomness, clock, or locale affects the output.

**E6 — Footprint and no model-slot contention**

Definition of done:
- [ ] The embedder loads **without evicting the chat model** (P2-23).
- [ ] Its memory footprint is measured and reported to the governor.
- [ ] It does not occupy the single heavy slot on the floor tier (test E6-T1).
- [ ] Footprint measurements are recorded alongside the S0.4/S1.4 budgets.

---

### Group 6 — Encryption & data lifecycle

**F1 — Encryption of every layer**

Definition of done:
- [ ] Facts, summaries, and embeddings are encrypted at rest (P2-17).
- [ ] Encryption uses the S0.1 wrapper (OS-backed), with no custom cryptography.
- [ ] No layer is ever written unencrypted, including transient temp files (test F1-T1).
- [ ] A record cannot be read without the OS user context (P2-17).

**F2 — Embeddings encrypted with their records**

Definition of done:
- [ ] An embedding is encrypted under the same regime as its parent record.
- [ ] Embeddings are not stored in a shared plaintext index (test F2-T1).
- [ ] Any future index must be encrypted and rebuilt from encrypted records.

**F3 — Deletion removes record and embedding**

Definition of done:
- [ ] Deleting a fact or summary deletes its embedding in the same operation.
- [ ] Deletion is atomic; an interrupted delete does not leave an orphaned embedding
      (test F3-T1).
- [ ] A periodic orphan sweep repairs any embedding whose parent is gone.
- [ ] Deletion is verified by inspecting storage, not just the API's return value.

**F4 — No plaintext leakage**

Definition of done:
- [ ] Memory content never appears in logs, traces, or error messages (test F4-T1).
- [ ] Temporary files, if any, are encrypted and removed.
- [ ] The no-writes-outside watcher still passes with all memory stores active.

**F5 — Key handling**

Definition of done:
- [ ] Keys are managed entirely by the OS-backed wrapper; no key material is stored by this module.
- [ ] Keys are never logged, exported, or included in exports of memory content.
- [ ] An export contains content, not credentials.

---

### Group 7 — Verification

**G1 — Test fixtures and doubles**

Deliverable: deterministic, offline tests.

Definition of done:
- [ ] A stub embedder (deterministic hash vectors) is injectable for store tests.
- [ ] Fact and summary fixtures cover every category and boundary case.
- [ ] Tests run offline and deterministically in CI.
- [ ] No test requires the real ONNX model except the embedder's own tests.

**G2 — P2-17: encryption at rest**

Definition of done:
- [ ] P2-17 passes: the store and embeddings are unreadable without the OS user context.
- [ ] The test inspects raw bytes on disk, not the API.
- [ ] It covers facts, summaries, and embeddings.

**G3 — P2-22: no duplicate transcripts**

Definition of done:
- [ ] P2-22 passes: exactly one on-disk copy of transcript content exists.
- [ ] The test enumerates storage and asserts no second copy (A2).
- [ ] It runs after a session that wrote turns, so the assertion is meaningful.

**G4 — P2-23: embedder footprint**

Definition of done:
- [ ] P2-23 passes: the ONNX embedder loads without evicting the chat model.
- [ ] The test asserts the governor's active lease set is unaffected by embedding.
- [ ] Footprint is recorded against the S0.4 memory ceiling.

**G5 — Store CRUD and invariants**

Definition of done:
- [ ] Fact CRUD, source traceability, and user-edit protection are tested.
- [ ] Summary `seq`-range non-overlap is tested, including the rejection path.
- [ ] Orphan repair for embeddings is tested.
- [ ] Session buffer clearing is tested not to delete persisted turns.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1-B1/B3 | A3, B1, C1 |
| A2 | S1.2-A2 (turn store) | G3 |
| A3 | A1, F1 | B2, C2 |
| B1 | A1 | B2–B5 |
| B2 | A3, B1 | G5 |
| B3 | B2, S1.2-A2 | S2.5 |
| B4 | B2 | S2.3 |
| B5 | B2, E3 | F3, G5 |
| C1 | A1 | C2 |
| C2 | A3, C1, C3 | G5 |
| C3 | C1 | C2 |
| C4 | C2, E3 | F3 |
| D1 | S1.2-A1 | S1.1-D1 (assembly seam) |
| D2 | D1 | — |
| E1 | S0.1-B1 | E2 |
| E2 | E1, S0.2-C3 | E3, E4 |
| E3 | E2 | B5, C4, G4 |
| E4 | E2, S0.2-A1 | E6, G4 |
| E5 | E3 | — |
| E6 | E4 | G4 |
| F1 | S0.1-B2, A3 | F2–F5 |
| F2 | F1 | G2 |
| F3 | F1, B5, C4 | G5 |
| F4 | F1 | — |
| F5 | F1 | — |
| G1 | B1, C1, E3 | G2–G5 |
| G2 | G1, F1–F2 | — |
| G3 | G1, A2 | — |
| G4 | G1, E4, E6 | — |
| G5 | G1, B2–B5, C2–C4, D2 | — |

Parallel opportunities: Groups 2 and 3 (fact and summary stores) can proceed concurrently once A3
lands. Group 5 (embedder) is independent of Groups 2–4 and can run in parallel.

---

## 4. Slice-level Definition of Done

S2.1 is complete when **all** of the following hold:

- [ ] Fact, summary, and session-buffer layers exist and are persisted (buffer in memory only).
- [ ] The raw-transcript layer is a read-only view over the S1.2 turn store, and **no second copy
      exists** (P2-22).
- [ ] Every layer is encrypted at rest, including embeddings (P2-17).
- [ ] Deleting a fact or summary deletes its embedding atomically (F3).
- [ ] Embedding vectors are deterministic, normalized, and 384-dim (E5).
- [ ] The embedder runs CPU-only, off the main thread, as a light pipeline, and loads without
      evicting the chat model (P2-23).
- [ ] Fact records carry source traceability and honour user-edit protection (B3, B4).
- [ ] Summary `seq` ranges are enforced non-overlapping on write (C3).
- [ ] No memory content appears in logs, traces, or errors (F4).
- [ ] All tests run offline and deterministically, with a stub embedder where appropriate.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| A second transcript copy is introduced "for convenience" | Doubles the most sensitive data; two deletion paths can disagree | A2 declares the mapping; P2-22 asserts one copy (G3) |
| Embeddings stored in a plaintext shared index | Sensitive data readable without the OS context | Encrypt embeddings with records; no plaintext index (F2) |
| Orphaned embeddings after a delete | Privacy residue | Atomic delete plus periodic orphan sweep (F3) |
| ONNX runtime blocks the main thread | UI stalls during embedding | Run in a worker with bounded concurrency (E2) |
| Embedder load evicts the chat model | Model thrash on every retrieval | Light-pipeline classification; P2-23 test (E4, E6) |
| Model file corrupted or wrong dimension | Silent garbage vectors | Hash verification and dimension assertion at load (E1) |
| Fact extraction overwrites user edits | User loses control of their own data | `userEdited` protection enforced at the store (B4) |
| Summary ranges overlap | Retrieval double-counts or corrupts coverage | Invariant enforced on write (C3) |
| Encryption failure falls back to plaintext | Catastrophic privacy failure | Fail the write instead (A3, F1) |

---

## 6. Traceability

| Phase 2 reference / test | Covered by |
|---|---|
| §1.1 Session buffer | D1, D2 |
| §1.2 Raw transcripts = turn store | A2, G3 |
| §1.3 Rolling summaries | C1, C2, C3 |
| §1.4 Facts | B1–B5 |
| §3.3 Embeddings (MiniLM ONNX, 384-dim) | E1–E3 |
| §3.3 Light-pipeline classification | E4, E6 |
| §3.3 Embeddings encrypted and deleted with record | F2, F3 |
| P2-17 Encryption at rest | F1, G2 |
| P2-22 No duplicate transcripts | A2, G3 |
| P2-23 Embedder footprint | E6, G4 |

S2.1 output (stores, embedder, encryption) is consumed by S2.2 (retrieval and assembly injection),
S2.3 (fact extraction writes facts), S2.4 (pruning writes summaries and deletes turns), and S2.5
(transparency panel reads all layers).
