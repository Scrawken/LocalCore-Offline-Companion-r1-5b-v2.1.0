# LocalCore — Implementation Task List Index

Navigable index of every implementation task list, each linked to its source spec, dependencies,
key tests, and gates.

**Companion documents:** [localcore-master-index.md](./localcore-master-index.md) (specs),
[localcore-build-order.md](./localcore-build-order.md) (slices, waves, critical path).

---

# 1. Progress at a glance

| Metric | Value |
|---|---|
| Slices with a task list | **26 of 26 — authoring complete** |
| Total tasks written | **716** |
| Implementation status | **Not started** — no code exists; all gates open |
| Tracks authored | Foundations, Chat core, Memory, Voice, Avatar, Tools, Cloud |
| Gates defined | All five (GATE-1 … GATE-5); none closed |

**"Complete" means the task lists are authored, not that anything is built.** Every gate remains
open until its evidence is produced during implementation (see
[localcore-release-checklist.md](./localcore-release-checklist.md)).

Every task list follows the same structure: slice scope, ordering principles, grouped tasks with a
deliverable and a checkbox Definition of Done each, dependency notes, slice-level DoD, risks, and
traceability.

---

# 2. Slice index

## Track A — Foundations

| Slice | Tasks | Task list | Source spec | Depends on | Key tests | Gate |
|---|---|---|---|---|---|---|
| **S0.1** Foundation & guardrails | 30 | [s01](./localcore-s01-tasklist.md) | Phase 0 §2–§4 | — | G1–G11, no-writes-outside | — |
| **S0.2** Resource Governor & Tier Detector | 26 | [s02](./localcore-s02-tasklist.md) | Phase 0 §3 | S0.1 | governor trace, eviction, tier profile | — |
| **S0.3** Bundled Ollama, auth proxy, containment | 34 | [s03](./localcore-s03-tasklist.md) | Phase 1 §3.3; Phase 0 §2, §4 | S0.1, S0.2 | P1-15 … P1-27 | — |
| **S0.4** Floor-tier feasibility | 28 | [s04](./localcore-s04-tasklist.md) | Phase 0 §3.5–§3.7 | S0.3, S0.2, S4.1 | S0–S7 | **GATE-1** |

## Track B — Chat core

| Slice | Tasks | Task list | Source spec | Depends on | Key tests | Gate |
|---|---|---|---|---|---|---|
| **S1.1** Persona, validation, prompt assembly | 27 | [s11](./localcore-s11-tasklist.md) | Phase 1 §1 | S0.1 | P1-8, P1-9, P1-10, P1-14 | — |
| **S1.2** Chat engine, turn store, streaming | 28 | [s12](./localcore-s12-tasklist.md) | Phase 1 §2 | S0.1, S1.1, S0.2 | P1-1 … P1-7 | — |
| **S1.3** Local provider behind the auth proxy | 29 | [s13](./localcore-s13-tasklist.md) | Phase 1 §3.1, §3.3 | S0.3, S1.2 | P1-19, contract conformance, lease-leak matrix | — |
| **S1.4** Floor model live & latency | 28 | [s14](./localcore-s14-tasklist.md) | Phase 1 §0, §2, §3.3 | S0.4, S1.3 | P1-13, P1-7 (real model) | **GATE-2** |

## Track C — Memory

| Slice | Tasks | Task list | Source spec | Depends on | Key tests | Gate |
|---|---|---|---|---|---|---|
| **S2.1** Stores, encryption, ONNX embedder | 30 | [s21](./localcore-s21-tasklist.md) | Phase 2 §1, §3.3 | S0.1, S0.2, S1.2 | P2-17, P2-22, P2-23 | — |
| **S2.2** Retrieval & memory-block assembly | 32 | [s22](./localcore-s22-tasklist.md) | Phase 2 §1.5, §4.8 | S2.1, S1.1 | P2-4, P2-18 | — |
| **S2.3** Async fact extraction | 29 | [s23](./localcore-s23-tasklist.md) | Phase 2 §3.1 | S2.1, S1.3, S0.2 | P2-19, P2-21 | — |
| **S2.4** Retention/pruning & summaries | 36 | [s24](./localcore-s24-tasklist.md) | Phase 2 §2, §3.2 | S2.1, S2.3, S0.2, S1.3 | P2-7 … P2-13 | **GATE-3** |
| **S2.5** Opt-out transparency controls | 37 | [s25](./localcore-s25-tasklist.md) | Phase 2 §4 | S2.1, S2.2, S2.4, S4.1 | P2-1 … P2-6, P2-14 … P2-16 | — |

