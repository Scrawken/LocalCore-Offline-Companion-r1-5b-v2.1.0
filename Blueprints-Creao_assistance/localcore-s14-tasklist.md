# LocalCore — S1.4 Implementation Task List

Slice: **S1.4 — Floor model live and latency measurement (GATE-2)**
Source: Phase 1 §0, §2, §3.3; Phase 0 §2 (performance targets); S0.4 (floor profile); S1.3 (provider).
Build Order §7 (GATE-2).
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

S1.4 is a **bring-up and measurement slice**. It puts the real floor model behind the provider and
answers one question — is first-token latency within target on the floor tier — then records the
baseline every later phase is measured against.

**In scope:**
- Wiring the provisioned model into the provider and proving an end-to-end real generation.
- Latency instrumentation: time-to-first-token, full response, tokens/sec, and a stage breakdown.
- Verifying the `thinking` indicator still appears within 300ms with a real (slow) model.
- A measurement harness across tiers and prompt sizes, reporting percentiles.
- Latency optimization within the budget established by S0.4.
- The GATE-2 decision and the recorded latency baseline.
- A regression check for later phases.

**Explicit non-goals (do not build here):**
- No memory, voice, avatar, tools, or cloud.
- No model quality evaluation (prompt quality, persona adherence) — this slice measures speed only.
- No re-running the S0–S7 feasibility scenarios (S0.4 owns those; this slice measures chat latency).
- No changes to the provider contract (S1.3) or the persona schema (S1.1).

Rationale: S0.4 established whether the floor tier fits; S1.4 establishes whether it feels
responsive. Both are gates, and both re-baseline downstream assumptions.

---

## 1. Ordering principles

1. **Real generation before measurement** — there must be a working path before timing it.
2. **Instrumentation before optimization** — optimize what is measured, not what is assumed.
3. **Stage breakdown before tuning** — attribution precedes the fix.
4. **Cold and warm separated** — they have different causes and different fixes.
5. **Percentiles before averages** — tail latency is what users experience.
6. **Decision before baseline publication** — the baseline must reflect the chosen configuration.
7. **The baseline is a constraint**, not a report; later phases are measured against it.

---

## 2. Task list

### Group 1 — Live model bring-up

**A1 — Wire the provisioned model into the provider**

Deliverable: the real model served through S1.3's provider.

Definition of done:
- [ ] The provider resolves the model reference from the S0.3 provisioning result.
- [ ] `capabilities()` reports the real context window and max output for the running model.
- [ ] The model is loaded through the normal path (proxy → server), not a side channel.
- [ ] A generation completes end to end and is persisted as a normal turn (S1.2).

**A2 — End-to-end real smoke test**

Deliverable: proof the full stack works with the real model.

Definition of done:
- [ ] App → authenticated proxy → Ollama → provider → engine → persisted turn, with a real
      response.
- [ ] The response streams incrementally (asserted, not observed).
- [ ] The audit log records the proxied request with caller `lip`.
- [ ] The run is reproducible from a clean install state.

**A3 — Capability verification against the running model**

Deliverable: no capability lies.

Definition of done:
- [ ] The reported context window matches what the model actually accepts (test A3-T1).
- [ ] Exceeding max output is handled by truncation or a structured error, not a silent failure.
- [ ] `supportsTools`/`supportsVision`/`supportsEmbeddings` remain false and are not contradicted
      by the runtime.

---

### Group 2 — Latency instrumentation

**B1 — Time-to-first-token (TTFT)**

Deliverable: the primary metric.

Definition of done:
- [ ] TTFT is measured from the moment the user submits to the first `token` event.
- [ ] TTFT is decomposed into: lease wait, model load (if any), prefill, and network/proxy overhead.
- [ ] Measurement uses a monotonic clock, not wall-clock time (test B1-T1).
- [ ] TTFT is recorded per turn and attached to the turn record for later analysis.

**B2 — Full-response and throughput**

Deliverable: the secondary metrics.

Definition of done:
- [ ] Full response time and tokens/sec are measured and recorded.
- [ ] Tokens/sec is computed over the decode phase, excluding prefill and load.
- [ ] The metrics are recorded per turn without measurable overhead.
- [ ] Metrics are excluded from user-visible output and stored only for diagnostics.

**B3 — Stage breakdown**

Deliverable: attribution for every millisecond.

