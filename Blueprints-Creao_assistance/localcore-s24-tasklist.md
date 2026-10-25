# LocalCore — S2.4 Implementation Task List

Slice: **S2.4 — Retention/pruning and summaries (GATE-3)**
Source: Phase 2 §2 (policy, job, algorithm, safety invariants) and §3.2 (summarization);
S2.1 (summary store, turn-store view); S1.2 (turn store); S1.3 (provider); S0.2 (governor).
Build Order §7 (GATE-3).
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

S2.4 is the first **destructive** slice in the product. It deletes user conversation content, and
its safety property — summarize before prune, always — is GATE-3.

**In scope:**
- The retention policy (30-day default, user-adjustable) and pinning.
- Cutoff computation and candidate selection.
- The summarization pipeline producing non-overlapping `seq`-range summaries.
- Verification-before-prune ordering and skip-on-failure behaviour.
- Raw-turn deletion, tombstones, and conversation coherence after pruning.
- Scheduling, idempotency, resumability, and governor deferral.
- `PruneReport` and the audit trail of summarize/prune actions.
- The GATE-3 decision record.

**Explicit non-goals (do not build here):**
- No retrieval of summaries (S2.2 already reads them).
- No transparency UI, indicator, or write-log surface (S2.5) — this slice emits events.
- No changes to the fact or summary schemas (S2.1).
- No permanent deletion of quarantined files (that is Phase 5's quarantine, a different concern).
- No "forget" / wipe-all (S2.5).

Rationale: pruning is the one operation that can destroy user data. It is separated from the
retention *policy* UI so the destructive mechanism can be verified in isolation, with the
summarize-before-prune guarantee proven before anything is allowed to delete.

---

## 1. Ordering principles

1. **Policy before cutoff** — the cutoff derives from the policy.
2. **Selection before summarization** — there must be candidates.
3. **Summarization before verification** — there must be a summary to verify.
4. **Verification before deletion** — the safety ordering, and it is not negotiable.
5. **Deletion before tombstones** — a tombstone describes what was removed.
6. **Idempotency before scheduling** — a job that cannot be safely re-run must not run on a timer.
7. **GATE-3 before enabling the schedule.** The job may be built and run manually, but the
   periodic schedule is enabled only after the safety property is proven.

---

## 2. Task list

### Group 1 — Policy & configuration

**A1 — Retention policy model**

Deliverable: the policy from Phase 2 §2.1.

Definition of done:
- [ ] Raw transcripts default to **30 days**, user-adjustable (M1).
- [ ] Session buffer is session-scoped and never subject to the retention job.
- [ ] Summaries and facts are retained until deleted (not subject to the window).
- [ ] The policy is expressed as data with a single source of truth.

**A2 — Retention configuration**

Definition of done:
- [ ] `setRetention(days)` / `getRetention()` persist the window in config.
- [ ] A shortened window takes effect on the next run without a restart.
- [ ] An invalid value (≤ 0, non-numeric) is rejected with a structured error.
- [ ] The current retention window is available to the transparency panel (S2.5).

**A3 — Pinning state**

Definition of done:
- [ ] `setPinned(conversationId, pinned)` / `isPinned` / `listPinned` are implemented (M2).
- [ ] Pin state persists across restart.
- [ ] Pinning is itself an auditable action (emits an event for the write log).
- [ ] Pinning does not alter the retention window for other conversations.

---

### Group 2 — Cutoff & candidate selection

**B1 — Cutoff computation**

Definition of done:
- [ ] The cutoff is computed from the retention window and the current time.
- [ ] The clock is injectable so aging can be tested without waiting (test B1-T1).
- [ ] Cutoff computation is pure and deterministic.
- [ ] Boundary behaviour (exactly at the cutoff) is defined and tested.

**B2 — Candidate selection**

Definition of done:
- [ ] Candidates are turns **older than the cutoff** that have not yet been summarized.
- [ ] Selection reads the S1.2 turn store directly (the transcript layer; no copy) (test B2-T1).
- [ ] Already-summarized turns are excluded via the S2.1 summary `seq` ranges.
- [ ] Selection is ordered by `seq` so summarization is contiguous.

**B3 — Exclusions**

Definition of done:
- [ ] The **active session is never selected** (P2-11).
- [ ] **Pinned conversations are never selected** (P2-12).
- [ ] A conversation that becomes unpinned becomes eligible on the next run (P2-13).
- [ ] Exclusions are counted in the report (`conversationsSkippedPinned`).

**B4 — Batch sizing**

Definition of done:
- [ ] Candidates are grouped into batches bounded by token size, not just turn count.
- [ ] A single oversized turn is handled (summarized alone) rather than skipped forever
      (test B4-T1).
- [ ] Batch boundaries are deterministic for a given store state.
- [ ] Batch sizing respects the summarization model's context budget.

---

### Group 3 — Summarization pipeline

**C1 — Summarization prompt and invocation**

Definition of done:
- [ ] The prompt condenses a contiguous `seq` range into a summary that preserves user-relevant
      content (preferences, decisions, events).
- [ ] Invocation uses the S1.3 local provider (or another registered provider), never a side
      channel.
- [ ] The invocation is bounded in tokens and time.
- [ ] The prompt is versioned so summary quality can be correlated with changes.

**C2 — Incremental summary creation**

Definition of done:
- [ ] Each summary covers a contiguous `seq` range: `coversFromSeq` to `coversToSeq`.
- [ ] Summaries never overlap (S2.1 C3 enforced on write).
- [ ] A summary's range exactly matches the turns it condensed (test C2-T1).
- [ ] `characterId` and `conversationId` are populated correctly.

**C3 — Non-overlap enforcement**

Definition of done:
- [ ] Creating an overlapping summary is rejected by the store.
- [ ] The pipeline detects an existing summary covering a candidate range and does not duplicate it
      (test C3-T1).
- [ ] Gaps between summaries are detectable for coverage reporting.
- [ ] Overlap rejection does not fail the whole run.

**C4 — `tokenCount` population**

Definition of done:
- [ ] `tokenCount` is populated using the S1.1 `TokenCounter`.
- [ ] The count reflects the stored summary text.
- [ ] A missing counter falls back to the conservative estimator.
- [ ] `tokenCount` is used by S2.2's budget selection.

**C5 — Summary quality guardrails**

Definition of done:
- [ ] An empty or degenerate summary (e.g. whitespace, a refusal) is rejected, not stored
      (test C5-T1).
- [ ] A summary shorter than a documented minimum is rejected as low-value.
- [ ] Rejection is recorded and the batch is not pruned (ties to D3).
- [ ] Repeated rejections for a batch are surfaced rather than looped.

---

### Group 4 — Verification before prune

**D1 — Summary persistence verification**

Deliverable: the check that must pass before any deletion.

Definition of done:
- [ ] After summarization, the summary is read back from the store and confirmed present
      (test D1-T1).
- [ ] Verification confirms the `seq` range matches the batch being pruned.
- [ ] Verification confirms the summary is readable through the normal store path, not a cache.
- [ ] Verification failure aborts the prune for that batch.

**D2 — Validity check**

Definition of done:
- [ ] The summary must be non-empty and pass C5's guardrails.
- [ ] `tokenCount` must be populated.
- [ ] A summary that fails validity is treated as absent (the turns are kept).
- [ ] Validity is checked on the verified read, not the in-memory object.

**D3 — Skip on failure**

Deliverable: the safety behaviour behind P2-8.

Definition of done:
- [ ] If summarization or verification fails, the batch is **skipped and not pruned** (P2-8).
- [ ] The failure is recorded in the report with the reason.
- [ ] The batch is retried on the next run (ties to F4).
- [ ] No partial deletion occurs for a failed batch (test D3-T1).

**D4 — Ordering enforcement**

Definition of done:
- [ ] The code path enforces summarize → verify → delete with no alternative ordering
      (test D4-T1).
- [ ] A test deliberately breaks summarization and asserts no deletion occurred.
- [ ] There is no "delete then summarize" path, not even behind a flag.
- [ ] The ordering is documented at the call site, not only in the spec.

---

### Group 5 — Pruning execution & tombstones

**E1 — Raw-turn deletion**

Definition of done:
- [ ] Deletion removes the raw turn content from the S1.2 turn store (the transcript layer).
- [ ] No second copy of the content exists to delete (ties to S2.1 A2).
- [ ] Deletion is scoped exactly to the verified batch's `seq` range.
- [ ] A turn outside the range is never touched (test E1-T1).

**E2 — Tombstones**

Deliverable: the coherence primitive from Phase 2 §2.4.

Definition of done:
- [ ] A minimal tombstone is written recording the conversation, the `seq` range, and the summary
      link (P2-9).
- [ ] The tombstone contains no turn content.
- [ ] The tombstone is written atomically with the deletion (test E2-T1).
- [ ] A tombstone without a corresponding summary is rejected as invalid.

**E3 — Conversation coherence after pruning**

Definition of done:
- [ ] A pruned conversation remains usable and ordered by `seq` (P2-9).
- [ ] The UI can render "earlier conversation summarized" from the tombstone (P2-9).
- [ ] A new turn appends after pruning with the next `seq`; no gap or duplicate.
- [ ] Retrieval (S2.2) still returns the summary for the pruned range.

**E4 — Bytes reclaimed reporting**

Definition of done:
- [ ] `bytesReclaimed` is measured from actual storage before and after.
- [ ] The measurement covers turn content only, not summaries.
- [ ] The value is reported per run and in total.
- [ ] A run that reclaims nothing is distinguishable from a run that failed.

**E5 — Atomicity**

Definition of done:
- [ ] Deletion and tombstone creation are a single logical operation.
- [ ] An interruption between them is recoverable: re-running completes the pair
      (test E5-T1).
- [ ] No state exists where turns are gone but no tombstone records why.
- [ ] Recovery is idempotent.

---

### Group 6 — Scheduling, idempotency & pinning

**F1 — `PruningJob.run()`**

Definition of done:
- [ ] `run({ dryRun })` is implemented and returns a `PruneReport`.
- [ ] `dryRun` computes the full plan and reports what *would* be pruned without deleting anything
      (test F1-T1).
- [ ] A dry run is safe to call at any time, including during an active generation.
- [ ] The report shape matches Phase 2 §2.2.

**F2 — Schedule**

Definition of done:
- [ ] The job runs on app start and periodically (default every 6 hours).
- [ ] The interval is configurable.
- [ ] Scheduling is enabled only after GATE-3 passes (see §1, ordering principle 7).
- [ ] A missed run (app closed) is not "caught up" in a way that bursts deletions.

**F3 — Cancel**

Definition of done:
- [ ] `cancel()` stops the job at a batch boundary, never mid-deletion (test F3-T1).
- [ ] Cancellation leaves a consistent state and a partial report.
- [ ] A cancelled run is resumable on the next schedule.
- [ ] Cancellation is honoured promptly (within one batch).

**F4 — Idempotency and resumability**

Deliverable: the guarantee behind P2-10.

Definition of done:
- [ ] Re-running after an interruption re-processes only unsummarized, unpruned turns (P2-10).
- [ ] A run interrupted after summarization but before deletion completes the deletion
      (test F4-T1).
- [ ] A run interrupted after deletion but before the tombstone completes the tombstone.
- [ ] Repeated runs on a fully pruned store do nothing and report zero work.

**F5 — Governor deferral**

Definition of done:
- [ ] Pruning runs as idle maintenance at the lowest priority (Phase 2 §2.5).
- [ ] It never runs during an active generation or voice interaction (test F5-T1).
- [ ] It does not hold an `llm` lease while idle.
- [ ] It yields immediately when a user interaction begins.

**F6 — Pinning enforcement**

Definition of done:
- [ ] Pinned conversations are skipped and counted (P2-12).
- [ ] Unpinning makes a conversation eligible on the next run (P2-13).
- [ ] Pinning during a run does not cause a partially pruned conversation (test F6-T1).
- [ ] Pin state is re-checked per batch, not only at run start.

**F7 — `PruneReport` and audit trail**

Definition of done:
- [ ] The report includes: `startedAt`, `finishedAt`, `conversationsProcessed`,
      `conversationsSkippedPinned`, `turnsSummarized`, `turnsPruned`, `bytesReclaimed`, `skipped`,
      `errors`.
- [ ] Every summarize and prune emits an event for the write log (S2.5) (test F7-T1).
- [ ] The report is persisted for the transparency panel.
- [ ] A dry run produces a report without side effects.

---

### Group 7 — Verification

**G1 — Fixtures and doubles**

Definition of done:
- [ ] An aged corpus can be generated with a controlled clock (turns at known ages).
- [ ] A stub summarizer returns valid, empty, and failing summaries on demand.
- [ ] A pinned conversation and an active session are present in fixtures.
- [ ] Tests run offline and deterministically.

**G2 — P2-7: retention aging**

Definition of done:
- [ ] P2-7 passes: turns past 30 days are summarized then pruned.
- [ ] The test asserts the summary exists and the raw turns are gone.
- [ ] Turns inside the window are untouched.

**G3 — P2-8: summarize before prune**

Definition of done:
- [ ] P2-8 passes: when summarization fails, raw turns are **kept**.
- [ ] The test forces summarizer failure and asserts zero deletions for that batch.
- [ ] The failed batch is reported and retried on the next run.

**G4 — P2-9: tombstones**

Definition of done:
- [ ] P2-9 passes: pruned ranges remain coherent via the summary link.
- [ ] The conversation remains usable and ordered after pruning.
- [ ] A new turn appends correctly.

**G5 — P2-10: idempotent pruning**

Definition of done:
- [ ] P2-10 passes: re-running after interruption processes only remaining turns.
- [ ] Interruptions at each stage (after summarize, after delete, before tombstone) are covered.
- [ ] A second full run reports zero work.

**G6 — P2-11: active session**

Definition of done:
- [ ] P2-11 passes: the active session is never pruned.
- [ ] The test runs a prune while a session is active.
- [ ] The session's turns remain intact and ordered.

**G7 — P2-12 / P2-13: pinning**

Definition of done:
- [ ] P2-12 passes: a pinned conversation is exempt and reported as skipped.
- [ ] P2-13 passes: unpinning makes it eligible on the next run.
- [ ] Pinning mid-run does not cause a partial prune.

**G8 — GATE-3 decision record**

Definition of done:
- [ ] The record states whether summarize-before-prune held under forced failure.
- [ ] It names the tests that prove it (P2-8, D3, D4).
- [ ] It confirms the schedule is enabled only after the property is proven.
- [ ] It is checked in and referenced by S2.5 and by the release checklist.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1-A3 | A2, B1 |
| A2 | A1 | G2 |
| A3 | S0.1-A3 | B3, F6 |
| B1 | A1, S0.2 (clock injection) | B2, G1 |
| B2 | B1, S1.2-A2, S2.1-C1 | B4, C2 |
| B3 | B2, A3, S1.2 | G6, G7 |
| B4 | B2 | C1 |
| C1 | B4, S1.3-A1 | C2 |
| C2 | C1, S2.1-C2 | C3, D1 |
| C3 | C2, S2.1-C3 | F4 |
| C4 | C2, S1.1-F1 | — |
| C5 | C2 | D2, G3 |
| D1 | C2, S2.1-C2 | D2, D4 |
| D2 | D1, C5 | D3 |
| D3 | D2 | G3 |
| D4 | D3 | G8 |
| E1 | D4, S1.2-A2 | E2, G2 |
| E2 | E1, S2.1-C2 | E3, G4 |
| E3 | E2 | G4 |
| E4 | E1 | F7 |
| E5 | E1, E2 | F4, G5 |
| F1 | D4, E5 | F2, G8 |
| F2 | F1, G8 | — |
| F3 | F1 | G5 |
| F4 | F1, C3, E5 | G5 |
| F5 | F1, S0.2-A1 | G3 |
| F6 | F1, A3 | G7 |
| F7 | F1, E4 | S2.5 |
| G1 | B1, C1 | G2–G8 |
| G2 | G1, E1 | — |
| G3 | G1, D3, F5 | G8 |
| G4 | G1, E2, E3 | — |
| G5 | G1, F3, F4, E5 | — |
| G6 | G1, B3 | — |
| G7 | G1, F6, A3 | — |
| G8 | G3, D4, F1 | F2 |

Parallel opportunities: Group 3 (summarization) and Group 4 (verification) are tightly coupled and
should be built together. Groups 1–2 can be completed first and verified with `dryRun` alone.

---

## 4. Slice-level Definition of Done

S2.4 is complete when **all** of the following hold:

- [ ] Turns past the retention window are summarized, then pruned (P2-7).
- [ ] When summarization fails, raw turns are **kept** — no deletion without a verified summary
      (P2-8).
- [ ] The ordering summarize → verify → delete is enforced in code with no alternative path (D4).
- [ ] Pruned ranges remain coherent via tombstones linking to their summaries (P2-9).
- [ ] The job is idempotent and resumable from any interruption point (P2-10).
- [ ] The active session is never pruned (P2-11).
- [ ] Pinned conversations are exempt and reported as skipped (P2-12); unpinning makes them
      eligible (P2-13).
- [ ] Summaries never overlap and their `seq` ranges match the turns they condensed (C2, C3).
- [ ] Every summarize and prune emits a write-log event (F7).
- [ ] The job runs as idle maintenance and never during a live interaction (F5).
- [ ] `dryRun` reports the full plan with no side effects (F1).
- [ ] GATE-3 is recorded, and the periodic schedule is enabled only after it passes (G8).

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Deletion happens before the summary is verified | **Permanent data loss** | Ordering enforced in code; failure test proves no deletion (D4, G3) |
| Summarizer returns empty or degenerate text | Turns deleted, nothing preserved | Validity guardrails; treated as absent (C5, D2) |
| Interruption between delete and tombstone | Conversation loses coherence | Recovery completes the pair; idempotent (E5, F4) |
| Pinned conversation partially pruned | Violates an explicit user choice | Pin re-checked per batch (F6, G7) |
| Active session pruned | Visible data loss mid-conversation | Exclusion asserted with a live session (B3, G6) |
| Overlapping summaries | Corrupt coverage; double-counting | Store-level non-overlap enforcement (C3) |
| Pruning runs during a generation | Interaction stalls | Lowest-priority idle scheduling (F5) |
| A missed run causes a deletion burst | Sudden large loss | No catch-up burst; bounded batches (F2, B4) |
| Schedule enabled before the gate | Destructive job on a timer, unproven | Ordering principle 7; F2 depends on G8 |
| Retention change not applied promptly | User expects a shorter window to take effect | Effective on next run without restart (A2) |

---

## 6. Traceability

| Phase 2 reference / test | Covered by |
|---|---|
| §2.1 Policy table (30 days, pinned, summaries/facts) | A1, A2, A3 |
| §2.2 `PruningJob` / `PruneReport` | F1, F7 |
| §2.3 Safety-ordered algorithm | B2, C2, D1–D4, E1–E5 |
| §2.4 Summarize before prune | D3, D4, G3 |
| §2.4 Tombstones | E2, E3, G4 |
| §2.4 Idempotent and resumable | F4, G5 |
| §2.4 Never prune active session | B3, G6 |
| §2.4 Never prune pinned | B3, F6, G7 |
| §2.4 Auditable | F7 |
| §2.5 Governor deferral | F5 |
| §3.2 Incremental, non-overlapping summaries | C2, C3 |
| P2-7 Retention aging | E1, G2 |
| P2-8 Summarize before prune | D3, G3 |
| P2-9 Tombstones | E2, G4 |
| P2-10 Idempotent pruning | F4, G5 |
| P2-11 Active session | B3, G6 |
| P2-12 / P2-13 Pinning | F6, G7 |

S2.4 output (summaries, tombstones, prune reports, write-log events) is consumed by S2.2
(retrieval reads summaries), S2.5 (transparency panel shows pruning history and retained volume),
and the release checklist (GATE-3).
