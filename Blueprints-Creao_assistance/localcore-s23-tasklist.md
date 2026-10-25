# LocalCore — S2.3 Implementation Task List

Slice: **S2.3 — Async fact extraction pipeline**
Source: Phase 2 §3.1 (extraction, M3) and §1.4 (fact schema);
S1.2 (turn completion events); S1.3 (local provider); S2.1 (fact store, embedder); S0.2 (governor).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The post-response extraction trigger, fired after a turn completes.
- A durable extraction queue that survives restart.
- A constrained extraction prompt and structured output contract.
- Strict validation of extracted candidates before storage.
- Deduplication, merge, and supersede semantics.
- `userEdited` protection.
- Confidence thresholds and category classification guardrails.
- Governor deferral so extraction never competes with a live generation on the floor tier.
- Structured extraction events for the future write log.

**Explicit non-goals (do not build here):**
- No retrieval or ranking (S2.2).
- No summarization or pruning (S2.4).
- No transparency UI, indicator, or write-log surface (S2.5) — this slice emits events; S2.5
  persists and displays them.
- No changes to the fact schema (S2.1).
- No cloud extraction.

Rationale: S2.3 is where the companion starts to *learn* about the user. It is the most
failure-prone model interaction in the product, because a small model is a weak extractor — so the
slice is built around rejecting bad output rather than trusting good output.

---

## 1. Ordering principles

1. **Queue before trigger** — a trigger without a durable queue loses work on restart.
2. **Prompt before parsing** — the output contract is defined by the prompt.
3. **Validation before storage** — nothing reaches the fact store unvalidated.
4. **Dedup before commit** — duplicate detection must precede the write.
5. **userEdited protection before any auto-update path** — the protection must exist before
   extraction can overwrite anything.
6. **Deferral before enabling the pipeline** — on the floor tier, extraction must yield before it
   is allowed to run.
7. **Reject by default.** A malformed or low-confidence candidate is dropped, not stored.

---

## 2. Task list

### Group 1 — Trigger & queue

**A1 — Post-response trigger**

Deliverable: extraction fires after a response is delivered.

Definition of done:
- [ ] Extraction is triggered by the S1.2 `turnCompleted` event, **after** the response is
      delivered (M3).
- [ ] It never blocks the turn: the user's response is complete before extraction begins
      (test A1-T1).
- [ ] A cancelled or errored turn does not trigger extraction of a non-existent assistant turn.
- [ ] The trigger enqueues work; it does not perform extraction inline.

**A2 — Durable extraction queue**

Deliverable: queued work survives restart.

Definition of done:
- [ ] The queue is persisted in app-data and encrypted.
- [ ] Pending items survive an app restart and are processed afterwards (test A2-T1).
- [ ] The queue stores only references (turn ids, conversation id), not duplicated turn content.
- [ ] Queue writes use the S0.1 atomic write path.

**A3 — Queue item lifecycle**

Definition of done:
- [ ] States: `pending` → `processing` → `done` | `failed`.
- [ ] An item interrupted mid-processing is returned to `pending` on restart (not lost, not
      duplicated).
- [ ] `done` items are pruned after a bounded retention.
- [ ] `failed` items retain the reason for diagnostics.

**A4 — Idempotency**

Definition of done:
- [ ] A turn is extracted at most once (test A4-T1).
- [ ] Re-processing an already-extracted turn is a no-op.
- [ ] The idempotency key is the turn id, not a hash of content.
- [ ] A turn deleted before processing is skipped without error.

---

### Group 2 — Extraction prompt & invocation

**B1 — Extraction prompt template**

Deliverable: a constrained prompt that requests structured output.

Definition of done:
- [ ] The prompt asks for a strict JSON structure: candidate facts with `content`, `category`, and
      `confidence`.
- [ ] The prompt enumerates the allowed categories (`preference`, `identity`, `relationship`,
      `goal`, `event`, `other`).
- [ ] The prompt instructs the model to return an empty list when nothing is worth remembering.
- [ ] The prompt is versioned so changes can be correlated with output quality.

**B2 — Model invocation**

Definition of done:
- [ ] Extraction uses the S1.3 local provider (or another registered provider), never a side
      channel.
- [ ] Extraction requests a **small, bounded** output (few candidates), not an open-ended
      generation.
