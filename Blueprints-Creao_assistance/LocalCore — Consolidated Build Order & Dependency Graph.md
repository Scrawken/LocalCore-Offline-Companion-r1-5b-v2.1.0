
# LocalCore — Consolidated Build Order & Dependency Graph

Purpose: turn the seven phase specs into a sequence of independently testable slices, so
implementation can proceed in parallel tracks rather than phase-by-phase.

Each slice is a thin vertical increment with its own acceptance criteria (traced to the phase test
IDs). Slices can ship and be tested without later slices existing.

---

# 1. How to read this

- **Slice** — the smallest independently testable increment. Format `S<phase>.<n>`.
- **Wave** — slices at the same dependency depth. Slices in a wave may be built in parallel.
- **Gate** — a decision point where the result can change the plan (e.g. model size, concurrency).
- **Test double** — a stub provider/engine that lets a slice be built before its real dependency
  exists. This is what decouples chat from the model bring-up.

Test doubles used to enable early slices:
- **Provider C (test double)** — deterministic scripted-token model provider (Phase 1 §3.5).
- **Stub STT/TTS** — fixed transcript in, silent audio out.
- **Stub avatar** — renders a static VRM, no emotion or lip-sync.
- **Stub embedder** — deterministic hash vectors.

---

# 2. Dependency graph

    S0.1 Foundation
     ├── S0.2 Governor + Tier Detector
     │    ├── S0.3 Server bring-up + auth proxy
     │    │    └── S0.4 Floor feasibility  [GATE-1]
     │    ├── S3.1 PTT STT + mic indicator
     │    │    ├── S3.2 TTS + barge-in
     │    │    │    └── S4.3 Lip-sync + idle
     │    │    └── S3.3 Wake word
     │    ├── S4.1 Avatar renderer + window modes
     │    │    └── S4.2 Emotion resolution
     │    │         └── S4.3 Lip-sync + idle
     ├── S1.1 Persona + prompt assembly
     │    └── S1.2 ChatEngine + turn store + streaming
     │         ├── S1.3 Local provider behind proxy
     │         │    └── S1.4 Floor model live  [GATE-2]
     │         ├── S2.1 Memory stores + encryption + embedder
     │         │    ├── S2.2 Retrieval + assembly integration
     │         │    ├── S2.3 Fact extraction
     │         │    │    └── S2.4 Retention/pruning + summaries  [GATE-3]
     │         │    │         └── S2.5 Transparency controls
     │         │    └── S2.5 Transparency controls
     │         ├── S5.2 Action Broker + approval UX  [GATE-4]
     │         │    └── S5.3 Reversibility + quarantine + undo
     │         │         └── S5.4 v1 tools live + tier gating
     │         └── S6.2 Cloud providers + BYOK + preview
     │              └── S6.3 End-to-end cloud privacy  [GATE-5]
     ├── S5.1 Tool registry + scoped FS + permission tiers
     │    └── S5.2 Action Broker + approval UX
     └── S6.1 Consent UI + activity view
          └── S6.2 Cloud providers + BYOK + preview

Reading the graph: an arrow means "must exist before". Slices with no arrow between them can be
built concurrently.

---

# 3. Build order (waves)

| Wave | Slices | Theme |
|---|---|---|
| 0 | S0.1 | Foundation & guardrails |
| 1 | S0.2, S1.1, S5.1, S6.1 | Governor, persona, tool registry, consent UI — four independent starts |
| 2 | S0.3, S1.2, S4.1 | Server bring-up, chat engine (test double), avatar renderer |
| 3 | S0.4, S1.3, S2.1, S3.1, S4.2, S5.2 | Feasibility gate, local provider, memory stores, PTT, emotion, broker |
| 4 | S1.4, S2.2, S2.3, S3.2, S3.3, S5.3 | Live model, retrieval, extraction, TTS, wake word, undo |
| 5 | S2.4, S4.3, S5.4, S6.2 | Pruning, lip-sync, tools live, cloud providers |
| 6 | S2.5, S6.3 | Transparency controls, end-to-end cloud privacy |

Wave numbers are dependency depth, not calendar order — waves 1–2 are almost entirely parallel.

---

# 4. Critical path

The longest dependency chain (seven slices, depth 6):

    S0.1 → S1.1 → S1.2 → S2.1 → S2.3 → S2.4 → S2.5

