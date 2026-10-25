# LocalCore — S0.4 Implementation Task List

Slice: **S0.4 — Floor-tier feasibility gate (GATE-1)**
Source: Phase 0 §3.5–§3.7 (test plan, thresholds, deliverable); Build Order §7 (GATE-1).
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

S0.4 is a **measurement and decision slice**, not a feature slice. It answers one question — can the
LLM, avatar, and voice coexist on an 8GB integrated-GPU machine — and produces the profile every
later performance assumption is based on.

**In scope:**
- Reference-machine setup and baseline capture.
- A repeatable scenario harness with a metrics collector and pass/fail evaluation.
- The **real** avatar renderer from S4.1 for the avatar-load components of S4 and S7.
- Calibrated load simulators for pipelines that do not exist yet (STT, TTS, wake word).
- Execution of scenarios S0–S7 and production of the results matrix.
- The GATE-1 decision: recommended floor profile, plus documented fallbacks if thresholds fail.
- Re-validation once the real voice engines land.

**Explicit non-goals (do not build here):**
- No production STT/TTS/wake-word engines (S3.1–S3.3).
- No `ModelProvider` contract work (S1.3) — the harness drives the server directly.
- No memory, tools, or cloud.
- No product polish; the harness is throwaway-by-design except the metrics collector and guardrails.

**Why simulators:** the build order places this gate at wave 3, alongside S3.1 and before S3.2.
Running it early is deliberate — its result re-baselines everything downstream — but the real voice
engines do not exist yet. Scenarios that need them use **calibrated simulators** for the initial run,
and are re-run with real engines at the re-validation checkpoint (§2, Group 7). The gate decision is
provisional until re-validated.

---

## 1. Ordering principles

1. **Environment before baseline** — an unnormalized machine produces unusable numbers.
2. **Baseline before scenarios** — every later comparison is relative to S0.
3. **Harness before runs** — a scenario without a collector is an anecdote.
4. **Calibration before simulated runs** — an uncalibrated simulator invalidates the result.
5. **Individual scenarios before concurrency stress** — S4 assumes S1–S3 behave predictably.
6. **Analysis before decision** — the profile is derived from the matrix, never assumed.
7. **Decision before downstream slices** — S1.4 and later phases consume the profile.
8. **Re-validation is part of the slice**, not an optional follow-up.

---

## 2. Task list

### Group 1 — Reference environment & baseline

**A1 — Reference machines and documentation**

Deliverable: Floor-A and Floor-B configured, documented, and reproducible.

Definition of done:
- [ ] Floor-A (Iris Xe / Vega 8 class, 8GB, 4c/8t, NVMe) and Floor-B (UHD 620 class, 8GB, 4c/8t,
      SATA SSD) are available and labelled.
- [ ] Exact models, drivers, OS build, and power plan are recorded in a machine manifest.
- [ ] The manifest is checked in so runs are attributable to a specific configuration.
- [ ] A run without a matching manifest entry is invalid.

**A2 — Baseline capture (S0)**

Deliverable: the idle reference point.

Definition of done:
- [ ] App open, avatar idle, **no model loaded**; steady-state memory and FPS captured over a fixed
      window.
- [ ] Baseline is captured on both reference machines.
- [ ] Baseline values are stored as the comparison origin for all later scenarios.
- [ ] Baseline is re-captured if the machine configuration changes.

**A3 — Environment normalization**

Deliverable: conditions that make runs comparable.

Definition of done:
- [ ] Power plan pinned to a documented setting (no battery-saver variance).
- [ ] Background applications and updates suppressed for the run.
- [ ] Thermal state and ambient conditions are noted; a thermal-throttled run is flagged.
- [ ] Driver and OS versions are recorded with each run.
- [ ] A normalization checklist is part of the run procedure.

---

### Group 2 — Scenario harness

**B1 — Scenario runner**

Deliverable: scripted, repeatable scenarios.

Definition of done:
- [ ] Each scenario is a script with defined start state, steps, and end condition.
- [ ] Scenarios are parameterized (turn count, duration, which pipelines are active).
- [ ] The runner can execute headlessly without manual interaction.
- [ ] A failed step aborts the scenario and records the failure rather than continuing.

**B2 — Metrics collector**

Deliverable: the metric set from Phase 0 §3.5.

Definition of done:
- [ ] Collects: peak RSS / working set, shared GPU memory, avatar FPS, first-token latency,
      tokens/sec, STT latency, TTS first-audio latency, page faults/sec, crash/OOM count, audio
      dropouts.