- [ ] The invocation records the model id used, for traceability of extracted facts.
- [ ] A provider failure fails the queue item, not the app.

**B3 — Cost bounding**

Definition of done:
- [ ] Each extraction has a token and time budget (test B3-T1).
- [ ] Exceeding the budget aborts the extraction and marks the item failed with a reason.
- [ ] The budget is documented and enforced, not advisory.
- [ ] Repeated budget failures back off rather than retrying tightly.

**B4 — Batching policy**

Definition of done:
- [ ] The policy for extracting one turn versus a small batch is defined and documented.
- [ ] Batching never delays extraction indefinitely.
- [ ] Batch size is bounded so a single extraction cannot monopolize the model.
- [ ] Batching is deterministic: the same queue state produces the same batch.

---

### Group 3 — Parsing & validation

**C1 — Structured output parsing**

Definition of done:
- [ ] The model's response is parsed as JSON against the declared schema.
- [ ] Non-JSON or partially valid output is rejected, not best-effort salvaged
      (test C1-T1).
- [ ] Parsing strips model chatter around the JSON only if a documented, strict extraction rule
      applies.
- [ ] A parse failure is recorded with the raw output (redacted as needed) for diagnostics.

**C2 — Strict validation**

Deliverable: the validator that decides what may be stored.

Definition of done:
- [ ] Each candidate is validated for: non-empty `content`, valid `category`, numeric
      `confidence` in range.
- [ ] Invalid candidates are rejected individually; one bad candidate does not discard a valid
      batch (test C2-T1).
- [ ] Validation is stricter than the model's output contract, on the assumption the model will
      drift.
- [ ] Validation results are recorded per candidate.

**C3 — No partial storage**

Definition of done:
- [ ] A candidate is either stored completely or not at all.
- [ ] A failure mid-batch leaves the already-stored candidates intact and the rest pending or
      rejected — never half-written.
- [ ] Storage uses the S2.1 atomic write path.
- [ ] The queue item's final state reflects what was actually stored.

**C4 — Field bounds**

Definition of done:
- [ ] `content` length is bounded; over-long candidates are truncated or rejected per a documented
      rule.
- [ ] `category` must be one of the enum values.
- [ ] `confidence` must be within 0–1.
- [ ] Bounds are enforced at validation, not only at the store.

---

### Group 4 — Deduplication & conflict

**D1 — Near-duplicate detection**

Definition of done:
- [ ] Candidates are embedded (S2.1) and compared against existing facts for the same character.
- [ ] A similarity threshold identifies near-duplicates; the threshold is configurable and
      documented.
- [ ] Detection runs before any write (test D1-T1).
- [ ] Detection is scoped to the active `characterId`.

**D2 — Merge and supersede semantics**

Definition of done:
- [ ] A near-duplicate either updates the existing fact (with bumped `updatedAt`) or is dropped,
      per a documented rule.
- [ ] Superseding does not lose the original's `sourceTurnIds`; the new source is appended
      (test D2-T1).
- [ ] The rule distinguishes "more specific" from "contradictory" where possible.
- [ ] Every merge or supersede emits an event for the write log.

**D3 — `userEdited` protection**

Deliverable: the guarantee behind P2-19.

Definition of done:
- [ ] A `userEdited` fact is **never silently overwritten** by extraction (P2-19).
- [ ] A contradicting candidate either creates a new fact or is surfaced as a conflict, per a
      documented rule.
- [ ] The protection is enforced at the store level too (S2.1 B4), not only in this pipeline.
- [ ] The behaviour is tested for both "same content" and "contradictory content" cases.

**D4 — Conflict surfacing**

Definition of done:
- [ ] A conflict between an extracted candidate and a `userEdited` fact produces a structured
      event.
- [ ] Conflicts are visible to the future transparency panel (S2.5).
- [ ] Resolution is user-driven where the rule cannot decide automatically.
- [ ] An unresolved conflict never blocks the queue.

---

### Group 5 — Confidence & thresholds

**E1 — Confidence threshold**

Definition of done:
- [ ] Candidates below the threshold are not stored (test E1-T1).
- [ ] The threshold is configurable and its default is documented.
- [ ] Threshold rejection is recorded with the candidate and its score.
- [ ] Lowering the threshold cannot bypass validation (C2).

**E2 — Category guardrails**

Definition of done:
- [ ] Category misclassification is bounded by a documented heuristic (e.g. an `identity` fact
      must contain a name-like token).
