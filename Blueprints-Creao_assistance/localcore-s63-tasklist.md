# LocalCore — S6.3 Implementation Task List

Slice: **S6.3 — End-to-end cloud privacy (GATE-5)**
Source: Phase 6 §6 (extended presence), §7 (offline behaviour), §8 (acceptance tests);
S6.1 (consent UI); S6.2 (cloud providers); S0.1 (Egress Gateway).
Build Order §7 (GATE-5).
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

S6.3 is the final slice and the last gate. It verifies the whole privacy posture end to end rather
than adding capability.

**In scope:**
- Zero-egress verification on a fresh install, at the OS level.
- One-way fallback verification under every failure mode.
- No-account and no-telemetry verification.
- Offline and degraded behaviour for cloud features.
- Audit privacy verification across the whole egress surface.
- The GATE-5 decision record.

**Explicit non-goals (do not build here):**
- No new providers, consent flows, or features (S6.1, S6.2).
- No changes to the gateway contract (S0.1).
- No account, sync, or marketplace work — none exists by design.
- No telemetry implementation — none exists by design.

Rationale: this slice exists to *prove* the promises, not to extend them. It is deliberately
separated so the verification is a distinct, auditable activity rather than a checkbox at the end
of feature work.

---

## 1. Ordering principles

1. **Fresh-install verification before enabling anything** — the baseline must be clean.
2. **External verification, not self-report** — the OS firewall, not the app, confirms zero egress.
3. **Fallback verification under forced failure** — the rule is only proven when a failure occurs.
4. **Absence verification for no-account and no-telemetry** — prove the code path does not exist.
5. **Audit privacy across every category** — egress, action, and memory.
6. **GATE-5 before cloud ships.** A failed gate means cloud stays disabled by default and the
   release records why.

---

## 2. Task list

### Group 1 — Zero-egress verification

**A1 — Fresh-install zero egress**

Deliverable: the guarantee behind P6-1.

Definition of done:
- [ ] A fresh install, launched with **all outbound network blocked at the OS level**, produces
      zero successful egress (P6-1).
- [ ] The app remains fully functional offline (chat, memory, voice, avatar).
- [ ] The verification is external: firewall or packet capture, not the app's own assertions.
- [ ] The test runs on both reference machines and in CI/nightly.

**A2 — Egress attempt audit**

Definition of done:
- [ ] Any attempted egress on a fresh install is recorded and is either denied or a
      user-initiated consent event.
- [ ] Update checks, if configured, respect the default-deny posture.
- [ ] No background process (including the bundled server) produces egress (ties to S0.3 E2).
- [ ] The report distinguishes "no attempts" from "attempts denied".

**A3 — Zero-egress after disable**

Deliverable: the guarantee behind P6-23.

Definition of done:
- [ ] After a user disables cloud, the app returns to fully local operation (P6-23).
- [ ] No residual background calls occur after disabling (P6-23).
- [ ] Disabling does not require a restart to take effect.
- [ ] The verification repeats A1's method after disable.

---

### Group 2 — One-way fallback verification

**B1 — Cloud → local fallback**

Deliverable: the permitted direction (P6-17).

Definition of done:
- [ ] On cloud failure (offline, rate limit, provider error, timeout), the request may fall back to
      local with a **visible notice** (P6-17).
- [ ] The fallback preserves conversation history and turn ordering.
- [ ] The fallback is recorded in the audit log.
- [ ] The user can disable fallback if they prefer a hard failure.

**B2 — No local → cloud fallback**

Deliverable: the forbidden direction (P6-17).

Definition of done:
- [ ] A **local** request never falls back to cloud, under any failure (P6-17).
- [ ] The rule is enforced in code, not by convention (test B2-T1).
- [ ] A forced local failure (model load failure, context overflow) produces a local error, never a
      cloud attempt.
- [ ] The absence is asserted by inspecting the egress log after forced failures.

**B3 — Fallback matrix**

Definition of done:
- [ ] The matrix covers: offline, rate limited, provider error, timeout, consent denied, and
      model unavailable.
- [ ] For each, the direction taken is asserted.
- [ ] Consent-denied never triggers a fallback that would circumvent consent.
- [ ] The matrix is part of the GATE-5 evidence.

