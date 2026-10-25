# LocalCore — S0.2 Implementation Task List

Slice: **S0.2 — Resource Governor & Tier Detector**
Source: Phase 0 spec §3 (resource model, governor interface, floor profile, instrumentation);
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The pipeline taxonomy (heavy vs light) and priority model.
- Tier profiles (floor / mid / high) and their resolution.
- The resource sampler (app memory, process-tree memory, GPU memory, page faults).
- The Tier Detector (probe hardware → tier).
- The Resource Governor: leases, heavy-slot arbitration, priority, blocking-with-timeout,
  degradation, idle/pressure/ceiling eviction, events, stats.
- Instrumentation: lease timeline, memory sampling, latency markers, report writer.
- Behavior tests that run deterministically and offline.

**Explicit non-goals (do not build here):**
- No real model, no Ollama, no provider (S0.3 / S1.3).
- No avatar, voice, or memory pipelines — only the governor's handling of their kinds.
- No scenario runs with real workloads (that is the S0.4 feasibility gate).
- No UI beyond a debug surface for stats and traces.

Rationale: S0.2 builds the machinery; S0.4 uses it to answer the floor-tier question. The two are
separate slices precisely so the governor can be unit-tested without a model and without hardware
variation.

---

## 1. Ordering principles

1. **Taxonomy before profiles** — profiles are expressed in terms of pipeline kinds.
2. **Profiles before the detector** — the detector selects among profiles, so they must exist.
3. **Sampler before eviction** — eviction decisions depend on memory readings.
4. **Leases before arbitration** — arbitration operates on leases.
5. **Arbitration before eviction** — eviction must never remove an actively-leased pipeline.
6. **Core before instrumentation** — there is nothing to trace until the governor works.
7. **Instrumentation before scenario runs** — S0.4 needs the trace and report writer.
8. **Parallelizable:** the sampler and the tier detector can be built concurrently with the
   governor core once the taxonomy and profiles are frozen.

---

## 2. Task list

### Group 1 — Configuration & profiles

**A1 — Pipeline taxonomy and priority model**

Deliverable: the `PipelineKind` taxonomy and the priority ordering.

Definition of done:
- [ ] `PipelineKind` includes heavy (`llm`, `stt`, `tts`) and light (`embedding`, `avatar`,
      `wake-word`) kinds exactly as Phase 0 §3.2 (as revised — `embedding` is light).
- [ ] Priority order is expressed as data: voice round-trip > chat generation > embedding >
      idle maintenance.
- [ ] Adding a new pipeline kind requires no change to arbitration logic (test A1-T1).
- [ ] Heavy/light classification is queryable via a single function.

**A2 — Tier profiles**

Deliverable: floor / mid / high `TierProfile` defaults.

Definition of done:
- [ ] All `TierProfile` fields from Phase 0 §3.2 are present and typed.
- [ ] Floor defaults match Phase 0 §3.4 exactly (`maxConcurrentHeavy: 1`, `modelBudgetMB: 3000`,
      `avatarFps: 24`, `avatarQuality: "low"`, `llmIdleEvictMs: 90000`, `freeMemoryFloorMB: 700`,
      `peakMemoryCeilingMB: 6960`).
- [ ] Mid and high defaults are defined and documented with their rationale.
- [ ] Profiles are immutable once loaded; a change requires an explicit `setProfile`.

**A3 — Profile resolution and persistence**

Deliverable: selection of the active profile from the tier, with user override.

Definition of done:
- [ ] The active profile is persisted in `config/` and restored on restart.
- [ ] A user override can select a profile independently of the detected tier (test A3-T1).
- [ ] An override is recorded so the UI can show "overridden".
- [ ] An invalid or missing profile falls back to floor, never to an undefined state (test A3-T2).

---

### Group 2 — Resource sampler & tier detector

**B1 — System and process memory sampler**

Deliverable: periodic sampling of app memory and system memory.

Definition of done:
- [ ] Samples include main-process RSS, renderer process memory, and system free memory.
- [ ] Sampling is periodic and non-blocking; it never stalls a lease acquisition.
- [ ] The sampler exposes the latest reading synchronously (no await on the hot path).
- [ ] Sampling interval is configurable and documented.

**B2 — Process-tree and GPU memory providers**

Deliverable: best-effort measurement of child-process memory and GPU memory.

Definition of done:
- [ ] A `ProcessTreeMemorySampler` interface exists and sums RSS across the app's child processes
      (required later for the Ollama runner in S0.3).
- [ ] A `GpuMemoryProvider` interface exists with a platform implementation and an explicit
      `unavailable` state.