A second chain ties it at depth 6:

    S0.1 → S1.1 → S1.2 → S3.1 → S3.2 → S6.2 → S6.3

Implication: **memory transparency and cloud privacy are the two long poles.** Everything else
(avatar, tools, wake word) can finish earlier or in parallel without extending the schedule.

Note that the floor-feasibility gate (S0.4) is **not** on the longest chain — because chat is built
against a test double (S1.2) while the server is brought up (S0.3–S0.4). That parallelism is
deliberate: the highest-risk item runs alongside the longest chain rather than blocking it.

---

# 5. Parallel tracks

Five tracks can run concurrently once their dependencies are met:

| Track | Slices | Depends on |
|---|---|---|
| A — Foundations | S0.1 → S0.2 → S0.3 → S0.4 | — |
| B — Chat & memory | S1.1 → S1.2 → S1.3 → S1.4; S2.1 → … → S2.5 | A (partly), S0.1 |
| C — Voice & avatar | S3.1 → S3.2 → S3.3; S4.1 → S4.2 → S4.3 | S0.1, S0.2, S1.2 |
| D — Tools | S5.1 → S5.2 → S5.3 → S5.4 | S0.1, S1.2 |
| E — Cloud | S6.1 → S6.2 → S6.3 | S0.1, S1.2, S3.2 |

Track A is the only true serialization constraint; everything else fans out from it.

---

# 6. Slice detail

| Slice | Deliverable | Depends on | Key tests | Gate |
|---|---|---|---|---|
| S0.1 | App skeleton; app-data layout; no-writes-outside; audit + consent stores; Egress Gateway; renderer sandbox + interceptor | — | G1–G11, no-writes-outside | — |
| S0.2 | Resource Governor (leases, eviction, pressure); Tier Detector; resource sampler | S0.1 | governor trace, eviction, tier profile | — |
| S0.3 | Bundled Ollama bring-up; `OLLAMA_MODELS` redirect; loopback bind; auth proxy; egress containment | S0.1, S0.2 | P1-15, P1-16, P1-18, P1-20, P1-23–P1-27 | — |
| S0.4 | Floor-tier feasibility run (S0–S2, S5, S7) | S0.3 | Phase 0 S0–S7 | **GATE-1** |
| S1.1 | Persona schema + validation + deterministic prompt assembly + budget/trimming | S0.1 | P1-8, P1-9, P1-10, P1-14 | — |
| S1.2 | ChatEngine; turn store with `seq`; streaming; cancel; regenerate; thinking indicator (test double) | S0.1, S1.1 | P1-1–P1-7 | — |
| S1.3 | Local provider behind proxy; governor integration; load/unload | S0.3, S1.2 | P1-15–P1-22, P1-27 | — |
| S1.4 | Qwen2.5-3B live; latency measurement | S0.4, S1.3 | P1-13 | **GATE-2** |
| S2.1 | Session buffer; transcript layer = turn store; summary + fact stores; encryption; ONNX embedder | S1.2 | P2-17, P2-22, P2-23 | — |
| S2.2 | Retrieval; memory block assembly; budget-aware selection | S2.1, S1.1 | P2-4, P2-18 | — |
| S2.3 | Async fact extraction; validation; dedupe; user-edited protection; governor deferral | S2.1, S1.3, S0.2 | P2-19, P2-21 | — |
| S2.4 | Pruning job; summarize-before-prune; tombstones; idempotency; pinning | S2.1, S2.3 | P2-7–P2-13 | **GATE-3** |
| S2.5 | First-run disclosure; indicator; unified panel; per-layer delete; wipe-all; write log; toggles | S2.1, S2.2, S2.4 | P2-1–P2-6, P2-14–P2-16 | — |
| S3.1 | Audio capture; VAD; main-owned mic indicator; PTT STT (whisper tiny) | S0.2, S1.2 | P3-1–P3-5, P3-9, P3-23 | — |
| S3.2 | TTS (Piper); barge-in ≤150ms; viseme emission; tier selection | S3.1, S1.2 | P3-6–P3-8, P3-10, P3-19, P3-20, P3-22 | — |
| S3.3 | openWakeWord opt-in; armed indicator; ring buffer; footprint check | S3.1, S0.2 | P3-11–P3-16 | — |
| S4.1 | VRM renderer wiring; AvatarService; full/overlay/tray-only; click-through; persistence | S0.2, S0.1 | P4-14, P4-15, P4-18, P4-19, P4-20, P4-24 | — |
| S4.2 | EmotionResolver; 12-label taxonomy; mapping; decay; min dwell; collapse map; confusion harness | S1.2, S4.1 | P4-1–P4-9 | — |
| S4.3 | LipSyncDriver (viseme + fallback); idle animation; degradation ladder | S3.2, S4.1, S4.2 | P4-10–P4-17, P4-21, P4-22 | — |
| S5.1 | Tool registry; mandatory dryRun; ScopedFileSystem; roots; containment; capability tiers | S0.1 | P5-12–P5-16, P5-23–P5-27 | — |
| S5.2 | Action Broker; ActionPreview (exact target/command/diff); approval UX; nonce; audit | S5.1, S1.2 | P5-1–P5-11, P5-20 | **GATE-4** |
| S5.3 | undoRef; quarantine store; restore; permanent-delete separation | S5.1, S5.2 | P5-16, P5-17 | — |
| S5.4 | Ship read-only tools; gate write/delete/clipboard; shell opt-in | S5.2, S5.3 | P5-23, P5-24, P5-25 | — |
| S6.1 | CloudConsentUI flows A–D; ask-each-time default; revocation; activity view | S0.1 | P6-2–P6-11, P6-22, P6-23 | — |
| S6.2 | CloudModel/Stt/Tts providers; OpenAI-compatible + Anthropic; presets + custom URL; keychain; preview | S1.2, S3.2, S6.1 | P6-12–P6-21, P6-26 | — |
| S6.3 | One-way fallback; no-account; no-telemetry; zero-egress fresh install; audit privacy | S6.2 | P6-1, P6-17, P6-24, P6-25 | **GATE-5** |