---

### Group 3 — No-account and no-telemetry verification

**C1 — No account surface**

Deliverable: the guarantee behind P6-24.

Definition of done:
- [ ] No sign-up, login, sync, or marketplace surface exists anywhere in the app (P6-24).
- [ ] No endpoint related to identity or sync is reachable from any code path (test C1-T1).
- [ ] Cloud operates entirely on user-supplied credentials (BYOK).
- [ ] The verification inspects the codebase and the network surface, not just the UI.

**C2 — No telemetry**

Deliverable: the guarantee behind P6-25.

Definition of done:
- [ ] **No telemetry code path exists at all** (P6-25).
- [ ] No analytics library is bundled; a dependency check confirms this (test C2-T1).
- [ ] No crash-reporting upload path exists.
- [ ] The verification is a code and dependency audit, not a runtime observation alone.

**C3 — Scope separation**

Definition of done:
- [ ] Allowing cloud inference does not allow cloud voice, and vice versa (P6-4, P6-16).
- [ ] Model downloads use a separate scope from inference and voice.
- [ ] Each scope's grant is independently revocable.
- [ ] The separation is asserted end to end.

---

### Group 4 — Offline and degraded behaviour

**D1 — Offline behaviour**

Deliverable: the behaviour behind P6-18.

Definition of done:
- [ ] With no network, cloud requests fail with `offline` (P6-18).
- [ ] The app continues on local models without interruption (P6-18).
- [ ] **Inference is never queued** while offline (ties to Phase 0 §2.8).
- [ ] The user is informed that cloud is unavailable, not left waiting.

**D2 — Resumable scopes**

Definition of done:
- [ ] `model-download` and `asset-download` may queue with bounded backoff (Phase 0 §2.8).
- [ ] Queued downloads resume when connectivity returns.
- [ ] A queued download never blocks a chat turn.
- [ ] Queue depth and state are visible.

**D3 — Provider error surfacing**

Definition of done:
- [ ] Rate limits and provider errors are surfaced as recoverable, with a plain-language message.
- [ ] A retry on cloud never occurs without consent (ties to S6.2 B3).
- [ ] Repeated failures back off rather than looping.
- [ ] The user can switch to local from the error surface.

---

### Group 5 — Audit privacy verification

**E1 — Egress audit privacy**

Deliverable: the guarantee behind P6-26.

Definition of done:
- [ ] The egress log contains host, path, categories, decision, and a payload hash — **never
      bodies or query strings** (P6-26).
- [ ] A test sends a distinctive payload and asserts its content appears nowhere in the log
      (P6-26).
- [ ] A test injects a key and asserts it appears nowhere (ties to S6.2 E2).
- [ ] The log is encrypted at rest and user-clearable.

**E2 — Cross-category audit privacy**

Definition of done:
- [ ] Action and memory audit entries also contain no content (ties to S5.2 D3, S2.5 E5).
- [ ] A single test sweep covers all three categories (test E2-T1).
- [ ] Clearing one category does not clear another.
- [ ] Retention applies per the S0.1 configurable window.

**E3 — Activity view fidelity**

Definition of done:
- [ ] The activity view reflects the audit log exactly, with no entries added or hidden.
- [ ] Denied and prompted entries are visible alongside granted ones.
- [ ] The view cannot be used to recover payload content.
- [ ] Filtering and clearing behave as specified in S6.1 E2/E3.

---

### Group 6 — GATE-5 decision

**F1 — Verification report**

Definition of done:
- [ ] A consolidated report covers: zero egress (fresh and after disable), one-way fallback, no
      account, no telemetry, offline behaviour, and audit privacy.
- [ ] Each item states the method used and the evidence.
- [ ] Simulated or partial evidence is labelled as such.
- [ ] The report is diffable between runs.

**F2 — GATE-5 decision record**

Definition of done:
- [ ] The record states pass / pass-with-caveats / fail.
- [ ] It names the build revision and the machines used.
- [ ] It names the tests that prove each claim (P6-1, P6-17, P6-18, P6-24, P6-25, P6-26).
- [ ] It is checked in and referenced by the release checklist.

