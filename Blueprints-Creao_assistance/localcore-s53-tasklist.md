# LocalCore — S5.3 Implementation Task List

Slice: **S5.3 — Reversibility, quarantine, and undo**
Source: Phase 5 §8.2 (reversibility and quarantine), §4 (`undoRef`), §7 (audit);
S5.1 (scoped filesystem); S5.2 (broker).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The `undoRef` model and undo registry.
- Write-with-backup and move reversibility.
- The quarantine store: deletes move a target into app-data quarantine rather than removing it.
- `restore(quarantineId)` and the separate, explicitly destructive permanent delete.
- Quarantine retention and automatic purge.
- Undo and quarantine surfaces.
- Audit integration for undo, restore, and purge.

**Explicit non-goals (do not build here):**
- No Action Broker or approval UX (S5.2).
- No shipped tools (S5.4) — this slice provides the reversibility substrate.
- No version history or file diffing beyond what undo requires.
- No cloud backup or sync.

Rationale: reversibility is what makes "delete" safe enough to expose to a companion at all. It is
separated from the broker so the recovery mechanisms can be verified with stub tools before any
destructive tool ships.

---

## 1. Ordering principles

1. **undoRef model before any reversible action** — the reference must exist before it is returned.
2. **Backup before mutation** — a reversible write must snapshot before it writes.
3. **Quarantine before delete** — a delete that cannot quarantine must refuse, not proceed.
4. **Restore before permanent delete** — recovery must work before destruction is offered.
5. **Retention before auto-purge** — nothing is purged until its window is defined and enforced.
6. **Permanent delete is a separate action**, never an option on the delete path.
7. **Every recovery action is audited** — undo, restore, and purge alike.

---

## 2. Task list

### Group 1 — Undo references

**A1 — `undoRef` model**

Deliverable: the reference returned in `ActionResult` (Phase 5 §4).

Definition of done:
- [ ] An `undoRef` identifies the action, the affected target(s), and the recovery mechanism.
- [ ] It is returned only for actions declared `reversible`.
- [ ] A non-reversible action returns no `undoRef` and says so.
- [ ] The reference is opaque to callers; the undo service interprets it.

**A2 — Undo registry**

Definition of done:
- [ ] Reversible actions register their recovery data at execution time.
- [ ] The registry maps `undoRef` → recovery operation.
- [ ] An unknown or expired `undoRef` produces a structured error, not a silent no-op
      (test A2-T1).
- [ ] Registration happens atomically with the action, so an action cannot succeed without a
      recoverable record.

**A3 — Undo lifetime**

Definition of done:
- [ ] Undo records have a retention window, documented and configurable.
- [ ] Expired undo records are purged, and the purge is audited.
- [ ] Purging an undo record does not affect the target file.
- [ ] A user can see which actions are still undoable.

---

### Group 2 — Backups for reversible actions

**B1 — Write with backup**

Definition of done:
- [ ] A write/create over an existing file snapshots the original before writing (Phase 5 §9).
- [ ] The snapshot is stored under app-data, encrypted where it contains user content.
- [ ] Undo restores the original exactly (bytes, not a reconstruction).
- [ ] Creating a new file records the action so undo can remove it.

**B2 — Move reversibility**

Definition of done:
- [ ] A move records source and destination.
- [ ] Undo moves the target back to the original location.
- [ ] If the original location is now occupied, undo reports a conflict (D3) rather than
      overwriting.
- [ ] A move within a root is reversible; a move across roots is handled per a documented rule.

**B3 — Backup storage bounds**

Definition of done:
- [ ] Backup storage is bounded by size and count (test B3-T1).
- [ ] When the bound is reached, the oldest backups are purged and the purge is audited.
- [ ] A single very large file cannot exhaust the quota; it is rejected or handled per a documented
      rule.
- [ ] Quota usage is visible to the user.

---

### Group 3 — Quarantine

**C1 — Quarantine store**

Deliverable: the quarantine from Phase 5 §8.2.