Definition of done:
- [ ] Each stage (lease wait, load, prefill, decode, proxy, engine) reports its own duration.
- [ ] The stages sum to the measured total within a stated tolerance (test B3-T1).
- [ ] The breakdown is emitted into the S0.2 trace, alongside lease events.
- [ ] An unexplained gap is reported as `unattributed`, never silently absorbed.

**B4 — Thinking-indicator timing with a real model**

Deliverable: perceived responsiveness is preserved.

Definition of done:
- [ ] With the real (slow) model, `thinking` is emitted within 300ms of submit (P1-7).
- [ ] The indicator is emitted **before** model load, proven with a cold start (test B4-T1).
- [ ] The indicator remains visible until the first token arrives.
- [ ] The measured gap between `thinking` and first token is recorded.

**B5 — Cold vs warm start**

Deliverable: the two latency regimes are distinguished.

Definition of done:
- [ ] Cold start (model not resident) and warm start (model resident) are measured separately.
- [ ] The model-load component is isolated and reported on its own.
- [ ] Both regimes are reported; a warm-only number is never presented as the general case
      (test B5-T1).
- [ ] The effect of `llmIdleEvictMs` on the cold-start rate is documented.

---

### Group 3 — Measurement harness

**C1 — Cross-tier latency harness**

Deliverable: the target table, measured.

Definition of done:
- [ ] The harness runs on Floor-A and Floor-B, and on a mid and high machine where available.
- [ ] Results are compared against the Phase 0 §2 targets (floor `floor.firstTokenTargetMs`, mid ≤1.5s, high ≤1s).
- [ ] A tier without hardware available is reported as `not measured`, never assumed.
- [ ] Results are attributed to a machine manifest (S0.4 A1).

**C2 — Prompt-size sweep**

Deliverable: how prompt length affects latency.

Definition of done:
- [ ] TTFT is measured across a range of prompt sizes (persona only, persona + short history,
      persona + long history, persona + memory).
- [ ] The relationship between prompt tokens and prefill time is reported (linearity check).
- [ ] The sweep uses the S1.1 assembler, so trimming behaviour is exercised.
- [ ] The point at which trimming must engage to hold the target is identified.

**C3 — Repeatability and variance**

Definition of done:
- [ ] Each configuration is measured at least 20 times (TTFT is high-variance).
- [ ] Results report p50, p90, and p95 — not only the mean (test C3-T1).
- [ ] A configuration with unstable variance is flagged rather than averaged into a good number.
- [ ] Thermal state and power plan are recorded with the run (S0.4 A3).

**C4 — Report artifact**

Deliverable: a diffable latency report.

Definition of done:
- [ ] The report includes per-stage breakdown, percentiles, prompt sizes, and machine manifest.
- [ ] Cold and warm are separated.
- [ ] The format is stable and diffable across runs.
- [ ] The report is machine-readable for the regression check (F1).

---

### Group 4 — Latency optimization

**D1 — Thread count tuning**

Definition of done:
- [ ] Thread count is swept against TTFT and tokens/sec on both reference machines.
- [ ] The chosen value is recorded in the tier profile, not hard-coded.
- [ ] Oversubscription (threads > physical cores) is shown to hurt or help, with evidence.
- [ ] The choice is re-validated on Floor-B, not assumed from Floor-A.

**D2 — GPU layer offload tuning**

Definition of done:
- [ ] The number of layers offloaded to the integrated GPU is swept.
- [ ] The result accounts for shared-memory contention with the avatar (S0.4 S4).
- [ ] The chosen offload is recorded per tier.
- [ ] A configuration that improves TTFT but violates the memory ceiling is rejected.

**D3 — Context and KV-cache sizing**

Definition of done:
- [ ] Context size is evaluated against TTFT, memory, and quality.
- [ ] The chosen context matches the S1.1 budget model for the tier.
- [ ] Reducing context below the budget is justified by measurement, not convenience.
- [ ] The KV-cache cost is included in the memory accounting reported to the governor.

**D4 — Prompt trimming effectiveness**

Definition of done:
- [ ] The effect of S1.1 trimming on TTFT is measured, not assumed.
- [ ] The relationship between dropped turns and latency improvement is quantified.
- [ ] Trimming is confirmed to keep the prompt within budget without harming coherence beyond an
      acceptable point.