- [ ] A candidate failing the heuristic is reclassified or rejected, per a documented rule.
- [ ] Guardrails are conservative: a rejected fact is preferable to a misfiled one.
- [ ] Guardrail decisions are recorded.

**E3 — Low-confidence handling**

Definition of done:
- [ ] Low-confidence candidates are dropped by default, not stored with a low score.
- [ ] The alternative (queueing for user review) is documented as a future option, not implemented
      here unless it is cheap.
- [ ] Dropped candidates are counted so the pipeline's yield is measurable.
- [ ] A run of zero-yield extractions is observable, not silent.

---

### Group 6 — Governor deferral & durability

**F1 — Deferral while generation or voice is active**

Deliverable: the guarantee behind P2-21.

Definition of done:
- [ ] Extraction never runs concurrently with a live generation on the floor tier (P2-21).
- [ ] Extraction acquires an `llm` lease at the **lowest priority** and yields to generation and
      voice (S0.2 priority order).
- [ ] If the lease cannot be obtained within a bound, the item is requeued rather than forced
      (test F1-T1).
- [ ] The deferral is observable in the governor trace.

**F2 — Idle-maintenance scheduling**

Definition of done:
- [ ] Extraction is scheduled as idle maintenance, below chat, voice, and embedding.
- [ ] It runs opportunistically after a turn rather than on a fixed timer only.
- [ ] It does not prevent the model from being evicted when idle.
- [ ] It respects the tier profile's concurrency limits.

**F3 — Retry with backoff**

Definition of done:
- [ ] A failed item is retried with bounded exponential backoff.
- [ ] Retries are capped; after the cap the item is marked `failed` with a reason.
- [ ] A retry storm is impossible (bounded attempts, backoff, jitter).
- [ ] Repeated failures for the same model are surfaced rather than looping.

**F4 — Bounded queue growth**

Definition of done:
- [ ] The queue has a maximum size; exceeding it pauses extraction rather than growing unbounded
      (test F4-T1).
- [ ] When paused, the queue resumes when space frees up.
- [ ] The overflow policy (pause vs drop-oldest) is documented and does not silently discard
      recent turns.
- [ ] Queue depth is observable.

---

### Group 7 — Verification

**G1 — Fixtures and doubles**

Definition of done:
- [ ] A stub extractor returns scripted candidates (valid, invalid, duplicate, low-confidence).
- [ ] Fixtures include a `userEdited` fact and a contradictory candidate.
- [ ] Tests run offline and deterministically.
- [ ] The governor's clock and memory are injectable (S0.2 G1).

**G2 — P2-19: user-edited fact not overwritten**

Definition of done:
- [ ] P2-19 passes: a `userEdited` fact is never silently overwritten.
- [ ] The test covers identical and contradictory candidates.
- [ ] It asserts a conflict event is emitted rather than a silent change.

**G3 — P2-21: governor deferral**

Definition of done:
- [ ] P2-21 passes: extraction never runs concurrently with live generation on the floor.
- [ ] The governor trace is asserted, not just the outcome.
- [ ] A forced-contention test confirms extraction waits rather than preempting.

**G4 — Validation and rejection**

Definition of done:
- [ ] Malformed JSON is rejected without storage.
- [ ] A batch with one invalid candidate stores the valid ones and rejects the invalid one.
- [ ] Over-long content and out-of-range confidence are handled per C4.
- [ ] Field-boundary tests exist for each validation rule.

**G5 — Dedup, merge, supersede**

Definition of done:
- [ ] Near-duplicates are detected before write.
- [ ] Merge appends sources and preserves `updatedAt` semantics.
- [ ] Supersede does not lose original sources.
- [ ] Every merge/supersede emits a write-log event.

**G6 — Durability and restart**

