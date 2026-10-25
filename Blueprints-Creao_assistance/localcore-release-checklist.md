# LocalCore — Release Readiness Checklist

Consolidated checklist for the five stop-ship gates (GATE-1 … GATE-5), plus the cross-cutting
checks that are release-blocking without being gates.

**Companion documents:** [localcore-master-index.md](./localcore-master-index.md),
[localcore-build-order.md](./localcore-build-order.md),
[localcore-tasklist-index.md](./localcore-tasklist-index.md).

---

# 0. Purpose and how to use this

A gate is a **stop-ship condition**, not a milestone. It is closed only when its pass criteria are
met and its evidence exists. A failed gate produces a documented fallback and a recorded posture —
never a relaxed test.

Usage:
1. Work §1 to see the overall state.
2. For each gate, confirm every pass criterion, attach the required evidence, and record the
   outcome.
3. Complete §7's cross-cutting checks.
4. Resolve the posture in §8 and sign §9.

Rules:
- **Evidence must be external where the claim is external.** "The app says it made no network
  calls" is not evidence; the OS firewall is.
- **A caveat is recorded as a caveat**, never smoothed into a pass.
- **A gate that cannot be closed blocks the capability it protects**, not necessarily the release.

---

# 1. Gate summary

| Gate | Slice | Question | Protects | Blocks if failed |
|---|---|---|---|---|
| **GATE-1** | S0.4 | Can LLM + avatar + voice coexist on 8GB, and at what profile? | The floor-tier experience | The floor tier as configured |
| **GATE-2** | S1.4 | Is first-token ≤3s on the floor? | Perceived responsiveness | The chosen model size |
| **GATE-3** | S2.4 | Does summarize-before-prune hold under forced failure? | Conversation history | The pruning feature |
| **GATE-4** | S5.2 | Does approval prevent self-authorization and show exact effects? (shell excluded per R4) | User data and control | All desktop tools |
| **GATE-5** | S6.3 | Zero egress on fresh install + one-way fallback verified? | The local-first promise | Cloud features |

State at a glance (fill at release time):

| Gate | Status | Outcome | Recorded in |
|---|---|---|---|
| GATE-1 | ☐ open ☐ closed | ☐ pass ☐ pass-with-caveats ☐ fail | S0.4 F3 |
| GATE-2 | ☐ open ☐ closed | ☐ pass ☐ pass-with-caveats ☐ fail | S1.4 E3 |
| GATE-3 | ☐ open ☐ closed | ☐ pass ☐ pass-with-caveats ☐ fail | S2.4 G8 |
| GATE-4 | ☐ open ☐ closed | ☐ pass ☐ pass-with-caveats ☐ fail | S5.2 F6 |
| GATE-5 | ☐ open ☐ closed | ☐ pass ☐ pass-with-caveats ☐ fail | S6.3 F2 |

---

# 2. GATE-1 — Floor-tier feasibility

**Slice:** S0.4 · **Protects:** the 8GB / integrated-GPU experience

## 2.1 Pass criteria

- [ ] Scenarios S0–S7 executed on **both** reference machines (Floor-A, Floor-B), three repeats
      each.
- [ ] Zero crashes and zero OOM across all scenarios.
- [ ] Peak RSS ≤ 85% of 8GB (~6.8GB / 6960MB).
- [ ] Avatar FPS ≥ 24 idle, ≥ 20 during generation.
- [ ] STT and LLM leases **never overlap** on the floor tier.
- [ ] Memory returns within 10% of the S0 baseline after eviction.
- [ ] Swap thrash below the defined page-fault ceiling.
- [ ] Wake-word footprint fits the floor budget, or wake word is disabled on the floor with a
      notice.
- [ ] A recommended floor profile is derived from measurements and written into config.
- [ ] Every failed threshold has a documented, ordered fallback.

## 2.2 Required evidence

| Evidence | Source |
|---|---|
| Results matrix (scenario × metric → measured vs threshold) | S0.4 E1 |
| Failure and inconclusive lists | S0.4 E2 |
| Lease-trace analysis (overlap, eviction, degradation) | S0.4 E3 |
| Recommended floor profile + diff from the starting profile | S0.4 F1 |
| Machine manifest (models, drivers, OS build, power plan) | S0.4 A1 |
| Simulator calibration record, with simulated vs real labelled | S0.4 C4 |
| Re-validation results with real voice engines | S0.4 G1 |
| GATE-1 decision record | S0.4 F3 |

