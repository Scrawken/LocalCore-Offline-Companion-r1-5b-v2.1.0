# LocalCore — Master Index

Navigable reference for the complete LocalCore specification set: one blueprint, seven phase
technical specs, and a consolidated build order.

**Product:** LocalCore — a Windows desktop AI companion. Local-first, offline-capable, cloud
optional and off by default, fully standalone (no hosted services, no account).

**Status:** all seven phases fully specified; every decision locked; no open items remain.

---

# 1. How to use this index

- **Starting fresh?** Read §2 (document map), then the Blueprint, then the Build Order.
- **Implementing a phase?** Jump to that phase in §2, then §7 (test IDs) and §8 (topic index).
- **Reviewing decisions?** §6 is the full decision registry with IDs and locations.
- **Looking for where something is defined?** §8 maps topics to documents.

Every phase document is self-contained but consumes earlier contracts. §5 shows the couplings.

---

# 2. Canonical document set

| # | Document | Version | Scope | Link |
|---|---|---|---|---|
| 0 | **Blueprint** | v1.0 | Product vision, locked decisions, phased plan, risks | [localcore-blueprint-v1.md](./localcore-blueprint-v1.md) |
| 1 | **Phase 0 — Guardrails** | v1.1 | Egress Gateway, Resource Governor, app-data layout | [localcore-phase0-spec-v11.md](./localcore-phase0-spec-v11.md) |
| 2 | **Phase 1 — Character & Chat** | v1.3 | Persona schema, streaming chat, local + cloud providers | [localcore-phase1-spec-v13.md](./localcore-phase1-spec-v13.md) |
| 3 | **Phase 2 — Memory** | v1.1 | Four memory layers, retention/pruning, transparency controls | [localcore-phase2-spec-v11.md](./localcore-phase2-spec-v11.md) |
| 4 | **Phase 3 — Voice** | v1.1 | PTT STT, TTS barge-in, mic indicator, wake word | [localcore-phase3-spec-v11.md](./localcore-phase3-spec-v11.md) |
| 5 | **Phase 4 — Avatar** | v1.1 | Emotion, lip-sync, idle animation, window modes | [localcore-phase4-spec-v11.md](./localcore-phase4-spec-v11.md) |
| 6 | **Phase 5 — Desktop Tools** | v1.1 | Tool registry, Action Broker, approval UX, scoped FS, audit | [localcore-phase5-spec-v11.md](./localcore-phase5-spec-v11.md) |
| 7 | **Phase 6 — Optional Cloud** | v1.1 | Consent UI, cloud providers, no-account posture | [localcore-phase6-spec-v11.md](./localcore-phase6-spec-v11.md) |
| — | **Build Order & Dependency Graph** | — | 26 testable slices, waves, critical path, gates | [localcore-build-order.md](./localcore-build-order.md) |
| — | **Implementation Task Lists (index)** | — | 26 slice task lists, 715 tasks, per-slice DoD | [localcore-tasklist-index.md](./localcore-tasklist-index.md) |
| — | **Release Readiness Checklist** | — | GATE-1 … GATE-5 pass criteria, evidence, postures | [localcore-release-checklist.md](./localcore-release-checklist.md) |
| — | **Document Inventory** | — | Every file with version, status, size, purpose | [localcore-inventory.md](./localcore-inventory.md) |

### Superseded drafts (kept for history, do not implement)

| Draft | Superseded by |
|---|---|
| `localcore-blueprint.md`, `localcore-blueprint-v02.md` | `localcore-blueprint-v1.md` |
| `localcore-phase0-spec.md` | `localcore-phase0-spec-v11.md` |
| `localcore-phase1-spec.md`, `-v11.md`, `-v12.md` | `localcore-phase1-spec-v13.md` |
| `localcore-phase2-spec.md` | `localcore-phase2-spec-v11.md` |
| `localcore-phase3-spec.md` | `localcore-phase3-spec-v11.md` |
| `localcore-phase4-spec.md` | `localcore-phase4-spec-v11.md` |
| `localcore-phase5-spec.md`, `localcore-phase5-spec-final.md` | `localcore-phase5-spec-v11.md` |
| `localcore-phase6-spec.md` | `localcore-phase6-spec-v11.md` |

