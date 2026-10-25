# LocalCore — Document Inventory

Every file in the LocalCore specification set, with version, status, size, and purpose.

**51 files · 18,960 lines** in `files/` — this inventory itself is not counted in those figures.

Status key:
- **Canonical** — authoritative; implement against this.
- **Superseded** — an earlier draft kept for history; do not implement against it.
- **Archive** — a placeholder retained only to avoid a dangling filename.

---

# 1. Summary

| Status | Files | Lines |
|---|---|---|
| Canonical — indexes & cross-cutting | 6 | 1,759 |
| Canonical — phase specs | 7 | 2,660 |
| Canonical — implementation task lists | 26 | 10,844 |
| **Canonical subtotal** | **39** | **15,263** |
| Archive | 1 | 25 |
| Superseded drafts | 11 | 3,672 |
| **Total** | **51** | **18,960** |

---

# 2. Canonical — indexes & cross-cutting

| File | Version | Lines | Purpose |
|---|---|---|---|
| [localcore-master-index.md](./localcore-master-index.md) | — | 378 | Entry point. Document map, reading paths, phase dependency chain, cross-reference map, **consolidated decisions register** (45 decisions + 14 resolutions), test-ID registry, topic index, glossary. |
| [localcore-tasklist-index.md](./localcore-tasklist-index.md) | — | 190 | Implementation map. 26 slices with source spec, dependencies, key tests, gates; dependency graph; per-track task counts. |
| [localcore-build-order.md](./localcore-build-order.md) | — | 201 | Slice decomposition into 24 testable increments across 7 dependency waves; critical path; five gates. |
| [localcore-release-checklist.md](./localcore-release-checklist.md) | — | 441 | Release readiness. GATE-1 … GATE-5 pass criteria, required evidence, failure postures; cross-cutting checks; release posture matrix; sign-off. |
| [localcore-consistency-fixes.md](./localcore-consistency-fixes.md) | — | 330 | **Authoritative resolution log** (R1–R14). Where a canonical document and an older draft disagree, the canonical document amended by this log wins. |
| [localcore-blueprint-v1.md](./localcore-blueprint-v1.md) | v1.0 | 219 | Product blueprint. Vision, principles, 11 locked decisions, phased plan, performance targets (floor row parameterised), privacy matrix, risks. |

---

# 3. Canonical — phase specs

Each is self-contained and consumes the contracts of earlier phases.

| File | Version | Lines | Purpose |
|---|---|---|---|
| [localcore-phase0-spec-v11.md](./localcore-phase0-spec-v11.md) | v1.1 | 478 | **Guardrails.** Egress Gateway contract, consent checks, audit log, Resource Governor, Tier Detector, app-data layout, no-writes-outside. The only hard prerequisite for everything else. |
| [localcore-phase1-spec-v13.md](./localcore-phase1-spec-v13.md) | v1.3 | 518 | **Character & chat.** Persona schema, deterministic prompt assembly, context budget, streaming chat contract, cancel/regenerate, local provider behind the authenticated proxy, egress containment. **§0.1 holds the spike-dependent floor parameter block** (C2, tier profile, GATE-2 target). |
| [localcore-phase2-spec-v11.md](./localcore-phase2-spec-v11.md) | v1.1 | 366 | **Memory.** Four layers (session buffer, transcripts = turn store, summaries, facts), retention/pruning, summarization, embeddings, opt-out transparency controls. |
| [localcore-phase3-spec-v11.md](./localcore-phase3-spec-v11.md) | v1.1 | 326 | **Voice.** Push-to-talk STT, TTS with ≤150ms barge-in, main-process mic indicator, opt-in on-device wake word, audio policy. |
| [localcore-phase4-spec-v11.md](./localcore-phase4-spec-v11.md) | v1.1 | 284 | **Avatar.** Twelve-label emotion taxonomy and cue resolution, lip-sync from Phase 3 visemes, idle animation, window modes (full / overlay / tray-only). |
| [localcore-phase5-spec-v11.md](./localcore-phase5-spec-v11.md) | v1.1 | 415 | **Desktop tools.** Tool registry and scopes, scoped filesystem roots, Action Broker, approval UX, capability tiers, audit, safety properties. Shell excluded. |
| [localcore-phase6-spec-v11.md](./localcore-phase6-spec-v11.md) | v1.1 | 273 | **Optional cloud.** Consent UI flows A–D, cloud providers behind the local contracts, BYOK credential handling, per-request preview, no-account posture. |