Evidence must state which thresholds rest on **simulated** data and whether re-validation has
superseded them.

## 2.3 Failure posture

| Failure | Posture |
|---|---|
| Memory ceiling exceeded | Drop the model to 1–2B; re-baseline the floor profile |
| STT + LLM overlap detected | Serialize voice behind generation; keep the floor tier |
| Avatar FPS below target | Suspend avatar animation during generation; reduce quality |
| Wake-word footprint too large | Disable wake word on the floor tier with a user-visible notice |
| Soak instability or leak | Do not ship the floor tier as supported; document the minimum machine |

The release may proceed with a **reduced floor experience** if the fallbacks are applied and
documented. It may not proceed claiming a floor profile that was not measured.

---

# 3. GATE-2 — Floor latency

**Slice:** S1.4 · **Protects:** perceived responsiveness on the floor tier

## 3.1 Pass criteria

- [ ] Floor first-token latency **≤ 3s** (warm, p50).
- [ ] Results reported as p50 / p90 / p95 over ≥ 20 runs per configuration.
- [ ] Cold and warm start measured and reported **separately**.
- [ ] `thinking` indicator still appears within **300ms** with a cold real model.
- [ ] Streaming is incremental; the first token is followed by continuous tokens with no long
      stall.
- [ ] Stage breakdown sums to the total within tolerance.
- [ ] Optimization choices (threads, GPU offload, context, quantization) recorded in the tier
      profile, not hard-coded.
- [ ] A latency baseline is recorded and published as a constraint.
- [ ] An automated latency regression check exists.

## 3.2 Required evidence

| Evidence | Source |
|---|---|
| Latency report with percentiles and stage breakdown | S1.4 C4 |
| Cold/warm separation and load component | S1.4 B5 |
| Prompt-size sweep identifying where trimming must engage | S1.4 C2 |
| Chosen configuration (threads, offload, context, quantization) | S1.4 D1–D3, D6 |
| Machine manifest | S0.4 A1 |
| Published latency baseline | S1.4 E4 |
| GATE-2 decision record | S1.4 E3 |

## 3.3 Failure posture

| Failure | Posture |
|---|---|
| Warm p50 exceeds 3s | Lower the model ceiling to 1–2B and re-measure; state the quality cost |
| Cold start dominates | Adopt pre-warm or accept cold-start cost explicitly; document it |
| Target unachievable at the configured context | Reduce the context budget and feed back to S1.1 |
| Variance too high to judge | Treat as **inconclusive**, not pass; increase runs or fix the environment |

The target may be **changed explicitly** as a product decision, recorded with its reasoning. It may
not be silently relaxed, and the test must not be weakened to pass.

---

# 4. GATE-3 — Summarize before prune

**Slice:** S2.4 · **Protects:** conversation history from destructive loss

## 4.1 Pass criteria

- [ ] With summarization **forced to fail**, zero deletions occur for that batch.
- [ ] The ordering summarize → verify → delete is enforced in code, with **no alternative path**,
      not even behind a flag.
- [ ] A deleted range is covered by a persisted, verified, non-empty summary.
- [ ] Tombstones keep the conversation coherent; a new turn appends correctly after pruning.
- [ ] The job is idempotent and resumable from every interruption point (after summarize, after
      delete, before tombstone).
- [ ] The active session is never pruned.
- [ ] Pinned conversations are exempt and reported as skipped.
- [ ] `dryRun` reports the full plan with no side effects.
- [ ] Every summarize and prune emits an audit event.
- [ ] The periodic schedule is enabled **only after** this gate passes.

## 4.2 Required evidence

| Evidence | Source |
|---|---|
| P2-8 result with the forced-failure test | S2.4 G3 |
| Ordering assertion (no alternative path) | S2.4 D4 |
| Interruption-point matrix (each stage) | S2.4 G5 |
| Tombstone coherence test | S2.4 G4 |
| Pinning and active-session exemption tests | S2.4 G6, G7 |
| Dry-run report showing no side effects | S2.4 F1 |
| GATE-3 decision record | S2.4 G8 |

## 4.3 Failure posture