---

# 3. Reading paths by role

| Role | Path |
|---|---|
| **Product / stakeholder** | Blueprint → Build Order §3–§5 (waves, critical path, gates) |
| **Architect** | Blueprint → Phase 0 → §5 coupling map below → each phase's architecture section |
| **Implementer, Phase N** | Phase N spec → Build Order slice table for N → test IDs in §7 |
| **Security / privacy reviewer** | Blueprint §3 → Phase 0 §2 (Gateway) → Phase 5 §8 → Phase 6 §2–§5 |
| **QA** | §7 test registry → each phase's acceptance test table |

---

# 4. Document dependency chain

    Blueprint (decisions D1–D11)
       |
       v
    Phase 0  Guardrails ────────────────┐
       |                                 |
       +--> Phase 1  Character & Chat ---+--> Phase 2  Memory
       |         |                       |
       |         +--> Phase 5  Tools      |
       |         |                       |
       |         +--> Phase 3  Voice -----+--> Phase 4  Avatar
       |                   |             |
       |                   +--> Phase 6  Cloud
       |
       +--> Build Order (slices every phase into 24 increments)

Phase 0 is the only hard prerequisite; everything else fans out from it (see Build Order §5).

---

# 5. Cross-reference map (where phases couple)

| Coupling | Defined in | Consumed / extended by |
|---|---|---|
| `EgressScope` enum | Phase 0 §2.3 | Phase 3 adds `network:cloud-voice`; Phase 6 uses all scopes |
| Permission & Consent service | Phase 0 §2.5 | Phase 5 extends with `ToolPermissionService`, roots, capability tiers |
| Audit log | Phase 0 §2.7 | Phase 5 adds `action` category; Phase 6 adds activity view |
| Resource Governor | Phase 0 §3 | Phases 1, 3, 4, 5 all acquire leases; governs deferral everywhere |
| Tier Detector | Phase 0 §3.2 | Drives model/voice/avatar selection in Phases 1, 3, 4 |
| `ModelProvider` contract | Phase 1 §3.1 | Phase 6 implements cloud variants |
| `SttProvider` / `TtsProvider` | Phase 3 §2.1 / §3.1 | Phase 6 implements cloud variants |
| Turn store (`seq`) | Phase 1 §2.1 | **Is** the Phase 2 raw-transcript layer (no second copy) |
| Prompt assembly / budget | Phase 1 §1.4–§1.5 | Phase 2 injects the memory block into it |
| `ChatEvent` stream | Phase 1 §2.2 | Phase 4 emotion cues; Phase 5 model tool proposals |
| `AudioChunk.viseme` | Phase 3 §1 / §3 | Phase 4 lip-sync consumes it (with amplitude fallback) |
| Action Broker | Phase 5 §4 | Uses Phase 0 consent + audit; Phase 6 inherits its approval pattern |
| One-way fallback rule | Phase 1 §0, §3.2 | Enforced end to end in Phase 6 §4 |

---

# 6. Consolidated decisions register

**45 locked decisions** (D1–D11, P1–P4, C1–C6, M1–M4, V1–V5, A1–A5, T1–T5, CL1–CL5) plus
**14 consistency resolutions** (R1–R14).

Each group below names its canonical location. Where a decision has been amended since it was
locked, the **Status** column names the resolution that amended it — see
[localcore-consistency-fixes.md](./localcore-consistency-fixes.md). A decision marked *Amended* keeps
its original choice except as stated.

---

## 6.1 Blueprint (D) — canonical: [localcore-blueprint-v1.md](./localcore-blueprint-v1.md) §1