---

# 7. Gates (decision points that can change the plan)

| Gate | Slice | Decision | If it fails |
|---|---|---|---|
| **GATE-1** | S0.4 | Can LLM + avatar + voice coexist on 8GB integrated? Which model size, avatar quality, concurrency? | Drop model to 1–2B; disable concurrent wake word; serialize TTS. Re-baseline the floor profile. |
| **GATE-2** | S1.4 | Is first-token ≤3s achievable on the floor? | Lower the model ceiling; raise the latency target; document the trade. |
| **GATE-3** | S2.4 | Does summarize-before-prune hold under failure? | If not, pruning does not ship until it does — data loss is unacceptable. |
| **GATE-4** | S5.2 | Does the approval UX prevent self-authorization and show exact effects? | Tools do not ship; no desktop actions until the gate passes. |
| **GATE-5** | S6.3 | Zero egress on fresh install + one-way fallback verified end to end? | Cloud does not ship until verified. |

Gates are stop-ship conditions, not milestones to pass quickly.

---

# 8. Testing strategy per slice

- **Every slice has a test double path** so it can be verified before its real dependency lands.
  Chat (S1.2) uses Provider C; memory (S2.2) uses the stub embedder; avatar (S4.3) uses stub audio;
  cloud (S6.2) uses a local mock endpoint behind the gateway.
- **Phase test IDs are the acceptance criteria.** Each slice lists the IDs it must satisfy; a slice
  is done when its IDs pass.
- **Gates run the full scenario set** (e.g. GATE-1 runs Phase 0 S0–S7), not a subset.
- **Cross-cutting tests** (no-writes-outside, zero-egress, sandbox) run continuously from S0.1
  onward, not once.

---

# 9. What is deliberately deferred

- Per-request redaction toggles (Phase 6 CL2) — preview is display-only in v1.
- Screen capture tools (Phase 5 T1).
- Anthropic adapter is in v1 (CL4), but further provider adapters are deferred.
- Multi-character UI (schema is ready from S1.1; only one character is surfaced).
- Any hosted service of any kind (D5).

---

# 10. First three moves

1. **S0.1** — app-data layout, audit + consent stores, Egress Gateway, renderer sandbox. This is the
   cheapest slice and the most expensive to retrofit.
2. **S0.2 + S0.3** — governor and server bring-up, in parallel with **S1.1** (persona) and **S1.2**
   (chat on the test double).
3. **S0.4** — run the floor feasibility gate as early as possible. Its outcome re-baselines every
   later performance assumption, and it is off the critical path precisely so it can run without
   blocking chat development.