| Failure | Posture |
|---|---|
| Deletion occurs without a verified summary | **Pruning does not ship.** Disable the periodic schedule and the prune path entirely |
| Idempotency fails at an interruption point | Pruning does not ship until recovery is proven |
| Tombstone coherence broken | Ship summaries without deletion (retention paused) if the value justifies it |
| Pinned or active session pruned | Pruning does not ship |

This is the least negotiable gate. The failure mode is silent, permanent data loss that a user may
not notice for months. **A release may ship without pruning; it may not ship with unsafe pruning.**

---

# 5. GATE-4 — Action approval and no self-authorization

**Slice:** S5.2 · **Protects:** user data, control, and consent over desktop actions

## 5.1 Pass criteria

- [ ] An unapproved action is blocked, not executed, and surfaced.
- [ ] Approval shows the **exact** target, command, and diff — never a paraphrase.
- [ ] Destructive actions are never persistently auto-approved.
- [ ] The renderer **cannot auto-approve**; the decision carries a nonce validated in the main
      process, and a forged nonce is rejected.
- [ ] A **model-proposed** action always crosses the approval gate.
- [ ] Standing grants are **origin-matched** (R5): a model-origin action can never reuse a
      user-origin grant, and `high`-risk model-origin and all `destructive` actions always require
      fresh approval.
- [ ] **Shell is not shipped** (R4): no tool declaring `shell:execute` can be registered, and the UI
      offers no shell enablement.
- [ ] Content in memory, transcripts, or tool output cannot trigger an action.
- [ ] Approval timeout results in denial.
- [ ] A new scope or root invalidates a grant and re-prompts.
- [ ] Every action, approved or denied, produces exactly one matching audit entry.
- [ ] Every shipped tool's preview matches its actual effect.

## 5.2 Required evidence

| Evidence | Source |
|---|---|
| P5-1 … P5-11 results | S5.2 F2–F4 |
| Forged/replayed nonce rejection test | S5.2 F5 (P5-21) |
| Injection test: memory/tool output cannot trigger an action | S5.2 F5 (P5-19) |
| Model-origin gate test | S5.2 F5 (P5-18) |
| Origin-matched grant test: a model-origin action cannot reuse a user-origin grant | S5.2 F5 |
| Shell-exclusion assertion: no `shell:execute` tool is registrable | S5.4 E1 (P5-22) |
| Preview-versus-effect fidelity test per shipped tool | S5.4 F6 |
| Destructive-never-persistent test | S5.2 F4 (P5-9) |
| GATE-4 decision record | S5.2 F6 |

## 5.3 Failure posture

| Failure | Posture |
|---|---|
| Renderer can forge an approval | **No tools ship.** The gate is defeated at its foundation |
| Preview understates an effect | No mutating tools ship; read-only tools may ship if independently safe |
| Model-origin action bypasses the gate | No tools ship |
| A model-origin action reuses a user-origin grant | Tools do not ship until origin-matching is enforced (R5) |
| Destructive action gets a persistent grant | Destructive tools (delete) do not ship |
| Shell reintroduced without containment | **Blocked.** Shell must not ship; adding it requires OS-level network containment of the entire shell process tree and its own gate (R4) |
| Audit entries missing for denied attempts | Tools do not ship until coverage is complete |

**A release may ship with read-only tools only** if the mutating path fails this gate, provided the
read-only tools are separately verified as non-consequential.

---

# 6. GATE-5 — Cloud privacy end to end

**Slice:** S6.3 · **Protects:** the local-first promise

## 6.1 Pass criteria

- [ ] A fresh install performs **zero successful egress**, verified externally with the OS firewall
      or packet capture.
- [ ] The app remains fully functional offline.
- [ ] After disabling cloud, no residual background calls occur.
- [ ] **Cloud → local** fallback works, with a visible notice.
- [ ] **Local → cloud** fallback never occurs, under any failure.
- [ ] Offline cloud requests fail cleanly; inference is never queued.
- [ ] No account, sign-up, sync, or marketplace surface exists.
- [ ] **No telemetry code path or dependency exists**, confirmed by code and dependency audit.
- [ ] Scope separation holds: inference, voice, and downloads are independently gated.
- [ ] The audit log contains host / path / categories / hash — **never bodies, query strings, or
      keys**.
- [ ] The bundled server's process tree performs no external network access.

## 6.2 Required evidence