| ID | Decision | Choice | Status |
|---|---|---|---|
| D1 | Memory default | Opt-out — on by default, user can disable | Locked (consequences clarified by R3) |
| D2 | Companion model | One companion now, multi-character-ready schema | Locked |
| D3 | Voice input | Push-to-talk default, wake word opt-in | Locked |
| D4 | Cloud posture | Optional, off by default | Locked |
| D5 | Hosting | None — fully standalone (no hosted services) | Locked |
| D6 | Hardware floor | 8GB / integrated should work; higher tiers are the real experience | Locked |
| D7 | Retention | Prune raw turns, keep rolled-up summaries | Locked |
| D8 | Memory scope | Facts + full transcripts | Locked |
| D9 | Latency | ≤3s first token on floor | Locked |
| D10 | Wake word phase | Phase 3 | Locked |
| D11 | Hardware tiers | Tier-based, degrade gracefully | Locked |

## 6.2 Phase 0 (P) — canonical: [localcore-phase0-spec-v11.md](./localcore-phase0-spec-v11.md) §0

| ID | Decision | Choice | Status |
|---|---|---|---|
| P1 | Personal-data egress | Prompt first time, then persistent always-allow per scope (category-bound) | Locked |
| P2 | Audit log retention | User-configurable, default 30 days | Locked |
| P3 | Reference machines | Floor-A (Iris Xe/Vega 8) + Floor-B (UHD 620) | Locked |
| P4 | Peak memory ceiling | ≤85% of 8GB (~6.8GB) | Locked |

## 6.3 Phase 1 (C) — canonical: [localcore-phase1-spec-v13.md](./localcore-phase1-spec-v13.md) §0

| ID | Decision | Choice | Status |
|---|---|---|---|
| C1 | Local runtime | Bundled Ollama server | Locked |
| C2 | Floor model | **Spike-dependent** — Phase 1 §0.1. P0 = Qwen2.5-3B-Instruct Q4_K_M; P1 = Qwen2.5-1.5B-Instruct Q4_K_M | Locked (spike-dependent) |
| C3 | Cancel semantics | Keep the user turn; retry/regenerate offered | Locked |
| C4 | First cloud provider | OpenAI-compatible | Locked (extended by CL4 to include Anthropic) |
| C5 | Model delivery | User chooses at install: small installer + download, or offline bundle | Locked (test coverage added by R9) |
| C6 | Local server protection | Authenticated local proxy in front of Ollama | Locked (omitted from the register until R14) |

## 6.4 Phase 2 (M) — canonical: [localcore-phase2-spec-v11.md](./localcore-phase2-spec-v11.md) §0

| ID | Decision | Choice | Status |
|---|---|---|---|
| M1 | Transcript retention | 30 days, user-adjustable | Locked |
| M2 | Pinning | Supported; pinned conversations exempt from pruning | Locked |
| M3 | Extraction timing | After each response, async | Locked |
| M4 | Embedder | MiniLM-class ONNX, bundled, CPU-only | Locked (drives the light classification in R6) |

## 6.5 Phase 3 (V) — canonical: [localcore-phase3-spec-v11.md](./localcore-phase3-spec-v11.md) §0

| ID | Decision | Choice | Status |
|---|---|---|---|
| V1 | Local STT | whisper.cpp tiny + base, tier-based | Locked |
| V2 | Local TTS | Piper (floor) + Kokoro (higher) | Locked |
| V3 | Wake word | openWakeWord | Locked |
| V4 | Barge-in latency | ≤150ms | Locked |
| V5 | Cloud voice | Optional, behind the gateway, off by default | Locked |

## 6.6 Phase 4 (A) — canonical: [localcore-phase4-spec-v11.md](./localcore-phase4-spec-v11.md) §0

| ID | Decision | Choice | Status |
|---|---|---|---|
| A1 | Emotion source | Rules + local sentiment classifier | Locked |
| A2 | Taxonomy | Twelve labels | Locked |
| A3 | Overlay click-through | On by default | Locked |
| A4 | conversationMood | Resets each session | Locked |
| A5 | Idle onset | 15 seconds | Locked |