- [ ] When a measurement is unavailable, the governor treats it as **unknown**, not as zero
      (test B2-T1).
- [ ] No sampling path throws on unsupported hardware; it degrades to unknown.

**B3 — Tier Detector**

Deliverable: hardware probe → tier classification.

Definition of done:
- [ ] Probes total RAM, CPU core count, and GPU adapter information.
- [ ] Classification: floor (8GB, integrated), mid (8–12GB VRAM), high (16GB+ VRAM).
- [ ] **Conservative default:** unknown GPU or no dedicated VRAM → floor (test B3-T1).
- [ ] Detection runs once at startup and can be re-run on demand.
- [ ] The detected tier and its evidence are recorded for the report.

**B4 — Pressure and ceiling signals**

Deliverable: derived signals the governor acts on.

Definition of done:
- [ ] `underPressure` is true when free memory is below `freeMemoryFloorMB`.
- [ ] `nearCeiling` is true when measured resident memory approaches `peakMemoryCeilingMB`.
- [ ] Signals are computed from sampler output, not from ad-hoc reads.
- [ ] Both signals are observable via `stats()`.

---

### Group 3 — Governor core

**C1 — Lease model and registry**

Deliverable: the `Lease` type and acquire/release registry.

Definition of done:
- [ ] `Lease` carries `id`, `kind`, `acquiredAt` (Phase 0 §3.3).
- [ ] Lease ids are unique; the registry can look up any active lease.
- [ ] `stats().activeLeases` reflects the live set exactly (test C1-T1).
- [ ] The registry rejects releasing an unknown or already-released lease.

**C2 — Heavy-slot arbitration and priority**

Deliverable: enforcement of `maxConcurrentHeavy` with priority ordering.

Definition of done:
- [ ] On the floor tier, at most one heavy pipeline holds a slot at any instant (test C2-T1).
- [ ] When multiple waiters queue, the higher-priority waiter is granted next (test C2-T2).
- [ ] Equal priority is served FIFO.
- [ ] Arbitration never busy-waits; it is event-driven.

**C3 — Light-pipeline handling**

Deliverable: light pipelines are throttled, never blocked.

Definition of done:
- [ ] `avatar` and `wake-word` acquisitions always succeed immediately (test C3-T1).
- [ ] Light pipelines receive the current throttle settings (e.g. `avatarFps`) rather than being
      refused.
- [ ] Light pipelines do not consume heavy slots.

**C4 — Blocking acquire with timeout and degradation**

Deliverable: `acquire(kind, { priority, timeoutMs })` semantics.

Definition of done:
- [ ] A blocked acquire waits up to `timeoutMs` and then returns a **degraded** lease, not a
      rejection (test C4-T1).
- [ ] The degraded lease records that it is degraded, so callers can reduce quality.
- [ ] A timeout never leaks a slot or leaves a waiter registered (test C4-T2).
- [ ] A zero or negative timeout degrades immediately.

**C5 — Release semantics and leak prevention**

Deliverable: safe release under success, failure, and cancellation.

Definition of done:
- [ ] Releasing frees the slot and wakes the highest-priority waiter.
- [ ] A lease released twice is a no-op, not an error.
- [ ] An exception path that skips release is caught by a leak test (test C5-T1).
- [ ] A pipeline cannot acquire a slot it already holds (reentrancy guard, test C5-T2).

---

### Group 4 — Eviction

**D1 — Idle eviction**

Deliverable: unload of idle heavy pipelines after `llmIdleEvictMs`.

Definition of done:
- [ ] An idle leased-then-released LLM is evicted after `llmIdleEvictMs` (test D1-T1, injectable
      clock).
- [ ] **An actively-leased pipeline is never evicted** (test D1-T2).
- [ ] `evictIdle()` can be called manually and is idempotent.
- [ ] Eviction emits an `evict` event naming the pipeline and reason `idle`.

**D2 — Pressure eviction**

Deliverable: eviction when free memory drops below `freeMemoryFloorMB`.

Definition of done:
- [ ] Simulated low memory triggers eviction of the LLM before the app risks OOM (test D2-T1).
- [ ] Eviction order respects priority: the lowest-value idle pipeline goes first.
- [ ] An actively-leased pipeline is not evicted; instead the governor emits `pressure` and
      degrades new acquisitions (test D2-T2).
- [ ] Eviction emits an `evict` event with reason `pressure`.

**D3 — Ceiling enforcement**

Deliverable: eviction/degradation as resident memory approaches `peakMemoryCeilingMB`.

Definition of done:
- [ ] Crossing the ceiling triggers eviction or degradation before the ceiling is exceeded
      (test D3-T1).