| Evidence | Source |
|---|---|
| External zero-egress verification (fresh install) | S0.1 E4, S6.3 A1 |
| Zero-egress verification after cloud disable | S6.3 A3 |
| One-way fallback matrix under forced failures | S6.3 B3 |
| Dependency audit for telemetry/analytics | S6.3 C2 |
| Code/network audit for account and sync surfaces | S6.3 C1 |
| Injected-payload and injected-key absence tests across all audit categories | S6.3 E1, E2 |
| Server containment verification (process tree) | S0.3 E4 |
| GATE-5 decision record | S6.3 F2 |

## 6.3 Failure posture

| Failure | Posture |
|---|---|
| Any successful egress on a fresh install | **Cloud does not ship**; investigate before any release |
| Local → cloud fallback observed | Cloud does not ship until the rule is enforced in code |
| Telemetry dependency found | Remove it; the release is blocked until the dependency graph is clean |
| Audit log contains payloads or keys | Block the release; fix and re-verify |
| Scope separation broken | Disable cloud voice; ship inference only if it is independently verified |

**A release may ship local-only** if GATE-5 fails. The privacy claims in the product copy must then
be scoped to what was actually verified.

---

# 7. Cross-cutting release-blocking checks

These are not gates, but they are release-blocking. Each is verified continuously from S0.1 onward.

## 7.1 Privacy and containment

- [ ] No file is written outside the app-data directory across a full session (watcher test).
- [ ] The renderer cannot reach the network; CSP and interceptor verified.
- [ ] The avatar renderer performs no network access.
- [ ] The bundled server binds loopback only and is unreachable from other processes.
- [ ] The proxy is the only loopback client to the server; the token is never logged.
- [ ] Raw audio is never written to disk unless the user explicitly enabled persistence.
- [ ] **Shell is excluded** from the build (R4): no shell tool is registered, and `shell:execute`
      exists only in the scope vocabulary. No partial shell ships behind a flag.

## 7.2 Opt-out memory promise

The seven controls that make opt-out memory defensible. If any is missing, opt-out memory must be
changed to opt-in for the release.

- [ ] First-run disclosure shown **before any capture**.
- [ ] Capture gate enforced in the service, not only the UI.
- [ ] Persistent memory indicator, main-process owned.
- [ ] Unified panel showing facts, summaries, and raw transcripts with source traces.
- [ ] Per-layer deletion that removes the record **and** its embedding.
- [ ] One-click wipe-all completing within one turn.
- [ ] Memory write log that records references and reasons, never content.
- [ ] Encryption at rest for every layer, including embeddings.
- [ ] **Chat works with memory off** (R3): with memory disabled or the disclosure unacknowledged,
      the session is ephemeral — nothing is persisted — and the UI states plainly that history is
      not being saved.
- [ ] With `transcripts` disabled but facts or summaries enabled, those layers may still be captured
      from the ephemeral session, and that is the asserted behaviour.

## 7.3 Reversibility and control

- [ ] Deletes are quarantined and recoverable within the retention window.
- [ ] A failed quarantine aborts the delete rather than removing the file.
- [ ] Reversible actions expose a working undo.
- [ ] Pinning is shown with its retained transcript volume.

## 7.4 Determinism and provenance

- [ ] Prompt assembly is byte-identical across runs; golden files pass.
- [ ] Retrieval is deterministic; the assembled prompt with memory is stable.
- [ ] Every assistant turn records which provider produced it.
- [ ] Every extracted fact traces to its source turns.

## 7.5 Packaging and legal

- [ ] Bundled third-party licenses included and surfaced (Ollama, whisper.cpp, Piper, Kokoro,
      openWakeWord, MiniLM, model licenses).
- [ ] Model license metadata stored and visible.
- [ ] Integrity manifests present for the server binary, models, and avatar assets.
- [ ] The install-time model-delivery choice works in both modes (small installer and offline
      bundle).
- [ ] Version and build revision recorded in the release notes.

## 7.6 Consistency resolutions applied (R1–R10)

Verified against [localcore-consistency-fixes.md](./localcore-consistency-fixes.md). A regression
here means the shipped document set disagrees with the build.