## 6.7 Phase 5 (T) — canonical: [localcore-phase5-spec-v11.md](./localcore-phase5-spec-v11.md) §0

| ID | Decision | Choice | Status |
|---|---|---|---|
| T1 | v1 tool set | Files + clipboard (no shell, no screen) | Locked |
| T2 | Shell | **Excluded from v1** (originally: opt-in capability, full shell) | **Amended by R4** |
| T3 | Delete | Quarantine by default, recoverable | Locked |
| T4 | Undo | Ships in v1 for reversible actions | Locked |
| T5 | Model access | Read-only on by default; write/delete require enabling | Locked (approval detail amended by R5) |

## 6.8 Phase 6 (CL) — canonical: [localcore-phase6-spec-v11.md](./localcore-phase6-spec-v11.md) §0

| ID | Decision | Choice | Status |
|---|---|---|---|
| CL1 | Default consent mode | Ask each time (strictest) | Locked |
| CL2 | Redaction | Preview display-only in v1; toggles later | Locked |
| CL3 | Endpoints | Presets for common providers + custom URL | Locked |
| CL4 | Providers | OpenAI-compatible + Anthropic | Locked |
| CL5 | Telemetry | None at all | Locked |

## 6.9 Consistency resolutions (R) — canonical: [localcore-consistency-fixes.md](./localcore-consistency-fixes.md) §2

Resolutions are authoritative where an earlier document contradicts them. R4 amended T2; the rest
clarify or correct without changing a locked decision's intent.

| ID | Resolution | Amends | Severity |
|---|---|---|---|
| R1 | S0.4 requires S4.1 (real avatar renderer); simulators only for STT/TTS/wake word | Build order, S0.4 | Blocker |
| R2 | The **provider** owns the `llm` lease; the engine acquires none | Phase 1 §2.3/§2.5, S1.2, S1.3 | Blocker |
| R3 | **Ephemeral sessions:** chat works with nothing persisted when memory is off or unacknowledged | Phase 1 §2.5, Phase 2 §1.2, S1.2 | Blocker |
| R4 | **Shell excluded from v1**; adding it later needs OS-level network containment and its own gate | Phase 5, S5.1, S5.4, T2 | Blocker |
| R5 | **Standing grants are origin-matched**; `high`-risk model-origin and all `destructive` always prompt fresh | Phase 5 §4.2/§5/§8.3, S5.2, S5.4 | Blocker |
| R6 | **Embedding is a light pipeline** | Phase 0 §3.2/§3.3, S0.2 | Consistency |
| R7 | Master index corrected to 26 slices; status semantics defined (authored ≠ implemented) | Master index, task-list index | Consistency |
| R8 | S0.2 → S0.3 is **sequential**, not parallel | Build order §10 | Consistency |
| R9 | Test ownership corrected for P1-15…P1-28; **P1-28 given explicit coverage** | Build order, S0.3, C5 | Consistency |
| R10 | `localcore-phase5-spec-v11.md` is canonical; `-final.md` is an archive stub | Phase 5 files | Consistency |
| R11 | Phase 2 test IDs realigned: budget assembly → P2-20, write log → P2-18, export/import → P2-16 | S2.2, S2.5, indexes | Consistency |
| R12 | Phase 3 test renumbering realigned; P3-17/18/19/21 mapped | S3.1, S3.2, S6.2, indexes | Consistency |
| R13 | Task total corrected from 716 to 715 | Both indexes | Consistency |
| R14 | **C6 was missing from the decisions register** — the true total is 45, not 44 | Master index, inventory | Consistency |

## 6.10 Register summary