---

# 4. Canonical — implementation task lists

26 slices, 715 tasks. Each contains: slice scope, ordering principles, grouped tasks with a
deliverable and checkbox Definition of Done, dependency notes, slice-level DoD, risks, and
traceability.

## Track A — Foundations

| File | Lines | Slice | Gate |
|---|---|---|---|
| [localcore-s01-tasklist.md](./localcore-s01-tasklist.md) | 457 | S0.1 Foundation & guardrails | — |
| [localcore-s02-tasklist.md](./localcore-s02-tasklist.md) | 440 | S0.2 Resource Governor & Tier Detector | — |
| [localcore-s03-tasklist.md](./localcore-s03-tasklist.md) | 541 | S0.3 Bundled Ollama, auth proxy, egress containment | — |
| [localcore-s04-tasklist.md](./localcore-s04-tasklist.md) | 433 | S0.4 Floor-tier feasibility | **GATE-1** |

## Track B — Chat core

| File | Lines | Slice | Gate |
|---|---|---|---|
| [localcore-s11-tasklist.md](./localcore-s11-tasklist.md) | 452 | S1.1 Persona, validation, prompt assembly | — |
| [localcore-s12-tasklist.md](./localcore-s12-tasklist.md) | 468 | S1.2 Chat engine, turn store, streaming | — |
| [localcore-s13-tasklist.md](./localcore-s13-tasklist.md) | 473 | S1.3 Local provider behind the auth proxy | — |
| [localcore-s14-tasklist.md](./localcore-s14-tasklist.md) | 419 | S1.4 Floor model live & latency | **GATE-2** |

## Track C — Memory

| File | Lines | Slice | Gate |
|---|---|---|---|
| [localcore-s21-tasklist.md](./localcore-s21-tasklist.md) | 449 | S2.1 Stores, encryption, ONNX embedder | — |
| [localcore-s22-tasklist.md](./localcore-s22-tasklist.md) | 456 | S2.2 Retrieval & memory-block assembly | — |
| [localcore-s23-tasklist.md](./localcore-s23-tasklist.md) | 440 | S2.3 Async fact extraction | — |
| [localcore-s24-tasklist.md](./localcore-s24-tasklist.md) | 495 | S2.4 Retention/pruning & summaries | **GATE-3** |
| [localcore-s25-tasklist.md](./localcore-s25-tasklist.md) | 509 | S2.5 Opt-out transparency controls | — |

## Track D — Voice

| File | Lines | Slice | Gate |
|---|---|---|---|
| [localcore-s31-tasklist.md](./localcore-s31-tasklist.md) | 443 | S3.1 PTT STT, capture, VAD, mic indicator | — |
| [localcore-s32-tasklist.md](./localcore-s32-tasklist.md) | 353 | S3.2 TTS, barge-in, viseme emission | — |
| [localcore-s33-tasklist.md](./localcore-s33-tasklist.md) | 353 | S3.3 Opt-in on-device wake word | — |

## Track E — Avatar

| File | Lines | Slice | Gate |
|---|---|---|---|
| [localcore-s41-tasklist.md](./localcore-s41-tasklist.md) | 374 | S4.1 Renderer & window modes | — |
| [localcore-s42-tasklist.md](./localcore-s42-tasklist.md) | 387 | S4.2 Emotion states & cue resolution | — |
| [localcore-s43-tasklist.md](./localcore-s43-tasklist.md) | 400 | S4.3 Lip-sync & idle animation | — |

## Track F — Tools

| File | Lines | Slice | Gate |
|---|---|---|---|
| [localcore-s51-tasklist.md](./localcore-s51-tasklist.md) | 377 | S5.1 Registry, scoped FS, permission tiers | — |
| [localcore-s52-tasklist.md](./localcore-s52-tasklist.md) | 395 | S5.2 Action Broker, approval UX, audit | **GATE-4** |
| [localcore-s53-tasklist.md](./localcore-s53-tasklist.md) | 320 | S5.3 Reversibility, quarantine, undo | — |
| [localcore-s54-tasklist.md](./localcore-s54-tasklist.md) | 324 | S5.4 v1 tools live & tier gating | — |