- [ ] Findings are fed back to S1.1 as a budget adjustment if warranted.

**D5 — Pre-warm versus on-demand trade study**

Definition of done:
- [ ] Loading at startup versus on first use is compared for TTFT and idle memory.
- [ ] The trade is stated explicitly (responsiveness vs idle footprint).
- [ ] The chosen behaviour is recorded and consistent with the S0.4 budget.
- [ ] A pre-warm that breaches the memory ceiling is rejected.

**D6 — Quantization check**

Definition of done:
- [ ] Q4_K_M is confirmed as the shipped quantization, or an alternative is justified by measurement.
- [ ] Any change is evaluated for both latency and quality impact.
- [ ] A change that alters the model artifact updates the provisioning metadata and license record.
- [ ] The decision is recorded in the tier profile.

---

### Group 5 — GATE-2 decision & baseline

**E1 — Compare against target**

Deliverable: the pass/fail determination.

Definition of done:
- [ ] Floor TTFT (warm, p50 and p90) is compared against `floor.firstTokenTargetMs`.
- [ ] Cold-start TTFT is reported separately and compared against a stated cold-start target.
- [ ] The comparison uses measured data on the reference machines only.
- [ ] The result is stated plainly as pass, pass-with-caveats, or fail.

**E2 — Document the trade if the target is missed**

Deliverable: the honest fallback.

Definition of done:
- [ ] If floor TTFT exceeds `floor.firstTokenTargetMs`, the fallback is documented (apply profile P1 — lower the model to 1.5B),
      or raise the target, or accept cold-start cost explicitly.
- [ ] The quality cost of a smaller model is stated, not glossed over.
- [ ] The chosen fallback is applied to the tier profile and provisioning configuration.
- [ ] The target is not silently relaxed; a changed target is an explicit decision.

**E3 — GATE-2 decision record**

Deliverable: the signed-off outcome.

Definition of done:
- [ ] The record states: pass / pass-with-caveats / fail, with the measured numbers.
- [ ] It names the model, quantization, context size, thread count, and offload setting used.
- [ ] It names the reference machines and build revision.
- [ ] It is checked in and referenced by later slices.

**E4 — Latency baseline**

Deliverable: the number later phases must not regress.

Definition of done:
- [ ] Baseline TTFT, full-response time, and tokens/sec are recorded per tier.
- [ ] The baseline reflects the final chosen configuration (post-optimization).
- [ ] The baseline includes the prompt size and machine manifest it was measured under.
- [ ] The baseline is published as a constraint alongside the S0.4 memory budget.

---

### Group 6 — Regression guard

**F1 — Latency regression check**

Deliverable: an automated guard against slowdowns.

Definition of done:
- [ ] A bounded check runs a fixed prompt set and compares TTFT against the baseline.
- [ ] A regression beyond a documented tolerance fails the check (test F1-T1).
- [ ] The check distinguishes noise from regression using the variance bound from C3.
- [ ] It runs at least nightly and before release.

**F2 — Latency budget publication**

Definition of done:
- [ ] The per-tier TTFT budget is published to the implementation team.
- [ ] Later slices (S2.x memory, S3.x voice, S4.x avatar) reference the budget in their DoDs.
- [ ] A change that would exceed the budget requires an explicit profile revision.

---

### Group 7 — Verification

**G1 — P1-13**

Definition of done:
- [ ] P1-13 passes: floor first token ≤ `floor.firstTokenTargetMs` (P0: 3s, warm, p50), streaming per Phase 0 thresholds.
- [ ] The test reports cold and warm separately.
- [ ] If the target is missed, the test fails and GATE-2 records the outcome — it is not weakened.

**G2 — Thinking-indicator timing**

Definition of done:
- [ ] With a cold model, `thinking` still appears within 300ms (P1-7).
- [ ] The test proves the indicator precedes model load.

**G3 — Streaming immediacy**

Definition of done:
- [ ] The first token is followed by continuous incremental tokens, with no long stall between
      first and second token (test G3-T1).
- [ ] The full response is not buffered before display.

**G4 — Report completeness**

