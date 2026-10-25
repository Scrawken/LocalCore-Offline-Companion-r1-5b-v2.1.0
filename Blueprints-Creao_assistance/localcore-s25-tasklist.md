# LocalCore — S2.5 Implementation Task List

Slice: **S2.5 — Opt-out transparency controls**
Source: Phase 2 §4 (disclosure, indicator, panel, deletion, wipe-all, write log, toggles, pinning);
S2.1 (stores, encryption); S2.2 (retrieval); S2.3 (extraction events); S2.4 (prune events);
S0.1 (consent/audit patterns).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

S2.5 delivers the controls that make opt-out memory defensible. Because memory is **on by default**,
the safety burden shifts from consent-gating to transparency and one-click control. These controls
are load-bearing, not polish: if any is missing, opt-out memory becomes a trust liability.

**In scope:**
- The first-run disclosure and the capture gate that blocks any memory write before acknowledgment.
- The persistent memory indicator, owned by the main process.
- The unified memory panel showing facts, summaries, and raw transcripts with source traces.
- Per-layer deletion and one-click wipe-all.
- The memory write log: append-only, viewable, clearable.
- Category toggles, the global switch, pinning, export/import, and the retention control surface.
- The acceptance tests P2-1 through P2-6 and P2-14 through P2-16.

**Explicit non-goals (do not build here):**
- No changes to extraction or pruning (S2.3, S2.4) — this slice surfaces their events.
- No changes to the fact/summary schemas (S2.1).
- No encryption changes (S2.1 F1–F5) — the panel reads through the existing decrypt path.
- No avatar, voice, tools, or cloud surfaces.

Rationale: S2.5 is the user-facing half of the memory system. It is separated from the stores and
jobs so that the control plane can be verified against seeded data, without depending on extraction
or pruning having run.

---

## 1. Ordering principles

1. **Disclosure before capture** — the gate must exist before any memory write path is reachable.
2. **Write log before the panel** — the panel shows history, so history must be recorded first.
3. **Deletion before wipe-all** — wipe-all is per-layer deletion applied across layers.
4. **Toggles before the panel's filtering** — the panel must respect what is disabled.
5. **Indicator alongside the controls**, not after — it is the always-visible half of the contract.
6. **The gate is enforced in code**, not by a screen the user can skip.
7. **Controls are immediate.** Disabling memory stops writes and injection with no restart.

---

## 2. Task list

### Group 1 — First-run disclosure & capture gate

**A1 — Disclosure content and presentation**

Deliverable: the first-run disclosure from Phase 2 §4.1.

Definition of done:
- [ ] The disclosure states plainly: memory is on; it stores facts and full transcripts locally;
      transcripts are kept for N days then summarized; here is how to change or disable it.
- [ ] It is shown on first run **before any memory write occurs** (P2-1).
- [ ] It is readable without scrolling past legal boilerplate — the key facts come first.
- [ ] It names the current retention window explicitly (not "a period").

**A2 — Capture gate**

Deliverable: the code-level block behind P2-1.

Definition of done:
- [ ] **No memory write path is reachable until the disclosure is acknowledged** (P2-1).
- [ ] The gate is enforced in the memory service, not only in the UI (test A2-T1).
- [ ] A write attempted before acknowledgment is refused and logged, not silently dropped.
- [ ] The gate applies to facts, summaries, and transcript persistence.

**A3 — Acknowledgment persistence**

Definition of done:
- [ ] Acknowledgment is persisted so the disclosure is not shown again on every launch.
- [ ] Acknowledgment records a version, so a materially changed disclosure can re-prompt.
- [ ] The acknowledgment is stored locally and encrypted.
- [ ] Clearing all app data returns the app to the unacknowledged state (test A3-T1).

**A4 — Re-disclosure on material change**

Definition of done:
- [ ] A material change (e.g. a longer default retention) triggers re-disclosure (test A4-T1).
- [ ] Re-disclosure does not delete existing memory; it re-establishes consent to continue.
- [ ] The version comparison is explicit, not a timestamp heuristic.
- [ ] A non-material change does not re-prompt.

---

### Group 2 — Memory indicator

**B1 — Persistent indicator**

Deliverable: the always-visible memory state surface from Phase 2 §4.2.