| Group | Count | Canonical location |
|---|---|---|
| Blueprint (D) | 11 | blueprint v1 §1 |
| Phase 0 (P) | 4 | phase0 v1.1 §0 |
| Phase 1 (C) | 6 | phase1 v1.3 §0 |
| Phase 2 (M) | 4 | phase2 v1.1 §0 |
| Phase 3 (V) | 5 | phase3 v1.1 §0 |
| Phase 4 (A) | 5 | phase4 v1.1 §0 |
| Phase 5 (T) | 5 | phase5 v1.1 §0 |
| Phase 6 (CL) | 5 | phase6 v1.1 §0 |
| **Decisions total** | **45** | — |
| Consistency resolutions (R) | 14 | consistency-fixes §2 |

**Amendments:** one locked decision has been amended — **T2** (shell), by **R4**. All other
decisions stand as originally locked; R2, R3, R5, and R6 clarify implementation detail without
changing a decision's intent.

---

# 7. Test ID registry

Each phase's acceptance tests are the definition of done for its slices. Build Order §6 maps each
slice to the IDs it must satisfy.

| Prefix | Phase | Range | Domain |
|---|---|---|---|
| `G` | Phase 0 | G1–G11 | Egress Gateway contract |
| `S` | Phase 0 | S0–S7 | Floor-tier governor scenarios |
| `P1-` | Phase 1 | P1-1–P1-20 | Persona, chat, streaming, providers |
| `P2-` | Phase 2 | P2-1–P2-23 | Memory layers, retention, transparency |
| `P3-` | Phase 3 | P3-1–P3-23 | PTT, TTS, barge-in, mic indicator, wake word |
| `P4-` | Phase 4 | P4-1–P4-24 | Emotion, lip-sync, idle, window modes |
| `P5-` | Phase 5 | P5-1–P5-27 | Tool registry, broker, approval, audit |
| `P6-` | Phase 6 | P6-1–P6-26 | Consent UI, cloud providers, no-account |

Full tables live at the end of each phase spec.

---

# 8. Topic index (where is X defined?)

| Topic | Document | Section |
|---|---|---|
| Egress Gateway contract | Phase 0 | §2 |
| Consent checks / personal-data policy | Phase 0 | §2.5 |
| Audit log schema (egress) | Phase 0 | §2.7 |
| Resource Governor interface | Phase 0 | §3.3 |
| Tier profile / floor profile | Phase 0 | §3.2, §3.4 |
| App-data layout | Phase 0 | §4 |
| Persona schema | Phase 1 | §1 |
| Prompt assembly & context budget | Phase 1 | §1.4–§1.5 |
| Streaming chat contract | Phase 1 | §2 |
| Cancel / regenerate semantics | Phase 1 | §2.4 |
| Local server (Ollama) + auth proxy | Phase 1 | §3.3 |
| Egress containment of child processes | Phase 1 | §3.3.5 |
| Memory layers | Phase 2 | §1 |
| Retention & pruning job | Phase 2 | §2 |
| Fact extraction / summarization / embedder | Phase 2 | §3 |
| Transparency controls | Phase 2 | §4 |
| Push-to-talk STT | Phase 3 | §2 |
| TTS & barge-in | Phase 3 | §3 |
| Mic indicator | Phase 3 | §4 |
| Wake word | Phase 3 | §5 |
| Audio policy (persistence) | Phase 3 | §6 |
| Emotion states & cue resolution | Phase 4 | §2 |
| Lip-sync | Phase 4 | §3 |
| Idle animation | Phase 4 | §4 |
| Window modes | Phase 4 | §5 |
| Tool registry & scopes | Phase 5 | §2 |
| Scoped filesystem roots | Phase 5 | §3 |
| Action Broker | Phase 5 | §4 |
| Approval UX | Phase 5 | §5 |
| Capability tiers | Phase 5 | §6.1 |
| Safety properties (injection, quarantine) | Phase 5 | §8 |
| Consent UI flows A–D | Phase 6 | §2 |
| Per-request preview | Phase 6 | §3 |
| Cloud providers | Phase 6 | §4 |
| Credential handling (BYOK) | Phase 6 | §5 |
| Slices, waves, critical path, gates | Build Order | §2–§7 |