## Track D — Voice

| Slice | Tasks | Task list | Source spec | Depends on | Key tests | Gate |
|---|---|---|---|---|---|---|
| **S3.1** PTT STT, capture, VAD, mic indicator | 32 | [s31](./localcore-s31-tasklist.md) | Phase 3 §1, §2, §4, §6 | S0.2, S1.2 | P3-1 … P3-5, P3-9, P3-15, P3-23 | — |
| **S3.2** TTS, barge-in, viseme emission | 23 | [s32](./localcore-s32-tasklist.md) | Phase 3 §3, §3.5 | S3.1, S1.2 | P3-6, P3-7, P3-8, P3-10, P3-19, P3-20, P3-22 | — |
| **S3.3** Opt-in on-device wake word | 23 | [s33](./localcore-s33-tasklist.md) | Phase 3 §5, §7 | S3.1, S0.2 | P3-11 … P3-16 | — |

## Track E — Avatar

| Slice | Tasks | Task list | Source spec | Depends on | Key tests | Gate |
|---|---|---|---|---|---|---|
| **S4.1** Renderer & window modes | 26 | [s41](./localcore-s41-tasklist.md) | Phase 4 §1, §5, §6 | S0.1, S0.2 | P4-14, P4-15, P4-18, P4-20, P4-22, P4-23, P4-24 | — |
| **S4.2** Emotion states & cue resolution | 28 | [s42](./localcore-s42-tasklist.md) | Phase 4 §2 | S1.2, S4.1 | P4-1 … P4-9 | — |
| **S4.3** Lip-sync & idle animation | 31 | [s43](./localcore-s43-tasklist.md) | Phase 4 §3, §4, §6 | S3.2, S4.1, S4.2 | P4-10 … P4-17, P4-21 | — |

## Track F — Tools

| Slice | Tasks | Task list | Source spec | Depends on | Key tests | Gate |
|---|---|---|---|---|---|---|
| **S5.1** Registry, scoped FS, permission tiers | 25 | [s51](./localcore-s51-tasklist.md) | Phase 5 §2, §3, §6.1 | S0.1 | P5-12 … P5-16, P5-23 … P5-27 | — |
| **S5.2** Action Broker, approval UX, audit | 24 | [s52](./localcore-s52-tasklist.md) | Phase 5 §4, §5, §7, §8 | S5.1, S1.2 | P5-1 … P5-11, P5-18 … P5-21 | **GATE-4** |
| **S5.3** Reversibility, quarantine, undo | 20 | [s53](./localcore-s53-tasklist.md) | Phase 5 §8.2 | S5.1, S5.2 | P5-16, P5-17 | — |
| **S5.4** v1 tools live & tier gating | 21 | [s54](./localcore-s54-tasklist.md) | Phase 5 §9, §6.1 | S5.2, S5.3 | P5-22 … P5-25 | — |

## Track G — Cloud

| Slice | Tasks | Task list | Source spec | Depends on | Key tests | Gate |
|---|---|---|---|---|---|---|
| **S6.1** Consent UI & activity view | 25 | [s61](./localcore-s61-tasklist.md) | Phase 6 §2 | S0.1 | P6-2 … P6-11, P6-22, P6-23 | — |
| **S6.2** Cloud providers, BYOK, preview | 26 | [s62](./localcore-s62-tasklist.md) | Phase 6 §3, §4, §5 | S1.2, S3.2, S6.1 | P6-12 … P6-16, P6-19 … P6-21, P6-26 | — |
| **S6.3** End-to-end cloud privacy | 18 | [s63](./localcore-s63-tasklist.md) | Phase 6 §6, §7, §8 | S6.2 | P6-1, P6-17, P6-18, P6-24, P6-25 | **GATE-5** |

---

