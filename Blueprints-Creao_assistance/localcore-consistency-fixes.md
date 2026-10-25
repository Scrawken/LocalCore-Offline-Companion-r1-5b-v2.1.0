# LocalCore — Consistency Resolution Log

Records the decisions taken to resolve the cross-document inconsistencies identified in review, the
rationale for each, and the files changed. This log is authoritative: where an earlier document
contradicts a resolution here, **this log and the amended canonical document win**.

Companion documents: [localcore-master-index.md](./localcore-master-index.md),
[localcore-tasklist-index.md](./localcore-tasklist-index.md),
[localcore-release-checklist.md](./localcore-release-checklist.md).

---

# 1. Resolution summary

| # | Issue | Resolution | Severity |
|---|---|---|---|
| R1 | S0.4 gate prerequisites conflict with S4.1 | S0.4 **requires S4.1** (real avatar renderer); simulators only for STT/TTS/wake word | Blocker |
| R2 | Chat engine and provider both acquire the LLM lease | **The provider owns the lease; the engine acquires none** | Blocker |
| R3 | Memory opt-out conflicts with transcript persistence | **Ephemeral sessions:** chat works, nothing is persisted | Blocker |
| R4 | Full shell cannot coexist with single-egress | **Shell excluded from v1** | Blocker |
| R5 | Tool-approval policy contradicts itself | **Standing grants are origin-matched**; destructive and high-risk model-origin always prompt | Blocker |
| R6 | Embedding classified both heavy and light | **Embedding is light** | Consistency |
| R7 | Master index not authoritative; 24 vs 26 slices | Corrected to 26; added missing documents; status semantics clarified | Consistency |
| R8 | Build-order prose conflicts about parallel work | S0.2 → S0.3 is **sequential**; corrected | Consistency |
| R9 | P1-21…P1-28 coverage stale; P1-28 uncovered | Test lists corrected; **P1-28 given explicit task and test coverage** | Consistency |
| R10 | Two files could both read as canonical Phase 5 | `localcore-phase5-spec-v11.md` is canonical; `-final.md` is an **archive stub** | Consistency |
| R11 | Phase 2 test IDs misaligned in task lists (P2-16/18/20) | **Realigned:** budget assembly → P2-20, write log → P2-18, export/import → P2-16 | Consistency |
| R12 | Phase 3 test renumbering left S3.2 stale; P3-17/18/19/21 unmapped | **Realigned and mapped** to S3.1, S3.2, S6.1, S6.2 | Consistency |
| R13 | Task total reported as 716 after S5.4 lost a task | Corrected to **715** in both indexes | Consistency |
| R14 | Phase 1 decision **C6 missing from the decisions register** | Register corrected; true total is **45 decisions** | Consistency |

---

# 2. Detailed resolutions

## R1 — S0.4 feasibility gate prerequisites

**Issue.** The S4/S7 scenarios need the avatar renderer. The build order placed S4.1 before S0.4 but
did not list it as a prerequisite, and the S0.4 scenario list (`S0–S2, S5, S7`) disagreed with the
task list (`S0–S7`).

**Decision.** **S0.4 requires S4.1.** The avatar-load components of S4 and S7 use the **real** avatar
renderer. A stub avatar would make the coexistence measurement meaningless, because the avatar's
memory and GPU footprint is precisely what the gate tests. S4.1 sits at wave 2 and S0.4 at wave 3,
so the renderer is available.

Only STT, TTS, and wake word use calibrated simulators, because those engines do not exist until
S3.1–S3.3. The gate decision is **provisional** for those components until S0.4 G1 re-validates with
the real engines.

**Files changed.** `localcore-build-order.md` (dependency note, parallel tracks, S0.4 row and
scenario list), `localcore-s04-tasklist.md` (scope bullet, slice-level prerequisites).

## R2 — LLM lease ownership

**Issue.** S1.2 had the engine acquire an `llm` lease; S1.3 had the provider acquire one. With one
heavy slot on the floor, a provider request could block on a lease its own caller already held.

**Decision.** **The provider owns the `llm` lease; the engine acquires none.**

Rationale: the lease represents *local heavy-resource consumption*, and only a local provider
consumes it. Centralizing it in the engine would wrongly serialize **cloud** requests behind local
heavy work, since a cloud provider consumes no local heavy resources. The provider declares
`consumesHeavySlot` in its capabilities (`true` local, `false` cloud) so the engine can report
degradation without owning the lease.