---

# 9. Cross-cutting invariants

These recur across phases; a change to one ripples across several documents.

| Invariant | Primary | Also enforced in |
|---|---|---|
| Deny by default; zero egress on fresh install | Phase 0 §2 | Phase 6 §8 (P6-1) |
| One-way fallback (cloud → local only) | Phase 1 §0 | Phase 6 §4, §7 |
| No second copy of raw transcripts | Phase 2 §1.2 | Phase 1 §2.5 |
| Summarize before prune | Phase 2 §2.4 | Build Order GATE-3 |
| Mic indicator owned by main process | Phase 3 §4 | Phase 4 §0 |
| No raw audio persisted by default | Phase 3 §6 | Phase 6 §2.6 |
| Model proposes, never authorizes | Phase 5 §0 | Phase 5 §8.3, Build Order GATE-4 |
| Every action and every egress is audited | Phase 0 §2.7 | Phase 5 §7, Phase 6 §2.5 |
| Avatar degrades before chat | Phase 4 §6 | Phase 0 §3.3 |
| Personal data never leaves without a preview | Phase 0 §2.5 | Phase 6 §2.6 |

---

# 10. Gates (stop-ship conditions)

| Gate | Slice | Question | If it fails |
|---|---|---|---|
| GATE-1 | S0.4 | Can LLM + avatar + voice coexist on 8GB? | Drop to 1–2B model; serialize wake word/TTS |
| GATE-2 | S1.4 | First token ≤3s on floor? | Lower model ceiling; document the trade |
| GATE-3 | S2.4 | Summarize-before-prune holds under failure? | Pruning does not ship |
| GATE-4 | S5.2 | Approval prevents self-authorization, shows exact effects? | Tools do not ship |
| GATE-5 | S6.3 | Zero egress + one-way fallback verified end to end? | Cloud does not ship |

---

# 11. Glossary

| Term | Meaning |
|---|---|
| **Action Broker** | The sole mediator for desktop actions; enforces approval and scoping |
| **BYOK** | Bring your own key — cloud runs on user-supplied credentials, no managed proxy |
| **Collapse map** | Persona-level reduction of the 12 emotion labels to a smaller effective set |
| **Egress Gateway** | The single choke point for all outbound network traffic; deny by default |
| **Floor tier** | 8GB RAM / integrated GPU; the minimum supported machine |
| **Governor** | Resource Governor — mediates heavy/light pipelines and eviction |
| **LIP** | Local Inference Proxy — the authenticated loopback proxy in front of Ollama |
| **Memory layer** | One of: session buffer, raw transcripts, rolling summaries, facts |
| **Personal-data gate** | Forced previewed consent before personal data can leave the device |
| **Quarantine** | App-data holding area for deleted files; recoverable within retention |
| **Slice** | Smallest independently testable build increment (`S<phase>.<n>`) |
| **Tier Detector** | Probes hardware and selects a quality profile |
| **Tombstone** | Minimal record left after pruning, linking to the covering summary |
| **Wave** | Slices at the same dependency depth; may be built in parallel |

---

# 12. Status summary

| Area | Status |
|---|---|
| Decisions | All locked (D1–D11, P1–P4, C1–C5, M1–M4, V1–V5, A1–A5, T1–T5, CL1–CL5) |
| Open items | None |
| Phase specs | 7 of 7 final |
| Build order | 26 slices across 7 waves, 5 gates |
| Task lists | 26 of 26 authored (715 tasks) — **authoring complete; implementation not started** |
| Release checklist | GATE-1 … GATE-5 consolidated with evidence and postures |
| Next action | Begin implementation at S0.1 (app-data layout, audit + consent stores, Egress Gateway, sandbox) |

**Status semantics:** "complete" in this document set means **the specification and task lists are
authored**, not that any implementation exists. No code has been written. Every gate is open until
its evidence is produced during implementation.