# 3. Dependency graph (task lists)

    S0.1 ──┬── S0.2 ──┬── S0.3 ── S0.4 ─────────────┐
           │          │                            │
           │          ├── S3.1 ──┬── S3.2 ──┐      │
           │          │         └── S3.3   │      │
           │          ├── S4.1 ──┐         │      │
           │          └── S2.1 ──┼── S2.2  │      │
           │                    ├── S2.3  │      │
           │                    │    └── S2.4     │
           │                    └─────────┴── S2.5
           │                                    │
           ├── S1.1 ── S1.2 ──┬── S1.3 ── S1.4 ──┘
           │                  ├── S2.1
           │                  ├── S3.1
           │                  ├── S4.2 ── S4.3
           │                  ├── S5.2 ──┬── S5.3 ── S5.4
           │                  │          └── S6.2 ── S6.3
           │                  └── S6.1 ──┘
           ├── S5.1 ── S5.2
           └── S6.1 ── S6.2

Reading the graph: an arrow means "must exist before". S0.1 is the only true prerequisite.

---

# 4. Gates

| Gate | Slice | Question | If it fails |
|---|---|---|---|
| **GATE-1** | S0.4 | Can LLM + avatar + voice coexist on 8GB? | Drop to 1–2B; suspend avatar during generation; serialize TTS; disable concurrent wake word |
| **GATE-2** | S1.4 | Is first-token ≤3s achievable on the floor? | Lower the model ceiling, or raise the target explicitly, documenting the quality trade |
| **GATE-3** | S2.4 | Does summarize-before-prune hold under forced failure? | Pruning does not ship; the periodic schedule stays disabled |
| **GATE-4** | S5.2 | Does the approval UX prevent self-authorization and show exact effects? | Tools do not ship |
| **GATE-5** | S6.3 | Zero egress + one-way fallback verified end to end? | Cloud stays disabled by default and the reason is recorded |

---

# 5. Test ID coverage

| Prefix | Phase | Range | Slices | Status |
|---|---|---|---|---|
| `G` | 0 | G1–G11 | S0.1, S0.2 | ✅ |
| `S` | 0 | S0–S7 | S0.4 | ✅ |
| `P1-` | 1 | P1-1–P1-20 | S1.1–S1.4, S0.3 | ✅ |
| `P2-` | 2 | P2-1–P2-23 | S2.1–S2.5 | ✅ |
| `P3-` | 3 | P3-1–P3-23 | S3.1–S3.3 | ✅ |
| `P4-` | 4 | P4-1–P4-24 | S4.1–S4.3 | ✅ |
| `P5-` | 5 | P5-1–P5-27 | S5.1–S5.4 | ✅ |
| `P6-` | 6 | P6-1–P6-26 | S6.1–S6.3 | ✅ |

Every acceptance test in the phase specs now has a home in a task list.

---

# 6. Task count by track

| Track | Slices | Tasks |
|---|---|---|
| A — Foundations | 4 | 118 |
| B — Chat core | 4 | 112 |
| C — Memory | 5 | 164 |
| D — Voice | 3 | 78 |
| E — Avatar | 3 | 85 |
| F — Tools | 4 | 90 |
| G — Cloud | 3 | 69 |
| **Total** | **26** | **716** |

The two heaviest slices — S2.5 (37 tasks, opt-out controls) and S2.4 (36 tasks, destructive
pruning) — sit where the risk is highest, which is consistent with the build's design.

---

# 7. How to use a task list

1. **Read the slice scope** — it states what is explicitly *not* in the slice.
2. **Follow the ordering principles** — they explain why the sequence is what it is.
3. **Work the groups in order** — each group depends on the previous group's outputs.
4. **A task is done when every checkbox passes.**
5. **Check the dependency table** before starting a task.
6. **The slice is done when the slice-level DoD holds**, not when tasks are individually complete.
7. **Gates are stop-ship** — a failed gate produces a documented fallback, never a relaxed test.

---

# 8. Conventions

| Convention | Meaning |
|---|---|
| `S<phase>.<n>` | Slice identifier (e.g. S2.4) |
| `A1`, `B2`, … | Task identifiers within a slice, grouped by letter |
| `P1-13`, `G7`, `S4` | Test identifiers from the phase specs |
| **GATE-n** | A stop-ship decision point |
| Wave | Dependency depth; slices in a wave may be built in parallel |
| **Bold DoD items** | Rules that must not be weakened under schedule pressure |