- [ ] Uses the S0.2 sampler and process-tree provider, so child-process memory is included.
- [ ] Sampling overhead is measured and shown not to perturb the scenario.
- [ ] Missing metrics are recorded as `unknown`, never as zero.

**B3 — Run isolation and repeatability**

Deliverable: trustworthy, comparable results.

Definition of done:
- [ ] Each scenario runs a minimum of three times; the report shows all runs and the spread.
- [ ] Cold-start and warm-start runs are distinguished.
- [ ] Runs produce a report artifact under `governor/` with a stable format.
- [ ] Run-to-run variance above a documented bound flags the scenario as noisy rather than passing
      it.

**B4 — Pass/fail evaluation**

Deliverable: automatic threshold evaluation.

Definition of done:
- [ ] Thresholds from Phase 0 §3.5 are encoded as data, not prose.
- [ ] Each metric is evaluated per scenario and reported pass/fail with the measured value.
- [ ] A scenario with a noisy result is reported as `inconclusive`, not pass.
- [ ] Failures name the threshold and the responsible pipeline.

---

### Group 3 — Load simulators

**C1 — STT load simulator**

Deliverable: a stand-in for the real speech-to-text pipeline.

Definition of done:
- [ ] Simulates the memory footprint and CPU pattern of whisper.cpp tiny (the floor model).
- [ ] Requests an `stt` lease so serialization behaviour is exercised.
- [ ] Calibration method and source numbers are documented (C4).
- [ ] Clearly labelled as a simulator in every report.

**C2 — TTS load simulator**

Deliverable: a stand-in for the real text-to-speech pipeline.

Definition of done:
- [ ] Simulates the memory footprint and CPU pattern of Piper (the floor engine).
- [ ] Requests a `tts` lease.
- [ ] Can overlap with generation when permitted, to exercise S4.
- [ ] Clearly labelled as a simulator in every report.

**C3 — Wake-word load simulator**

Deliverable: a stand-in for the always-on keyword spotter.

Definition of done:
- [ ] Simulates the steady-state memory and CPU cost of openWakeWord.
- [ ] Runs as a light pipeline, never requesting a heavy slot.
- [ ] Clearly labelled as a simulator in every report.

**C4 — Simulator calibration and honesty**

Deliverable: confidence that simulated results approximate real ones.

Definition of done:
- [ ] Each simulator's parameters are derived from measured engine footprints, with sources
      recorded.
- [ ] Calibration error bounds are stated; if a footprint is unknown, the simulator uses the
      pessimistic end of the range.
- [ ] Every report marks which results are simulated and which are real.
- [ ] The gate decision lists which thresholds rest on simulated data.

---

### Group 4 — Scenario runs

**D1 — S0: baseline idle**
- [ ] Steady-state memory and FPS captured with no model loaded.
- [ ] Result matches A2's baseline (sanity check on the harness).

**D2 — S1: chat cold start**
- [ ] Model load time, first-token latency, and peak RSS captured.
- [ ] Confirms the avatar suspends animation during load and resumes after.
- [ ] Cold start is distinguished from warm start.

**D3 — S2: chat steady state**
- [ ] 20-turn conversation; tokens/sec and avatar FPS during generation captured.
- [ ] Memory trend is analysed for growth (leak detection), not just peak.
- [ ] Result is comparable across the three repeats.

**D4 — S3: voice round trip**
- [ ] PTT → STT → LLM → TTS measured end to end.
- [ ] Governor trace is analysed to confirm **STT and LLM leases never overlap** on floor.
- [ ] Peak memory during the full round trip is captured.
- [ ] Voice latency is recorded even where it exceeds the target, without hiding it.

**D5 — S4: concurrency stress**
- [ ] Chat attempted while TTS is playing and the avatar is animating.
- [ ] Governor must serialize or degrade — the run must **not** OOM or crash.
- [ ] The exact degradation path taken is recorded.
- [ ] This scenario determines whether TTS may overlap generation on floor.

**D6 — S5: idle eviction**
- [ ] Idle past `llmIdleEvictMs`; model evicted.
- [ ] Memory returns within 10% of the S0 baseline.
- [ ] The next turn reloads transparently with no state loss.

**D7 — S6: soak**
- [ ] Two hours with periodic interactions.
- [ ] No memory leak (bounded growth), no crash, stable FPS across the run.
- [ ] Results are reported as a trend, not a single number.