- [ ] Enforcement uses measured resident memory, including the process tree when available.
- [ ] Unknown measurements do not cause spurious eviction (ties to B2-T1).
- [ ] Eviction emits an `evict` event with reason `ceiling`.

**D4 — Eviction hooks and ordering**

Deliverable: a way for pipelines to be unloaded and for ordering to be deterministic.

Definition of done:
- [ ] Pipelines register an unload hook with the governor.
- [ ] Eviction invokes the hook and waits for completion (bounded) before reclaiming the slot.
- [ ] A failing hook does not block eviction of other pipelines (test D4-T1).
- [ ] Eviction order is documented and deterministic given the same state.

---

### Group 5 — Events & stats

**E1 — Governor events**

Deliverable: `on("pressure" | "evict" | "degrade", cb)`.

Definition of done:
- [ ] `pressure`, `evict`, and `degrade` events fire at the specified moments.
- [ ] Events carry a structured payload (pipeline, reason, timestamp, measurement).
- [ ] A throwing listener cannot break the governor (test E1-T1).
- [ ] Listeners cannot alter decisions.

**E2 — `stats()` snapshot**

Deliverable: the `GovernorStats` snapshot from Phase 0 §3.3.

Definition of done:
- [ ] Includes `activeLeases`, `residentMB`, `evictions`, `lastPressureAt`, and `profile`.
- [ ] `residentMB` is per-pipeline-kind where measurable, `unknown` where not.
- [ ] The snapshot is cheap enough to poll for a debug surface.
- [ ] Snapshot values are consistent with the events emitted (test E2-T1).

---

### Group 6 — Observability & instrumentation

**F1 — Lease timeline recorder**

Deliverable: a per-run record of lease acquire/release events.

Definition of done:
- [ ] Each lease records `kind`, `acquire`, `release`, `degraded`, and `waitMs`.
- [ ] The timeline can answer "did STT and LLM leases ever overlap?" directly (test F1-T1).
- [ ] The recorder has a bounded memory footprint for long runs.
- [ ] Traces are written under the app-data `governor/` directory.

**F2 — Memory sampler logging**

Deliverable: periodic memory samples captured for the run.

Definition of done:
- [ ] Samples are recorded at a fixed interval with a timestamp.
- [ ] Samples include app RSS, process-tree RSS (if available), and free system memory.
- [ ] Sampling continues during scenario runs without measurable overhead (test F2-T1).

**F3 — Latency markers**

Deliverable: a marker API so callers can record stage timings.

Definition of done:
- [ ] A marker API exists for load start/end, first token, and completion.
- [ ] Markers are recorded into the same run trace as leases.
- [ ] Markers are no-ops when tracing is disabled (no overhead in production).

**F4 — Report writer**

Deliverable: the results artifact that S0.4 consumes.

Definition of done:
- [ ] A run produces a report file under `governor/` containing the timeline, memory series, and
      latency markers.
- [ ] Reports are diffable between runs (stable ordering, stable formatting).
- [ ] The report names the tier, profile, and detection evidence.
- [ ] A report can be generated headlessly (no UI required).

---

### Group 7 — Verification

**G1 — Test doubles, injectable clock and memory**

Deliverable: the seams that make the governor testable offline and deterministically.

Definition of done:
- [ ] A fake pipeline registers, acquires, releases, and reports unload.
- [ ] The clock is injectable so idle eviction can be tested without waiting (test G1-T1).
- [ ] The memory source is injectable so pressure and ceiling can be simulated (test G1-T2).
- [ ] No test depends on real hardware or real time.

**G2 — Governor behavior tests**

Deliverable: the behavioral suite for the governor.

Definition of done:
- [ ] Tests cover: heavy-slot limit, priority order, light never blocked, timeout degradation,
      release/leak, reentrancy, idle eviction, pressure eviction, ceiling enforcement, and event
      emission.
- [ ] All tests pass offline and deterministically in CI.
- [ ] Each test names the invariant it protects.

**G3 — Tier detector tests**

Deliverable: classification tests against synthetic hardware profiles.

Definition of done:
- [ ] Synthetic profiles for Floor-A, Floor-B, a mid machine, and a high machine classify
      correctly.
- [ ] An unknown GPU classifies as floor (conservative default).
- [ ] A missing measurement does not throw.
- [ ] Detection evidence is asserted, not just the resulting tier.

**G4 — Instrumentation and report tests**

Deliverable: tests that the trace answers the questions S0.4 will ask.