Definition of done:
- [ ] The indicator is visible **at all times while memory is active** (P2-2).
- [ ] It is owned and rendered by the **main process**, so the renderer cannot hide or spoof it
      (test B1-T1).
- [ ] It is not dismissible while memory is on.
- [ ] It reflects the true state read from the memory service, not a cached UI flag.

**B2 — Category reflection**

Definition of done:
- [ ] The indicator reflects which categories are enabled (facts / transcripts / summaries).
- [ ] Disabling a category updates the indicator immediately.
- [ ] A fully disabled state is visually distinct from an active one.
- [ ] The indicator does not imply capture when no category is enabled.

**B3 — Recent-write feedback**

Definition of done:
- [ ] The indicator shows a transient signal when a memory write occurs (test B3-T1).
- [ ] The signal does not accumulate or become a notification stream.
- [ ] Write feedback is throttled so rapid writes do not flicker.
- [ ] The feedback distinguishes a fact write from a transcript write.

**B4 — Presence across window modes**

Definition of done:
- [ ] The indicator is present in full, overlay, and tray-only modes (Phase 4 §5).
- [ ] In tray-only mode it remains discoverable (tray surface).
- [ ] In overlay mode it does not obstruct the avatar or accept clicks when click-through is on.
- [ ] Mode changes do not drop the indicator.

---

### Group 3 — Unified memory panel

**C1 — Panel contents**

Deliverable: the panel from Phase 2 §4.3.

Definition of done:
- [ ] The panel shows **facts, summaries, and raw transcripts** in one place (P2-3).
- [ ] Raw transcripts are read from the S1.2 turn store (the transcript layer), not a copy.
- [ ] Each layer is separately identifiable and filterable.
- [ ] The panel reflects category toggles and the global switch.

**C2 — Source traceability**

Definition of done:
- [ ] Every fact displays its source turns (P2-3).
- [ ] Every summary displays the `seq` range it covers (P2-3).
- [ ] A fact whose sources were pruned shows the historical ids without error (ties to S2.3 B3).
- [ ] Traceability links are navigable to the source where it still exists.

**C3 — Pinned conversations and retained volume**

Definition of done:
- [ ] Pinned conversations are listed explicitly with the amount of raw transcript they retain
      (P2-12).
- [ ] The panel warns when a pinned conversation is holding a large volume beyond the window.
- [ ] Unpinning is available from the panel and takes effect on the next prune.
- [ ] Pinned retention is visually distinct from window-retained data.

**C4 — Search**

Definition of done:
- [ ] The panel supports search across facts, summaries, and transcripts.
- [ ] Search respects the active character scope.
- [ ] Search results are ordered deterministically.
- [ ] Search does not bypass category toggles (test C4-T1).

**C5 — Panel performance**

Definition of done:
- [ ] The panel paginates or virtualizes; it does not load an entire large store at once
      (test C5-T1).
- [ ] Opening the panel does not block the chat UI.
- [ ] Decryption cost is bounded and measured.
- [ ] The panel works with a store at the documented maximum size.

---

### Group 4 — Deletion

**D1 — Per-layer deletion**

Deliverable: the deletion controls from Phase 2 §4.4.

Definition of done:
- [ ] A single fact, a single summary, a single transcript turn, or a whole conversation can be
      deleted (P2-4, P2-5).
- [ ] Deletion is available from the panel for each layer.
- [ ] Deleting a conversation removes its turns, summaries, and derived data.
- [ ] Deletion is atomic; an interrupted delete leaves a consistent state.

**D2 — Record and embedding removal**

Definition of done:
- [ ] Deleting a fact or summary removes its embedding in the same operation (P2-4).
- [ ] An orphan sweep runs after deletion to catch any residue (ties to S2.1 F3).
- [ ] The panel confirms deletion by re-reading storage, not by trusting the API's return.
- [ ] A deleted item does not reappear after a restart (test D2-T1).

**D3 — Wipe-all**

Deliverable: the one-click control from Phase 2 §4.5.

Definition of done:
- [ ] Wipe-all clears **every layer** — facts, summaries, transcripts — within one turn (P2-6).
- [ ] It requires exactly one confirmation, which states what will be removed.
- [ ] It completes within one turn; a partial wipe is not reported as success (test D3-T1).
- [ ] After a wipe, retrieval returns nothing and the indicator shows an empty state.