**D8 — S7: wake word armed**
- [ ] Wake-word simulator running alongside the idle avatar.
- [ ] Extra memory and CPU cost measured against S0.
- [ ] Result determines whether wake word can ship on the floor tier at all.

---

### Group 5 — Measurement & analysis

**E1 — Results matrix compilation**

Deliverable: the scenario × metric matrix.

Definition of done:
- [ ] Every scenario has every metric, measured or explicitly `unknown`.
- [ ] Simulated versus real values are distinguished.
- [ ] Each cell shows measured value, threshold, and pass/fail.
- [ ] The matrix is machine-readable so it can be diffed across runs.

**E2 — Failure documentation**

Deliverable: an honest record of what failed.

Definition of done:
- [ ] Every failed threshold is listed with the responsible pipeline.
- [ ] Failures are not averaged away or omitted from the summary.
- [ ] Inconclusive results are listed separately from failures.
- [ ] The report states which thresholds rest on simulated data.

**E3 — Trace analysis**

Deliverable: behavioural findings, not just numbers.

Definition of done:
- [ ] Lease overlap analysis answers "did any two heavy pipelines run concurrently on floor?"
- [ ] Eviction behaviour is confirmed to never interrupt an active lease.
- [ ] Degradation events are correlated with the pressure/ceiling signals that triggered them.
- [ ] Findings are written as short, checkable statements.

---

### Group 6 — Decision & profile

**F1 — Recommended floor profile**

Deliverable: the profile derived from measurements.

Definition of done:
- [ ] The recommended profile sets model size, `avatarFps`, `avatarQuality`, `modelBudgetMB`,
      concurrency rules, and whether wake word and TTS overlap are permitted.
- [ ] Every value is traceable to a measured result, not a preference.
- [ ] The profile is written into the config as the new floor default.
- [ ] Differences from the Phase 0 starting profile are listed explicitly.

**F2 — Fallback documentation**

Deliverable: the documented alternatives if thresholds fail.

Definition of done:
- [ ] Each failed threshold maps to a specific fallback: drop to a 1–2B model, suspend avatar
      animation during generation, serialize TTS behind generation, or disable concurrent wake word.
- [ ] The cost of each fallback (quality, responsiveness, feature availability) is stated.
- [ ] Fallbacks are ordered by preference, not listed as an unordered set.

**F3 — GATE-1 decision record**

Deliverable: the signed-off gate outcome.

Definition of done:
- [ ] The record states: pass / pass-with-fallbacks / fail.
- [ ] It names the reference machines and the build revision tested.
- [ ] It lists the provisional items awaiting re-validation with real voice engines.
- [ ] It is checked in and referenced by later slices.

---

### Group 7 — Re-validation & regression

**G1 — Re-validation with real voice engines**

Deliverable: confirmation or revision once S3.1/S3.2 land.

Definition of done:
- [ ] S3, S4, and S7 are re-run with the real STT/TTS engines replacing the simulators.
- [ ] The results matrix is updated with real values.
- [ ] Any threshold that changes status is flagged, and the floor profile is revised if needed.
- [ ] Simulated results are superseded, not kept alongside as if equally valid.

**G2 — Regression harness for later phases**

Deliverable: a reusable budget check.

Definition of done:
- [ ] The harness can be run against later builds to detect performance regressions.
- [ ] It runs a subset of scenarios (S0, S1, S2, S5) in bounded time.
- [ ] It reports deltas against the recorded baseline, not just absolute values.
- [ ] A regression beyond a documented tolerance fails the check.

**G3 — Budget guardrails for subsequent slices**

Deliverable: constraints later phases must respect.

Definition of done:
- [ ] The measured budget (memory ceiling, heavy-slot limit, FPS floor) is published to the
      implementation team as a constraint.
- [ ] Later slices (S2.x, S3.x, S4.x) reference the budget in their own DoDs.
- [ ] A change that would exceed the budget requires an explicit profile revision, not a silent
      overrun.

---

## 3. Dependency notes

**Slice-level prerequisites: S0.1, S0.2, S0.3, and S4.1.** The avatar components of S4 and S7 use
the **real** renderer from S4.1 — a stub avatar would make the coexistence measurement meaningless,
because the avatar's memory and GPU footprint is exactly what the gate is testing. S4.1 sits at
wave 2 and this slice at wave 3, so the renderer is available when the gate runs.

Only STT, TTS, and wake word use calibrated simulators, because those engines do not exist until
S3.1–S3.3; the gate decision is provisional for those components until S0.4 G1 re-validates with the
real engines.