The engine's `thinking` event is still emitted before the provider is invoked, so perceived
responsiveness is unaffected.

**Files changed.** `localcore-phase1-spec-v13.md` (§2.3 step 3, §2.5 lease-ownership subsection,
`ModelCapabilities`), `localcore-s12-tasklist.md` (C1, C4, D1, F1, F3, G4, slice DoD),
`localcore-s13-tasklist.md` (A3 `consumesHeavySlot`, D1 sole-owner note).

## R3 — Memory opt-out vs transcript persistence

**Issue.** Phase 1 requires storing chat turns. Phase 2 treats that same turn store as transcript
memory and says disabling memory stops transcript writes. S2.5 gates transcript capture on
acknowledgment. It was unspecified whether chat works without saving history.

**Decision.** **Chat always works. Persistence is conditional.**

| Condition | Behaviour |
|---|---|
| Disclosure acknowledged **and** `transcripts` enabled | Turns persisted; history survives restart |
| Disclosure unacknowledged | **Ephemeral session** — in-memory only, nothing written |
| Memory globally disabled | **Ephemeral session** — in-memory only, nothing written |
| `transcripts` disabled (memory on) | **Ephemeral session for turns;** facts/summaries may still be captured if enabled |

Memory being off never disables conversation — it means the conversation is not saved. The session
buffer carries the live thread, so the companion stays coherent within the session; closing it
discards the history. The UI must state plainly that history is not being saved.

P1-1 ("50-turn session survives restart") is scoped to the persisted case.

**Files changed.** `localcore-phase1-spec-v13.md` (§2.5 ephemeral-session table),
`localcore-phase2-spec-v11.md` (§1.2 conditional persistence, §4.8, P2-14),
`localcore-s12-tasklist.md` (F1, F3, slice DoD).

## R4 — Full shell vs the single-egress promise

**Issue.** Phase 0 makes the Egress Gateway the only permitted network path. Phase 5 and S5.4
allowed opt-in full shell, but approval and command inspection cannot prevent arbitrary child
processes from making network requests.

**Decision.** **Shell is excluded from v1.** `shell:execute` remains in the scope vocabulary but no
shell tool ships, alongside `screen:capture`.

Rationale: enforceable containment would require running the entire shell process tree inside an
AppContainer or equivalent with no network capability — which would break legitimate local commands
and is a substantial capability in its own right. Because the single-egress path is the product's
core invariant, shell is excluded rather than shipped with an unverifiable claim.

**Adding shell later** requires, as a separately gated capability: OS-level network containment of
the entire shell process tree; a distinct consent scope for shell network access; and verification
that no unapproved egress occurs. No partial shell implementation may ship behind a hidden flag.

Note this is consistent with T1, which already excluded shell from the v1 default set; the change is
that the opt-in *capability* is also removed.

**Files changed.** `localcore-phase5-spec-v11.md` (§2.1, §6.1, §9, §10 P5-22),
`localcore-s51-tasklist.md` (scope, tiers, P5-24), `localcore-s54-tasklist.md` (scope, ordering
principles, Group 5 rewritten as a documented exclusion, F1, F5, risks, traceability),
`localcore-release-checklist.md` (GATE-4 posture).

**Test-ID note.** P5-22 was re-scoped from "shell default" to "shell excluded". The ID is retained;
its meaning is narrower.

## R5 — Tool-approval policy

**Issue.** The specs said model proposals are never auto-authorized, yet allowed model-origin
actions under a matching standing grant. This left GATE-4 ambiguous.

**Decision.** **Standing grants are origin-matched.**

- A standing grant is scoped to (tool, scope, root) **and origin**, and applies only to actions of
  the origin it was created under.
- A grant the user created while performing their **own** action therefore never covers a
  model-proposed action.
- **`high` risk:** a standing grant applies only for `user` origin. `high`-risk `model` or
  `automation` actions always require fresh per-action approval.
- **`destructive` risk:** always fresh per-action approval, for every origin; never covered by a
  standing grant.
- `low`/`moderate` risk: same-origin standing grants apply.
- Only the user can create a grant, and only in response to a prompt that displayed the origin. The
  model can never create, widen, or reuse one.

This resolves the ambiguity: "auto-authorization" means the *model* authorizing itself, which never
happens; a standing grant is a *user* pre-authorization, and it is origin-bound.

**Files changed.** `localcore-phase5-spec-v11.md` (§4.2 matrix + origin-matching note, §5 controls,
§8.3), `localcore-s52-tasklist.md` (A3, E2), `localcore-s54-tasklist.md` (B3),
`localcore-release-checklist.md` (GATE-4 pass criteria).