## Track G — Cloud

| File | Lines | Slice | Gate |
|---|---|---|---|
| [localcore-s61-tasklist.md](./localcore-s61-tasklist.md) | 381 | S6.1 Consent UI & activity view | — |
| [localcore-s62-tasklist.md](./localcore-s62-tasklist.md) | 387 | S6.2 Cloud providers, BYOK, preview | — |
| [localcore-s63-tasklist.md](./localcore-s63-tasklist.md) | 318 | S6.3 End-to-end cloud privacy | **GATE-5** |

---

# 5. Archive

| File | Lines | Status | Purpose |
|---|---|---|---|
| [localcore-phase5-spec-final.md](./localcore-phase5-spec-final.md) | 25 | **Archive** | Stub retained to avoid a dangling filename. Points to `localcore-phase5-spec-v11.md` and lists the three differences that matter (shell exclusion, origin-matched grants, P5-22 re-scope). **Do not implement against.** |

---

# 6. Superseded drafts

Kept to preserve drafting history. Each was replaced by the canonical version named below.
They still contain pre-resolution wording and are **not** authoritative.

| File | Lines | Superseded by |
|---|---|---|
| [localcore-blueprint.md](./localcore-blueprint.md) | 278 | `localcore-blueprint-v1.md` |
| [localcore-blueprint-v02.md](./localcore-blueprint-v02.md) | 211 | `localcore-blueprint-v1.md` |
| [localcore-phase0-spec.md](./localcore-phase0-spec.md) | 465 | `localcore-phase0-spec-v11.md` |
| [localcore-phase1-spec.md](./localcore-phase1-spec.md) | 376 | `localcore-phase1-spec-v13.md` |
| [localcore-phase1-spec-v11.md](./localcore-phase1-spec-v11.md) | 374 | `localcore-phase1-spec-v13.md` |
| [localcore-phase1-spec-v12.md](./localcore-phase1-spec-v12.md) | 399 | `localcore-phase1-spec-v13.md` |
| [localcore-phase2-spec.md](./localcore-phase2-spec.md) | 352 | `localcore-phase2-spec-v11.md` |
| [localcore-phase3-spec.md](./localcore-phase3-spec.md) | 309 | `localcore-phase3-spec-v11.md` |
| [localcore-phase4-spec.md](./localcore-phase4-spec.md) | 279 | `localcore-phase4-spec-v11.md` |
| [localcore-phase5-spec.md](./localcore-phase5-spec.md) | 355 | `localcore-phase5-spec-v11.md` |
| [localcore-phase6-spec.md](./localcore-phase6-spec.md) | 274 | `localcore-phase6-spec-v11.md` |

---

# 7. Navigation paths

| You want to… | Start here |
|---|---|
| Understand the product | `localcore-blueprint-v1.md` |
| Know what was decided and why | `localcore-master-index.md` §6 (decisions register) |
| Find a document | `localcore-master-index.md` §2 (document map) |
| Know what was corrected | `localcore-consistency-fixes.md` |
| Understand the build sequence | `localcore-build-order.md` |
| Implement a slice | `localcore-tasklist-index.md` → that slice's task list |
| Understand a phase's contracts | The phase spec, then its task lists |
| Prepare a release | `localcore-release-checklist.md` |

**Reading order for a new implementer:** blueprint → master index §2–§5 → build order → the task
list for your slice → the phase spec it cites.

---

# 8. Files outside `files/`

| Path | Lines | Purpose |
|---|---|---|
| `work/consistency-check.sh` | ~150 | Cross-document consistency harness: link resolution, test-ID coverage, task totals, decision-register completeness, stale-wording detection. Re-run after any bulk edit. |

---

# 9. Status note

**"Complete" in this set means the specification and task lists are authored — not that anything is
built.** No implementation code exists. All five gates (GATE-1 … GATE-5) are **open** until their
evidence is produced during implementation.

**Single source of truth:** `localcore-master-index.md` for specifications and decisions;
`localcore-tasklist-index.md` for implementation slices; `localcore-release-checklist.md` for gate
status. Where any document disagrees with a superseded draft, the canonical document amended by
`localcore-consistency-fixes.md` wins.