| Task | Requires | Enables |
|---|---|---|
| A1 | — | A2, A3, all runs |
| A2 | A1 | D1, E1 |
| A3 | A1 | all runs |
| B1 | S0.2-F4 (report writer) | D1–D8 |
| B2 | S0.2-B1/B2 (sampler) | D1–D8, E1 |
| B3 | B1 | D1–D8 |
| B4 | B2, Phase 0 §3.5 thresholds | E2 |
| C1–C3 | S0.2-C1 (leases) | D4, D5, D8 |
| C4 | C1–C3 | E1, F3 |
| D1 | A2, B1–B3 | D2 |
| D2 | D1, S0.3 (server + model) | D3 |
| D3 | D2 | D4, D5 |
| D4 | D3, C1, C2 | E3 |
| D5 | D3, C2, S4.1 (avatar renderer) | E3, F1 |
| D6 | D3 | E3 |
| D7 | D3 | E1 |
| D8 | D3, C3, S4.1 | F1 |
| E1 | D1–D8, B2 | F1 |
| E2 | E1, B4 | F2 |
| E3 | D4, D5, D6 | F1 |
| F1 | E1, E3 | F3, G3 |
| F2 | E2 | F3 |
| F3 | F1, F2 | S1.4, later phases |
| G1 | S3.1, S3.2 | — |
| G2 | E1 | — |
| G3 | F1 | S2.x, S3.x, S4.x |

Parallel opportunities: Group 3 (simulators) can be built while Group 1 (environment) is prepared.
D6 and D7 can run in parallel once D3 completes.

---

## 4. Slice-level Definition of Done

S0.4 is complete when **all** of the following hold:

- [ ] Scenarios S0–S7 have been executed on Floor-A and Floor-B with three repeats each.
- [ ] The results matrix is complete, distinguishing simulated from real values.
- [ ] Pass thresholds are evaluated automatically, with failures and inconclusive results listed.
- [ ] The trace confirms no two heavy pipelines overlapped on floor (or documents the exceptions).
- [ ] The trace confirms eviction never interrupted an active lease.
- [ ] A recommended floor profile is derived from measurements and written into config.
- [ ] Every failed threshold has a documented, ordered fallback.
- [ ] The GATE-1 decision record is signed off and checked in.
- [ ] The provisional items awaiting real-voice re-validation are named explicitly.
- [ ] A regression harness exists for later phases.
- [ ] The measured budget is published as a constraint for subsequent slices.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Simulators do not match real engine footprints | Gate decision is wrong | Calibrate from measured sources, use pessimistic bounds, re-validate with real engines (C4, G1) |
| Reference machine is not representative | Decision over- or under-fits users | Two reference machines, one at the lowest supported tier (A1) |
| Thermal throttling during soak skews results | False failure or false pass | Note thermal state; flag throttled runs (A3) |
| Run-to-run variance mistaken for a real result | Wrong profile | Three repeats, variance bound, `inconclusive` status (B3, B4) |
| Gate passes but later features exceed the budget | Late rework | Publish the budget as a constraint; regression harness (G2, G3) |
| Pressure to "pass" the gate by relaxing thresholds | Unsafe floor experience | Thresholds are fixed data; failures produce fallbacks, not weakened tests (B4, F2) |
| Voice re-validation never happens | Profile rests on simulated data indefinitely | G1 is part of the slice, not a follow-up |

---

## 6. Traceability

| Phase 0 scenario | Task |
|---|---|
| S0 baseline idle | D1 |
| S1 chat cold start | D2 |
| S2 chat steady state | D3 |
| S3 voice round trip | D4, G1 |
| S4 concurrency stress | D5, G1 |
| S5 idle eviction | D6 |
| S6 soak | D7 |
| S7 wake word armed | D8, G1 |

| Phase 0 threshold | Evaluated by |
|---|---|
| 0 crashes / OOM | B4, E1 |
| Peak RSS ≤ 85% of 8GB | B4, E1 |
| Avatar FPS idle ≥ 24 | B4, E1 |
| Avatar FPS during generation ≥ 20 | B4, E1 |
| First token ≤ 3s | B4, E1 |
| STT + LLM concurrency = 0 | E3 |
| Memory after eviction within 10% of S0 | B4, E1 |
| Swap thrash below ceiling | B4, E1 |

GATE-1 output (`F3`) is consumed by S1.4 (latency baseline) and by every later phase as a budget
constraint (`G3`).