**D4 — Wipe report**

Definition of done:
- [ ] Wipe-all reports what was removed, per layer and in total (P2-6).
- [ ] The report is shown to the user and recorded in the write log.
- [ ] A wipe that fails partway reports the partial result honestly.
- [ ] The report distinguishes "removed" from "already empty".

**D5 — Deletion audit**

Definition of done:
- [ ] Every deletion emits a write-log event with the layer, target, and reason (P2-16).
- [ ] Deletions initiated by the user are distinguishable from automatic pruning.
- [ ] The audit entry never contains the deleted content (E5).
- [ ] The audit trail survives the deletion it records.

---

### Group 5 — Write log

**E1 — Log store**

Deliverable: the append-only log from Phase 2 §4.6.

Definition of done:
- [ ] The log is append-only and encrypted at rest.
- [ ] Entries match the `MemoryWriteEntry` shape (Phase 2 §4.6).
- [ ] The log is bounded; it prunes old entries independently of memory retention.
- [ ] A log write failure does not silently lose the event (ties to S0.1 F2's rule).

**E2 — Coverage across layers and actions**

Definition of done:
- [ ] Events are recorded for actions: `created`, `updated`, `deleted`, `pruned`, `summarized`,
      `pinned`, `unpinned` (P2-16).
- [ ] Events are emitted by S2.3 (extraction) and S2.4 (pruning) and recorded here.
- [ ] Each entry records the layer, the target reference, and the reason.
- [ ] Extraction and pruning events are not double-recorded (test E2-T1).

**E3 — Log display**

Definition of done:
- [ ] The log is viewable and filterable by layer, action, and time.
- [ ] Entries are ordered deterministically (newest first).
- [ ] The display is paginated for large logs.
- [ ] The log is reachable from the memory panel.

**E4 — Clearing the log**

Definition of done:
- [ ] The user can clear the log.
- [ ] Clearing is itself recorded as a log event (test E4-T1).
- [ ] Clearing does not clear memory content, only the history.
- [ ] Clearing is confirmed once, stating that memory content is unaffected.

**E5 — Log privacy**

Definition of done:
- [ ] The log records references and reasons, **never memory content** (P2-16).
- [ ] A test asserts no fact or transcript text appears in the log (test E5-T1).
- [ ] The log is encrypted at rest.
- [ ] Log entries remain meaningful after their target is deleted (ids, not content).

---

### Group 6 — Controls

**F1 — Category toggles**

Deliverable: per-category enable/disable (Phase 2 §4.8).

Definition of done:
- [ ] `setCategoryEnabled` toggles `facts`, `transcripts`, and `summaries` independently (P2-15).
- [ ] A disabled category is **neither written nor retrieved** (P2-15).
- [ ] The toggle takes effect immediately, with no restart.
- [ ] The indicator (B2) and panel (C1) reflect the change.

**F2 — Global switch**

Deliverable: the master enable/disable.

Definition of done:
- [ ] Disabling memory stops **writes and injection immediately**, with no restart (P2-14).
- [ ] The active conversation remains coherent (recent turns still available) (ties to S2.2 D2).
- [ ] Re-enabling resumes capture without a restart.
- [ ] The switch is not defeated by a cached memory block (ties to S2.2 F4).

**F3 — Pinning control**

Definition of done:
- [ ] Pinning and unpinning are available from the panel and the conversation view (P2-12, P2-13).
- [ ] The control explains that pinning retains raw transcripts beyond the window.
- [ ] Pinning emits a write-log event.
- [ ] The retained-volume figure is shown next to the control (C3).

**F4 — Export and import**

Definition of done:
- [ ] Export produces readable JSON covering facts, summaries, and transcript references.
- [ ] Import validates before applying and reports errors without partial application.
- [ ] Round-trip export → import restores equivalent retrieval behaviour (P2-14 in Phase 2 §4.8).
- [ ] An export contains content, never credentials or keys (ties to S2.1 F5).

**F5 — Retention control surface**

Definition of done:
- [ ] The retention window is visible and adjustable (S2.4 A2).
- [ ] Changing it explains the effect on the next prune run.
- [ ] The control shows how much raw transcript is currently retained.
- [ ] A shortened window is reflected in the panel's retained-volume figures.

---

### Group 7 — Verification

**G1 — Fixtures and doubles**

Definition of done:
- [ ] Seeded stores with facts, summaries, and transcripts, including a pinned conversation.
- [ ] A pre-acknowledgment state fixture for the capture gate.
- [ ] Tests run offline and deterministically.
- [ ] No test requires extraction or pruning to have run.

**G2 — P2-1: first-run disclosure**

Definition of done:
- [ ] P2-1 passes: the disclosure is shown before any memory write, and no capture occurs until
      acknowledged.
- [ ] The test attempts a write before acknowledgment and asserts it is refused (A2-T1).
- [ ] Acknowledgment persistence is asserted.

**G3 — P2-2: indicator**

Definition of done:
- [ ] P2-2 passes: the indicator is visible at all times while memory is active.
- [ ] The test asserts the renderer cannot hide it.
- [ ] Presence across window modes is asserted.

**G4 — P2-3: unified panel**

Definition of done:
- [ ] P2-3 passes: facts, summaries, and transcripts are all listed with source traces.
- [ ] Traceability links are asserted for each layer.
- [ ] Category toggles are reflected.

**G5 — P2-4 / P2-5: per-layer deletion**

Definition of done:
- [ ] P2-4 passes: a deleted fact is gone from retrieval within one turn, embedding removed.
- [ ] P2-5 passes: a deleted transcript turn is gone from the store and search.
- [ ] Deletion is confirmed by re-reading storage.

**G6 — P2-6: wipe-all**

Definition of done:
- [ ] P2-6 passes: all layers are cleared within one turn, and the report is accurate.
- [ ] Retrieval returns nothing after a wipe.
- [ ] A partial failure is reported honestly.

**G7 — P2-14: disable memory**

Definition of done:
- [ ] P2-14 passes: no writes and no injection immediately, with no restart.
- [ ] The active conversation remains coherent.
- [ ] A stale cache cannot reintroduce memory.

**G8 — P2-15: category toggle**

Definition of done:
- [ ] P2-15 passes: a disabled category is neither written nor retrieved.
- [ ] Each of the three categories is tested independently.
- [ ] The indicator and panel reflect the change.

**G9 — P2-16: write log**

Definition of done:
- [ ] P2-16 passes: the log accurately records created/updated/deleted/pruned/summarized/pinned
      with reasons.
- [ ] No memory content appears in the log.
- [ ] Clearing the log is itself logged.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | — | A2, G2 |
| A2 | A1, S2.1-A3 | A3, G2 |
| A3 | A2, S0.1-B2 | A4 |
| A4 | A3 | — |
| B1 | S2.1 (store reads), S0.1-A1 | B2–B4 |
| B2 | B1, F1 | G8 |
| B3 | B1, S2.3 (events) | — |
| B4 | B1, S4.1 (window modes) | — |
| C1 | S2.1-B2, S2.1-C2, S2.1-A2 | C2–C5 |
| C2 | C1, S2.3-B3, S2.4-E2 | G4 |
| C3 | C1, S2.4-F6, S2.4-A3 | G4 |
| C4 | C1, F1 | — |
| C5 | C1 | — |
| D1 | S2.1-B2, S2.1-C2, S1.2-B3 | D2–D5 |
| D2 | D1, S2.1-F3 | G5 |
| D3 | D1, S2.4-E1 | D4, G6 |
| D4 | D3, E1 | G6 |
| D5 | D1, E1 | G9 |
| E1 | S0.1-F1, S0.1-B2 | E2–E5, D4 |
| E2 | E1, S2.3 (events), S2.4-F7 | G9 |
| E3 | E1 | — |
| E4 | E1 | G9 |
| E5 | E1 | G9 |
| F1 | S2.1 (flags), S2.2-D1 | G8 |
| F2 | S2.1 (flags), S2.2-D2 | G7 |
| F3 | S2.4-A3, C3 | G4 |
| F4 | S2.1-B2, S2.1-C2 | — |
| F5 | S2.4-A2 | — |
| G1 | A1, C1, D1, E1 | G2–G9 |
| G2 | G1, A1–A3 | — |
| G3 | G1, B1–B4 | — |
| G4 | G1, C1–C3, F3 | — |
| G5 | G1, D1, D2 | — |
| G6 | G1, D3, D4 | — |
| G7 | G1, F2 | — |
| G8 | G1, F1, B2 | — |
| G9 | G1, E1–E5, D5 | — |

Parallel opportunities: Groups 2–3 (indicator and panel) can be built alongside Group 5 (write log)
once E1's store shape is fixed. Group 6 (controls) depends on the stores but not on the panel.

---

## 4. Slice-level Definition of Done

S2.5 is complete when **all** of the following hold:

- [ ] The disclosure is shown before any memory write, and capture is blocked until acknowledged
      (P2-1).
- [ ] The indicator is always visible while memory is active and cannot be hidden by the renderer
      (P2-2).
- [ ] The unified panel shows facts, summaries, and transcripts with source traces (P2-3).
- [ ] A single fact, summary, transcript turn, or conversation can be deleted, with its embedding
      (P2-4, P2-5).
- [ ] Wipe-all clears every layer within one turn and reports what was removed (P2-6).
- [ ] Disabling memory stops writes and injection immediately, without a restart (P2-14).
- [ ] A disabled category is neither written nor retrieved (P2-15).
- [ ] The write log accurately records all actions with reasons and contains no memory content
      (P2-16).
- [ ] Pinned conversations are shown with their retained transcript volume (P2-12).
- [ ] Export/import round-trips without loss and contains no credentials.
- [ ] Every control is reachable, and every change is reflected in the indicator and panel.
- [ ] All tests run offline and deterministically against seeded stores.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Capture begins before the disclosure is acknowledged | The core opt-out promise is broken | Gate enforced in the service, not the UI (A2, G2) |
| Indicator is renderer-owned and can be hidden | User cannot trust the display | Main-process ownership; renderer cannot hide it (B1, G3) |
| Delete removes the record but not the embedding | Privacy residue | Atomic delete plus orphan sweep (D2, G5) |
| Wipe-all partially completes and reports success | False assurance | One-turn completion check; honest partial reporting (D3, D4) |
| Write log records content | Leaks exactly what it exists to describe | References and reasons only; asserted (E5, G9) |
| Disabled category served from a stale cache | Setting silently ignored | Immediate effect; cache invalidation (F1, F2, G7, G8) |
| Pinning silently defeats retention | Undermines the transparency story | Retained volume shown; warning; unpin path (C3, F3) |
| Panel blocks on a large encrypted store | UI stall when opening memory | Pagination and bounded decryption (C5) |
| Log clearing deletes content | Data loss via a "history" control | Confirmation states content is unaffected; asserted (E4) |
| Re-disclosure deletes existing memory | Unwanted data loss on an update | Re-disclosure re-establishes consent without deleting (A4) |

---

## 6. Traceability

| Phase 2 reference / test | Covered by |
|---|---|
| §4.1 First-run disclosure (capture gate) | A1, A2, A3 |
| §4.2 Persistent indicator | B1–B4 |
| §4.3 Unified memory panel | C1–C5 |
| §4.4 Per-layer deletion | D1, D2 |
| §4.5 One-click wipe-all | D3, D4 |
| §4.6 Memory write log | E1–E5 |
| §4.7 Encryption at rest (surfaced) | C5, E1, E5 |
| §4.8 Category toggles, global switch, pinning | F1–F3 |
| §4.8 Export / import | F4 |
| §4.8 Retention control | F5 |
| P2-1 First-run disclosure | A2, G2 |
| P2-2 Indicator | B1, G3 |
| P2-3 Unified panel | C1, C2, G4 |
| P2-4 Delete fact | D2, G5 |
| P2-5 Delete transcript | D1, G5 |
| P2-6 Wipe-all | D3, D4, G6 |
| P2-14 Disable memory | F2, G7 |
| P2-15 Category toggle | F1, G8 |
| P2-16 Write log | E2, E5, G9 |

S2.5 completes the memory phase. Its controls are referenced by Phase 5 (deletion/quarantine
patterns), Phase 6 (consent-surface patterns), and the release checklist for the opt-out memory
promise.