## R6 — Embedding pipeline classification

**Issue.** Phase 0 and S0.2 called `embedding` heavy; Phase 2 and S2.1 called it light.

**Decision.** **Embedding is light.**

Rationale: the Phase 0 heavy classification predated the embedder choice. The selected embedder
(Phase 2 M4) is a ~90MB CPU-only ONNX MiniLM running in a worker in short bursts, occupying no model
slot. It must not consume the single heavy slot on the floor tier.

It remains in the governor's priority ordering as a scheduling hint (deferred behind generation and
voice), but as a light pipeline it is never blocked. Batch size is bounded and it yields.

**Files changed.** `localcore-phase0-spec-v11.md` (§3.2 classification note, §3.3 priority, §3.3
light-pipeline bullet), `localcore-s02-tasklist.md` (A1).

## R7 — Master index authority

**Issue.** The master index reported "24 slices across 7 waves", omitted the task-list and release
documents, and used "complete" without defining it.

**Decision.** Corrected to **26 slices**, added the task-list index and release checklist to the
canonical set, and defined status semantics explicitly: **"complete" means the specification and
task lists are authored, not that any implementation exists. No code has been written; every gate is
open.**

**Files changed.** `localcore-master-index.md` (§2, §12), `localcore-tasklist-index.md` (§1).

## R8 — Build-order parallel-work prose

**Issue.** The build order said "S0.2 + S0.3 … in parallel" in §10, while S0.3 depends on S0.2's tier
profile and the wave table sequenced them.

**Decision.** **S0.2 → S0.3 is sequential**, because S0.3 consumes the tier profile. Both still run
in parallel with S1.1 and S1.2, which depend only on S0.1.

**Files changed.** `localcore-build-order.md` (§10 first three moves).

## R9 — Acceptance coverage P1-21…P1-28

**Issue.** Phase 1 v1.3 defines P1-1 through P1-28. The build order and task mappings covered only
parts of that range, and **P1-28 (install-time delivery choice) had no explicit task or test
coverage.**

**Decision.** Test ownership corrected:

- **S0.3** owns P1-15–P1-18 and P1-20–P1-28 (server, proxy, containment, provisioning).
- **S1.3** owns P1-19 plus contract conformance and the lease-leak matrix.

P1-28 is now explicitly covered in S0.3 C5 and tested in S0.3 G5: both delivery paths are selectable
at install time, and the choice is recorded and reversible.

**Files changed.** `localcore-build-order.md` (S0.3, S1.3 rows), `localcore-s03-tasklist.md` (C5, G5,
traceability).

## R10 — Duplicate Phase 5 finals

**Issue.** `localcore-phase5-spec-v11.md` and `localcore-phase5-spec-final.md` could both be mistaken
for canonical.

**Decision.** **`localcore-phase5-spec-v11.md` is canonical.** `localcore-phase5-spec-final.md` is
rewritten as an **archive stub** pointing to it, listing the differences that matter (shell
exclusion, origin-matched grants, P5-22 re-scope). It must not be implemented against.

**Files changed.** `localcore-phase5-spec-final.md` (rewritten as an archive notice).

## R11 — Phase 2 test-ID misalignment

**Issue.** The Phase 2 v1.1 table lists P2-16 = *Export / import*, P2-18 = *Write log*,
P2-20 = *Budget assembly*. Task lists had drifted: S2.2 cited **P2-18** for budget assembly, and
S2.5 cited **P2-16** for the write log and cited a non-existent "P2-14" for export/import. The
result was that P2-20 was unreferenced and P2-16 pointed at the wrong guarantee.

**Decision.** Realign every reference to the canonical v1.1 numbering:

- **Budget assembly → P2-20** (S2.2 G3, traceability, slice DoD).
- **Write log → P2-18** (S2.5 §0, D5, E2, E5, G9, traceability).
- **Export / import → P2-16** (S2.5 F4, traceability).
- Index and build-order key-test lists updated for S2.2 and S2.5.

**Files changed.** `localcore-s22-tasklist.md`, `localcore-s25-tasklist.md`,
`localcore-tasklist-index.md`, `localcore-build-order.md`.

## R12 — Phase 3 test renumbering staleness