Definition of done:
- [ ] The report contains per-stage breakdown, percentiles, cold/warm separation, and manifest.
- [ ] Stage durations sum to the total within tolerance.
- [ ] The report is diffable and machine-readable.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S1.3-A1, S0.3-C5 | A2, A3 |
| A2 | A1 | B1–B5 |
| A3 | A1 | G2 |
| B1 | A2 | C1, C2, E1 |
| B2 | A2 | C1, E4 |
| B3 | B1, S0.2-F3 | C4, G4 |
| B4 | A2, S1.2-C2 | G2 |
| B5 | B1 | C3, E1 |
| C1 | B1, B2, S0.4-A1 | E1 |
| C2 | B1, S1.1-D1 | D4 |
| C3 | B1, B5 | F1 |
| C4 | B3, C1 | E3, G4 |
| D1–D3 | C1, C2 | E1 |
| D4 | C2, S1.1-E2 | E1 |
| D5 | B5, S0.4-A2 | E1 |
| D6 | C1 | E1 |
| E1 | C1, D1–D6 | E2, E3 |
| E2 | E1 | E3 |
| E3 | E1, E2, C4 | E4, F2 |
| E4 | E3, B2 | F1, F2 |
| F1 | E4, C3 | — |
| F2 | E4 | S2.x, S3.x, S4.x |
| G1 | A2, B1 | — |
| G2 | A2, B4 | — |
| G3 | A2, B3 | — |
| G4 | C4, B3 | — |

Parallel opportunities: Group 4's tuning tasks (D1–D3) can run in parallel across machines. D5
(pre-warm trade) can run alongside D1–D3 as long as it respects the S0.4 memory ceiling.

---

## 4. Slice-level Definition of Done

S1.4 is complete when **all** of the following hold:

- [ ] The real floor model generates end to end through the normal path, streaming incrementally
      (A2).
- [ ] TTFT is measured with a stage breakdown that sums to the total within tolerance (B1, B3).
- [ ] Cold and warm start are measured and reported separately (B5).
- [ ] Results are reported as p50/p90/p95 over at least 20 runs per configuration (C3).
- [ ] The `thinking` indicator still appears within 300ms with a cold real model (P1-7, G2).
- [ ] The prompt-size sweep identifies where trimming must engage to hold the target (C2).
- [ ] Optimization choices (threads, offload, context, quantization) are recorded in the tier
      profile, not hard-coded (D1–D3, D6).
- [ ] GATE-2 is decided with measured data and recorded as pass / pass-with-caveats / fail (E3).
- [ ] If the target is missed, the fallback is documented and applied, and the target is not
      silently relaxed (E2).
- [ ] A latency baseline is recorded and published as a constraint (E4, F2).
- [ ] An automated latency regression check exists (F1).
- [ ] P1-13 passes on the floor tier, or GATE-2 records the failure honestly (G1).

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| TTFT is high-variance and a single run misleads | Wrong gate decision | ≥20 runs, percentiles, variance flagging (C3) |
| Warm numbers presented as the general case | Users experience cold starts that were never measured | Cold/warm always separated and both reported (B5) |
| Integrated-GPU offload improves TTFT but breaches memory | Violates the S0.4 budget | Reject any configuration that exceeds the ceiling (D2) |
| Prompt-size sweep reveals the budget is too generous | Target unachievable at the configured context | Feed back to S1.1 as a budget adjustment (D4) |
| Model load dominates cold TTFT | Perceived slowness on first use | Measure load separately; decide pre-warm vs on-demand explicitly (B5, D5) |
| Pressure to relax the 3s target to pass the gate | Floor experience quietly degrades | A changed target is an explicit, recorded decision (E2) |
| Optimization overfits Floor-A | Floor-B performs worse | Sweep both reference machines; re-validate (D1) |
| Later phases regress latency unnoticed | Slow drift | Regression check and published budget (F1, F2) |

---

## 6. Traceability

| Phase 1 reference / test | Covered by |
|---|---|
| §0 Latency targets (floor `floor.firstTokenTargetMs`) | E1, G1 |
| §2.3 Thinking indicator within 300ms | B4, G2 |
| §2.3 Streaming begins immediately | G3 |
| §3.3 Governor integration under real load | D1–D3 |
| §3.3.3 Idle eviction cost | B5, D5 |
| P1-13 Floor latency | G1 |
| P1-7 Thinking indicator (with real model) | B4, G2 |

GATE-2 output (E3, E4) is consumed by every later phase as a latency budget constraint (F2), and
by Phase 4's avatar degradation ladder, which must not push TTFT beyond the baseline.