Definition of done:
- [ ] A scripted overlap of two heavy leases is detectable from the trace (test G4-T1).
- [ ] A report round-trips: written, read back, and diffed identically.
- [ ] Disabling tracing produces no markers and no measurable overhead.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | — | A2, C2, C3 |
| A2 | A1 | A3, D1–D3 |
| A3 | A2, S0.1-B1 (config dir) | B3, E2 |
| B1 | S0.1-B1 | B4, D2, D3, F2 |
| B2 | S0.1-B1 | B4, D3 |
| B3 | A2, B1 | A3 |
| B4 | B1, B2 | D2, D3, E1 |
| C1 | A1 | C2, C5, E2 |
| C2 | C1 | C4, D1 |
| C3 | A1 | — |
| C4 | C2 | E1 |
| C5 | C1 | D1, D4 |
| D1 | C2, C5 | F1 |
| D2 | B4, D4 | — |
| D3 | B4, D4 | — |
| D4 | C5 | D1–D3 |
| E1 | C4, B4, D4 | F1 |
| E2 | C1, A3, B4 | G2 |
| F1 | C1, E1 | F4, G4 |
| F2 | B1 | F4 |
| F3 | — | F4 |
| F4 | F1, F2, F3 | S0.4 |
| G1 | C1, B1 | G2, G3, G4 |
| G2 | G1, C1–C5, D1–D4, E1–E2 | — |
| G3 | G1, B3 | — |
| G4 | F1–F4 | — |

Parallel opportunities: Group 2 (sampler/detector) can run concurrently with Group 3 (governor
core) once Groups 1's A1–A2 are frozen. Group 6 (instrumentation) can begin once Group 5's event
contract is fixed.

---

## 4. Slice-level Definition of Done

S0.2 is complete when **all** of the following hold:

- [ ] `maxConcurrentHeavy` is enforced per tier; on floor, no two heavy pipelines ever overlap
      (C2).
- [ ] Priority ordering is honoured under contention (C2).
- [ ] Light pipelines are never blocked, only throttled (C3).
- [ ] A blocked acquire degrades after its timeout instead of failing or hanging (C4).
- [ ] Idle, pressure, and ceiling eviction all work, and none can evict an actively-leased
      pipeline (D1–D3).
- [ ] Eviction never loses data: an unload hook completes before a slot is reclaimed (D4).
- [ ] The Tier Detector classifies the reference machines correctly and defaults to floor when
      uncertain (B3).
- [ ] A run produces a diffable report with a lease timeline, memory series, and latency markers
      (F4).
- [ ] The trace can directly answer "did two heavy leases ever overlap?" (G4).
- [ ] All behavior tests pass offline and deterministically, with injected clock and memory (G1–G4).
- [ ] No busy-waiting, no lease leaks, no unhandled exceptions on unsupported hardware.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Windows process-tree / GPU memory is hard to measure accurately | Eviction may act on wrong data | Treat unknown as unknown, never as zero (B2); prefer conservative behaviour |
| Per-process GPU memory is not reliably exposed | Ceiling enforcement is approximate | Use process-tree RSS as the primary signal; GPU as secondary evidence |
| Clock-dependent idle eviction is flaky in tests | Unreliable CI | Injectable clock, no real waits (G1) |
| Evicting a pipeline mid-generation | Corrupts a user interaction | Never evict an actively-leased pipeline (D1-T2, D2-T2) |
| Reentrant acquire deadlocks | App hangs | Reentrancy guard (C5-T2) |
| Timeout path leaks a slot | Slow degradation to a stall | Leak tests (C4-T2, C5-T1) |
| Degradation semantics undefined per pipeline | Callers cannot respond | Degraded leases are explicit and carry a reason (C4) |

---

## 6. Traceability

| Phase 0 reference | Covered by |
|---|---|
| §3.2 Pipeline kinds, tiers, `TierProfile` | A1, A2 |
| §3.3 Governor interface (`acquire`/`release`/`evictIdle`/`setProfile`/`stats`/`on`) | C1–C5, D1–D4, E1, E2 |
| §3.3 Priority ordering | A1, C2 |
| §3.3 Blocking with timeout and degradation | C4 |
| §3.3 Idle eviction | D1 |
| §3.3 Pressure eviction | D2, B4 |
| §3.3 Ceiling enforcement | D3, B4 |
| §3.3 Light pipelines throttled | C3 |
| §3.4 Floor profile values | A2 |
| §3.5 Reference machines | G3 |
| §3.6 Instrumentation | F1–F4 |
| §3.7 Results matrix + recommended profile | F4 → consumed by S0.4 |

Scenarios S0–S7 are **not** run in this slice; they run in S0.4 using this slice's machinery.