Definition of done:
- [ ] Quarantine lives under the app-data directory and is encrypted where it holds user content.
- [ ] Each quarantined item carries metadata: original path, deletion time, size, and the action
      that removed it (C4).
- [ ] Quarantine is separate from undo backups; the two do not share a quota.
- [ ] The store is inspectable and clearable by the user.

**C2 — Delete moves to quarantine**

Deliverable: the guarantee behind T3.

Definition of done:
- [ ] `ScopedFileSystem.delete` moves the target into quarantine rather than removing it
      (P5-16).
- [ ] If quarantine fails, the delete **fails** — it never falls back to permanent removal
      (test C2-T1).
- [ ] A delete of a large file is bounded and reports progress where needed.
- [ ] The original path is recorded so restore can return the file.

**C3 — Retention and purge**

Definition of done:
- [ ] Quarantined items are retained for a documented window before automatic purge.
- [ ] The purge is audited and reports what was removed.
- [ ] Purge is idempotent and resumable.
- [ ] A user can purge immediately, with a confirmation stating the removal is permanent.

**C4 — Quarantine metadata**

Definition of done:
- [ ] Metadata includes original path, size, deletion timestamp, originating action, and
      conversation/turn where applicable.
- [ ] Metadata is readable by the quarantine surface (E3).
- [ ] A quarantined item without metadata is treated as un-restorable and flagged (test C4-T1).
- [ ] Metadata survives a restart.

---

### Group 4 — Restore & permanent delete

**D1 — Restore**

Definition of done:
- [ ] `restore(quarantineId)` returns the item to its original path (P5-16).
- [ ] Restore is itself an action that crosses the broker and is audited.
- [ ] A restore to a path that no longer exists recreates the directory chain within the granted
      root.
- [ ] Restore is atomic; an interrupted restore leaves the item quarantined, not half-restored.

**D2 — Permanent delete**

Definition of done:
- [ ] Permanent deletion is a **separate, explicitly destructive action** (T3).
- [ ] It is never offered as an option on the delete path; it is a distinct operation on the
      quarantine.
- [ ] It always requires per-action approval and is never persistently granted (ties to S5.2 C3).
- [ ] It reports exactly what was permanently removed.

**D3 — Restore conflicts**

Definition of done:
- [ ] A restore where the original path is occupied produces a structured conflict (test D3-T1).
- [ ] The user is offered: keep both (renamed), overwrite (with approval), or cancel.
- [ ] Overwrite follows the normal destructive approval rules.
- [ ] A conflict never silently overwrites.

---

### Group 5 — Audit & surfaces

**E1 — Audit integration**

Definition of done:
- [ ] `undoRef` appears in the `ActionAuditEntry` (ties to S5.2 D1).
- [ ] Undo, restore, and permanent delete each produce their own audit entries (test E1-T1).
- [ ] A purged undo record is reflected in the audit trail.
- [ ] Audit entries never contain file contents.

**E2 — Undo surface**

Definition of done:
- [ ] The user can see recent reversible actions and undo them.
- [ ] An undo that fails reports why, in plain language.
- [ ] Undo is available from the point of the action and from a history view.
- [ ] Undo does not require a restart.

**E3 — Quarantine surface**

Definition of done:
- [ ] The user can list quarantined items with their original paths and deletion times.
- [ ] Restore and purge are available per item and in bulk.
- [ ] The retained size is shown, so the quarantine does not grow invisibly.
- [ ] The surface distinguishes quarantined items from permanently deleted ones.

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] A fixture filesystem with files of known content and size.
- [ ] Stub tools that perform write, move, and delete.
- [ ] The clock is injectable for retention tests.
- [ ] Tests run offline and deterministically.

**F2 — P5-16: quarantine**

Definition of done:
- [ ] P5-16 passes: deletes are recoverable within the retention window.
- [ ] The restored file is byte-identical to the original.
- [ ] A failed quarantine aborts the delete.

**F3 — P5-17: undo**