Definition of done:
- [ ] Pending items survive restart and are processed afterwards.
- [ ] An item interrupted mid-processing is requeued exactly once.
- [ ] Idempotency holds: a turn is extracted at most once across restarts.
- [ ] A turn deleted before processing is skipped cleanly.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S1.2-C4 (turnCompleted) | A2 |
| A2 | S0.1-A3, S0.1-F1 | A3, A4 |
| A3 | A2 | G6 |
| A4 | A2, S1.2-A2 | G6 |
| B1 | — | B2, C1 |
| B2 | B1, S1.3-A1 | B3, B4 |
| B3 | B2 | G4 |
| B4 | B2, A2 | F4 |
| C1 | B1 | C2, G4 |
| C2 | C1 | C3, C4, E1 |
| C3 | C2, S2.1-A3 | G4 |
| C4 | C2 | G4 |
| D1 | C2, S2.1-E3 | D2, G5 |
| D2 | D1, S2.1-B2 | D3, G5 |
| D3 | D2, S2.1-B4 | D4, G2 |
| D4 | D3 | S2.5 |
| E1 | C2 | E3, G4 |
| E2 | C2 | G4 |
| E3 | E1 | — |
| F1 | A2, S0.2-A1, B2 | F2, G3 |
| F2 | F1, S0.2-A2 | G3 |
| F3 | A3 | — |
| F4 | A2, B4 | G6 |
| G1 | A2, B2, D1 | G2–G6 |
| G2 | G1, D3 | — |
| G3 | G1, F1, F2 | — |
| G4 | G1, C1–C4, E1, E2 | — |
| G5 | G1, D1, D2 | — |
| G6 | G1, A2–A4, F4 | — |

Parallel opportunities: Group 3 (parsing/validation) and Group 4 (dedup) can proceed concurrently
once B1's output contract is fixed. Group 5 (confidence) can begin alongside validation.

---

## 4. Slice-level Definition of Done

S2.3 is complete when **all** of the following hold:

- [ ] Extraction triggers after a response is delivered and never blocks the turn (A1).
- [ ] The queue is durable; pending items survive restart and are processed afterwards (A2, G6).
- [ ] A turn is extracted at most once, across restarts (A4, G6).
- [ ] Model output is parsed strictly; malformed output is rejected, never partially stored
      (C1, C3).
- [ ] Candidates are validated individually; a bad candidate does not discard a valid batch (C2).
- [ ] Near-duplicates are detected before write, with documented merge/supersede semantics (D1,
      D2).
- [ ] A `userEdited` fact is never silently overwritten (P2-19, G2).
- [ ] Candidates below the confidence threshold are dropped, and the drop is recorded (E1).
- [ ] Extraction never runs concurrently with live generation on the floor (P2-21, G3).
- [ ] The queue is bounded and pauses rather than growing without limit (F4).
- [ ] Every create, merge, supersede, and conflict emits an event for the write log (S2.5).
- [ ] All tests run offline and deterministically with a stub extractor.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Small model emits malformed JSON | Garbage stored or pipeline stalls | Strict parse and validation; reject, do not salvage (C1, C2) |
| Extraction competes with generation on floor | Slower chat, model thrash | Lowest-priority lease; deferral asserted in the trace (F1, G3) |
| Duplicates accumulate | Memory bloat, noisy retrieval | Embedding-based dedup before write (D1) |
| Extraction overwrites a user edit | User loses control of their data | Store-level and pipeline-level protection (D3, G2) |
| Low-quality facts stored | Retrieval quality degrades | Confidence threshold and category guardrails (E1, E2) |
| Queue grows unbounded after failures | Storage leak, latency | Bounded queue with pause policy (F4) |
| Retry storm on a persistent failure | CPU burn, battery drain | Bounded attempts with backoff and jitter (F3) |
| Idempotency keyed on content hash | Re-extraction after an edit | Key on turn id (A4) |
| Extraction prevents model eviction | Idle memory never reclaimed | Runs opportunistically; does not hold a lease while idle (F2) |

---

## 6. Traceability

| Phase 2 reference / test | Covered by |
|---|---|
| §3.1 Extraction after each response, async (M3) | A1 |
| §3.1 Constrained extraction, structured schema | B1, C1 |
| §3.1 Strict validator, confidence threshold | C2, E1 |
| §3.1 Deduplication, merge or supersede | D1, D2 |
| §3.1 `userEdited` protected from auto-overwrite | D3 |
| §3.1 Deferred by the governor; durable queue | F1, A2 |
| §1.4 Fact schema fields | C4, D2 |
| P2-19 User-edited fact not overwritten | D3, G2 |
| P2-21 Governor deferral | F1, G3 |

S2.3 output (facts, merge/supersede/conflict events) is consumed by S2.2 (retrieval), S2.4
(summarization reads fact history), and S2.5 (write log and conflict surfacing).