**Issue.** Inserting "Consent separation" into the Phase 3 v1.1 table shifted the tail: P3-19 is now
*Consent separation*, P3-20 *Viseme metadata*, P3-21 *Model eviction*. S3.2 still used the old
numbering (treating P3-19 as viseme metadata and P3-20 as a fallback test that does not exist in
Phase 3). P3-17, P3-18, P3-19, and P3-21 were unmapped entirely.

**Decision.** Realign and map:

- **P3-17** (local voice engine egress) → **S3.1 F1**.
- **P3-20** (viseme metadata) → **S3.2 F5**; the amplitude fallback is correctly verified in Phase 4
  as **P4-11**, not in Phase 3.
- **P3-21** (model eviction) → **S3.2 E3**.
- **P3-18** (cloud voice gate) and **P3-19** (consent separation) → **S6.2 G5**, since both are
  cloud-voice concerns.

**Files changed.** `localcore-s31-tasklist.md`, `localcore-s32-tasklist.md`, `localcore-s62-tasklist.md`,
`localcore-tasklist-index.md`, `localcore-build-order.md`.

## R13 — Task total drift

**Issue.** The indexes reported 716 tasks; removing one task from S5.4 (shell preview) during R4
left the true total at 715.

**Decision.** Corrected to **715** in the task-list index (two places, including the per-track
table where Tools drops from 90 to 89) and the master index (two places).

**Files changed.** `localcore-tasklist-index.md`, `localcore-master-index.md`.

## R14 — Decision C6 missing from the register

**Issue.** The master index register listed Phase 1 decisions C1–C5, but the Phase 1 v1.3 spec
defines **C6 — Local server protection: Authenticated local proxy in front of Ollama**. The register
was therefore incomplete and its totals (44 decisions, "Phase 1 (C): 5") were wrong. Found by the
new decision-register cross-verification in `work/consistency-check.sh` §10.

**Decision.** Add C6 to the register with the correct choice, and correct the totals throughout:

- **45 decisions**, not 44 (D 11, P 4, C **6**, M 4, V 5, A 5, T 5, CL 5).
- Phase 1 (C) row: 5 → **6**.
- Header ranges: `C1–C5` → `C1–C6`.
- Inventory and master-index prose updated to match.

**Files changed.** `localcore-master-index.md`, `localcore-inventory.md`.

---

# 3. Verification performed

- All markdown links in every document resolve to a file that exists.
- No remaining "engine acquires an `llm` lease" references in canonical documents.
- No remaining heavy-list inclusion of `embedding` in canonical documents.
- No remaining "matching standing grant" wording without origin-matching in canonical documents.
- No remaining "24 slices" claims.
- No remaining "opt-in full shell" capability in canonical documents.

**Superseded drafts** (`localcore-phase0-spec.md`, `localcore-phase5-spec.md`, and the other v1.0
drafts) still contain the pre-resolution wording. They are listed as superseded in the master index
and are not canonical. They were not edited, to preserve the drafting history.

### Final cross-document pass (R11–R13)

- **Test-ID coverage:** every ID defined in a phase spec is referenced by at least one task list —
  P1 (28), P2 (23), P3 (23), P4 (24), P5 (27), P6 (26), plus Phase 0 `G`/`S` IDs. **151 phase tests,
  all mapped.**
- **Semantic spot-check:** the label attached to each renumbered ID in the task lists matches the
  canonical spec table (P2-16/18/20, P3-17/18/19/20/21).
- **Task totals:** actual count (715) matches both indexes; no stale 716 remains.
- **Links:** every markdown link in every file resolves.
- **Stale wording:** the only remaining occurrences of pre-resolution phrases are inside this log,
  where they are quoted deliberately to describe what changed.

---

# 4. Residual items

| Item | Status |
|---|---|
| GATE-1 … GATE-5 | All **open**; none has evidence yet |
| Shell reintroduction | Requires AppContainer-class network containment and its own gate; not scheduled |
| Redaction toggles | Deferred (Phase 6 CL2); preview is display-only in v1 |
| S0.4 voice components | Provisional on simulators until re-validated with real engines (S0.4 G1) |
| Per-request consent vs persistent grants | Resolved as ask-each-time default with explicit upgrade (Phase 6 CL1) |

---

# 5. How to read the document set after these resolutions

1. [localcore-master-index.md](./localcore-master-index.md) — the specification map.
2. [localcore-tasklist-index.md](./localcore-tasklist-index.md) — the implementation map (26 slices).
3. [localcore-release-checklist.md](./localcore-release-checklist.md) — the five gates and their
   evidence.
4. **This log** — where a canonical document and an older draft disagree, the canonical document
   amended by this log is authoritative.