Definition of done:
- [ ] P5-17 passes: reversible actions expose a working undo.
- [ ] Write-over restores the original bytes.
- [ ] Move returns the file to its original location.

**F4 — Bounds and purge**

Definition of done:
- [ ] Backup and quarantine quotas are enforced.
- [ ] Purge is audited and idempotent.
- [ ] Expired undo records are purged without affecting targets.
- [ ] A large-file rejection path is covered.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S5.2-A1 | A2, E1 |
| A2 | A1 | A3, B1 |
| A3 | A2 | F4 |
| B1 | A2, S5.1-C1 | B2, F3 |
| B2 | B1 | B3, F3 |
| B3 | B1, B2 | F4 |
| C1 | S0.1-B1/B3 | C2 |
| C2 | C1, S5.1-C1 | C3, F2 |
| C3 | C2 | C4, F4 |
| C4 | C1 | D1, E3 |
| D1 | C2, S5.2-A1 | D3, F2 |
| D2 | C1, S5.2-C3 | E1 |
| D3 | D1 | F2 |
| E1 | A1, D2, S5.2-D1 | F3 |
| E2 | A2, B1 | — |
| E3 | C1, C4 | — |
| F1 | C1, B1, S5.2-A1 | F2–F4 |
| F2 | F1, C2, D1 | — |
| F3 | F1, B1, B2, E1 | — |
| F4 | F1, A3, B3, C3 | — |

Parallel opportunities: Group 2 (backups) and Group 3 (quarantine) are independent and can proceed
concurrently. Group 5 (surfaces) depends on both.

---

## 4. Slice-level Definition of Done

S5.3 is complete when **all** of the following hold:

- [ ] Deletes move to quarantine and are recoverable within the retention window (P5-16).
- [ ] A failed quarantine aborts the delete rather than removing the file (C2).
- [ ] Reversible actions expose a working undo, restoring exact bytes (P5-17).
- [ ] Moves are reversible, with conflict handling instead of silent overwrite (D3).
- [ ] Permanent deletion is a separate, destructive, always-approved action (D2).
- [ ] Backup and quarantine quotas are bounded and their purge is audited (B3, C3).
- [ ] Every undo, restore, and purge produces an audit entry (E1).
- [ ] The user can see, restore, and purge quarantined items, with retained size visible (E3).
- [ ] All tests run offline and deterministically with an injected clock.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Delete falls back to permanent removal when quarantine fails | Silent data loss | Fail the delete instead; asserted (C2, F2) |
| Undo restores a reconstruction, not the original bytes | Corrupted recovery | Snapshot bytes; byte-identical assertion (B1, F3) |
| Restore silently overwrites a new file at the original path | Data loss during recovery | Conflict handling with explicit choices (D3, F2) |
| Quarantine grows unbounded | Disk exhaustion | Quota and retention with audited purge (C3, F4) |
| Undo record expired without user awareness | User believes recovery is available | Undoability is visible; expiry is audited (A3, E2) |
| Metadata lost so an item is un-restorable | Recoverable file stranded | Metadata persisted and validated; flagged if missing (C4) |
| Permanent delete reachable from the delete path | Accidental irreversibility | Separate action only, always approved (D2) |
| Backup quota exhausts on one large file | Reversibility lost for everything else | Large-file rule; quota visible (B3) |

---

## 6. Traceability

| Phase 5 reference / test | Covered by |
|---|---|
| §4 `ActionResult.undoRef` | A1, A2 |
| §8.2 Reversible actions record `undoRef` | B1, B2 |
| §8.2 Deletes quarantined by default (T3) | C1, C2 |
| §8.2 Permanent deletion is separate | D2 |
| §7 `undoRef` in the audit entry | E1 |
| P5-16 Quarantine | C2, D1, F2 |
| P5-17 Undo | B1, B2, E1, F3 |

S5.3 output (undo, quarantine, restore) is consumed by S5.4 (shipped delete and write tools) and the
release checklist for the reversible-delete guarantee.