- [ ] **R1** — S0.4 ran with the real avatar renderer (S4.1), not a stub.
- [ ] **R2** — the provider owns the `llm` lease; no engine-held lease exists in the code.
- [ ] **R3** — ephemeral sessions behave as specified (§7.2).
- [ ] **R4** — shell is excluded; no shell tool can be registered (§5.1, §7.1).
- [ ] **R5** — standing grants are origin-matched (§5.1).
- [ ] **R6** — embedding is classified light and never takes the heavy slot.
- [ ] **R7** — the shipped document set reports 26 slices and defines "complete" as authored.
- [ ] **R8** — S0.2 → S0.3 sequencing honoured in the build.
- [ ] **R9** — P1-28 (install-time delivery choice) is covered and passing.
- [ ] **R10** — no build references the archived `localcore-phase5-spec-final.md`.
- [ ] **R11–R14** — the shipped document set's test IDs, task totals, decision/resolution counts,
      and index figures match the canonical specs.

---

# 8. Release posture matrix

| GATE-1 | GATE-2 | GATE-3 | GATE-4 | GATE-5 | Posture |
|---|---|---|---|---|---|
| ✅ | ✅ | ✅ | ✅ | ✅ | **Full release.** All capabilities, as specified. |
| ✅ | ✅ | ✅ | ✅ | ❌ | **Local-only release.** Cloud removed or disabled by default; privacy copy scoped accordingly. |
| ✅ | ✅ | ✅ | ❌ | — | **No desktop tools.** Chat, memory, voice, avatar ship. Read-only tools only if independently verified. |
| ✅ | ✅ | ❌ | — | — | **No pruning.** Retention paused; summaries may still be generated. Full-fidelity history retained. |
| ✅ | ❌ | — | — | — | **Smaller model.** Floor tier ships at 1–2B with a stated quality cost and an updated baseline. |
| ❌ | — | — | — | — | **Reduced floor tier or raised minimum spec.** Apply the fallbacks; document the supported minimum machine. |
| ❌ | ❌ | ❌ | ❌ | ❌ | **No release.** Re-baseline and re-run the gates. |

Reading the matrix: the columns are independent. A failure in one gate removes a capability or
raises a documented limit; it does not invalidate the others. The only full stop is failing the
foundations the release is built on.

**Non-negotiable combinations:**
- A **failed GATE-3 with pruning enabled** is never acceptable at any combination.
- A **failed GATE-4 with mutating tools enabled** is never acceptable.
- A **failed GATE-5 with cloud enabled by default** is never acceptable.
- **Any** successful egress on a fresh install blocks the release entirely until understood.

---

# 9. Sign-off record

| Gate | Outcome | Caveats recorded | Evidence location | Signed | Date |
|---|---|---|---|---|---|
| GATE-1 | | | | | |
| GATE-2 | | | | | |
| GATE-3 | | | | | |
| GATE-4 | | | | | |
| GATE-5 | | | | | |

Cross-cutting checks (§7): ☐ all pass ☐ exceptions recorded below

Exceptions:

    (record any deviation, its rationale, and the compensating control)

Final release decision: ☐ full ☐ local-only ☐ reduced scope ☐ no release

Build revision: ______________  Reference machines: ______________

---

# 10. Evidence artifact index

| Artifact | Produced by | Used by |
|---|---|---|
| Phase 0 results matrix + floor profile | S0.4 E1, F1 | GATE-1 |
| GATE-1 decision record | S0.4 F3 | §2 |
| Latency report + baseline | S1.4 C4, E4 | GATE-2 |
| GATE-2 decision record | S1.4 E3 | §3 |
| Forced-failure prune evidence | S2.4 G3 | GATE-3 |
| GATE-3 decision record | S2.4 G8 | §4 |
| Approval, nonce, and injection test results | S5.2 F5 | GATE-4 |
| Origin-matched grant and shell-exclusion assertions | S5.2 F5; S5.4 E1 | GATE-4 |
| GATE-4 decision record | S5.2 F6 | §5 |
| External zero-egress and fallback evidence | S6.3 A1, B3 | GATE-5 |
| GATE-5 decision record | S6.3 F2 | §6 |
| No-writes-outside watcher report | S0.1 G3 | §7.1 |
| Memory control verification | S2.5 G2–G9 | §7.2 |
| Quarantine and undo verification | S5.3 F2, F3 | §7.3 |
| Determinism and golden-file results | S1.1 G3, S2.2 G5 | §7.4 |
| License and integrity manifests | S0.3 A1, C4; S4.1 A4 | §7.5 |
| Ephemeral-session test results | S1.2 F1/F3; S2.5 A2 | §7.2 |
| Consistency-resolution verification | consistency-fixes §3 | §7.6 |