**F3 — Release posture**

Definition of done:
- [ ] If GATE-5 fails, cloud stays disabled by default and the release records why.
- [ ] A caveat is stated as a caveat, not smoothed into a pass.
- [ ] Any residual risk is documented in the security notes.
- [ ] The decision is revisited when the blocking issue is resolved.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1-E4, S0.3-E4 | A2, F1 |
| A2 | A1, S0.1-F2 | F1 |
| A3 | S6.1-B1, A1 | F1 |
| B1 | S6.2-F3 | B3, F1 |
| B2 | S6.2-F3, S1.3 | B3, F1 |
| B3 | B1, B2 | F1 |
| C1 | S6.2-D2 | C3, F1 |
| C2 | S6.2 (dependency audit) | F1 |
| C3 | S6.2-A4, S6.1-A3 | F1 |
| D1 | S6.2-B3, S1.3 | F1 |
| D2 | S0.1-D6 | F1 |
| D3 | S6.2-B3, D1 | F1 |
| E1 | S6.2-E2, S0.1-F3 | E2, F1 |
| E2 | E1, S5.2-D3, S2.5-E5 | F1 |
| E3 | S6.1-E1, E1 | F1 |
| F1 | A1–A3, B1–B3, C1–C3, D1–D3, E1–E3 | F2 |
| F2 | F1 | F3 |
| F3 | F2 | release |

Parallel opportunities: Groups 1–5 are independent verifications and can run concurrently once
S6.1 and S6.2 are complete.

---

## 4. Slice-level Definition of Done

S6.3 is complete when **all** of the following hold:

- [ ] A fresh install performs zero successful egress, verified externally (P6-1).
- [ ] The app remains fully functional offline with no network (P6-1).
- [ ] Cloud → local fallback works with a visible notice (P6-17).
- [ ] Local → cloud fallback never occurs, under any failure (P6-17).
- [ ] Offline cloud requests fail cleanly and inference is never queued (P6-18).
- [ ] No account, sync, or marketplace surface exists (P6-24).
- [ ] No telemetry code path or dependency exists (P6-25).
- [ ] The audit log contains host/path/categories/hash, never bodies or keys (P6-26).
- [ ] Scope separation holds: inference, voice, and downloads are independently gated (C3).
- [ ] GATE-5 is recorded with pass / pass-with-caveats / fail (F2).
- [ ] If the gate fails, cloud stays disabled by default and the reason is recorded (F3).

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Self-reported zero egress | The claim is unfalsifiable | External verification via OS firewall/packet capture (A1) |
| Local failure silently retried on cloud | Private data leaks at the worst moment | One-way rule enforced in code; forced-failure test (B2) |
| A bundled dependency includes telemetry | Silent data collection | Dependency audit, not just runtime observation (C2) |
| Scope separation drifts | Voice enabled by allowing inference | End-to-end assertion of independence (C3) |
| Audit log accumulates payload content | Sensitive data in the log | Injected-payload absence test across categories (E1, E2) |
| Disable leaves a residual background call | Post-disable egress | Re-run A1's method after disable (A3) |
| GATE-5 caveats smoothed into a pass | Unproven privacy claims ship | F2 requires explicit pass/caveats/fail; F3 enforces posture (F2, F3) |
| Offline queue holds an inference request | Surprise egress when connectivity returns | Inference is never queued (D1) |

---

## 6. Traceability

| Phase 6 reference / test | Covered by |
|---|---|
| §6 Extended presence | D1–D3 |
| §7 Offline and failure behaviour | D1–D3 |
| §8 P6-1 Fresh install zero egress | A1, F1 |
| §8 P6-17 One-way fallback | B1, B2, F1 |
| §8 P6-18 Offline | D1, F1 |
| §8 P6-24 No account | C1, F1 |
| §8 P6-25 No telemetry | C2, F1 |
| §8 P6-26 Audit privacy | E1, E2, F1 |
| §8 P6-23 Disable cloud | A3 |

S6.3 completes the cloud track and the build. Its output (the GATE-5 decision and verification
report) is consumed by the release checklist and by the security notes.
