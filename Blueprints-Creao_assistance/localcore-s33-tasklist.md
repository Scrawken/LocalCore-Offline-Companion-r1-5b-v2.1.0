# LocalCore — S3.3 Implementation Task List

Slice: **S3.3 — Opt-in on-device wake word**
Source: Phase 3 §5 (wake word), §7 (governor footprint);
S3.1 (capture, VAD, mic indicator); S0.2 (governor).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The openWakeWord engine, bundled and running on-device.
- Explicit opt-in with disclosure that the mic stays open while armed.
- The armed-listening indicator, distinct from ordinary listening.
- Detection, pre-roll capture, and handoff into the S3.1 PTT/STT flow.
- The rolling in-memory ring buffer and its privacy properties.
- Governor classification as a light pipeline and the floor-tier footprint check.

**Explicit non-goals (do not build here):**
- No cloud wake-word detection, ever.
- No capture, VAD, or indicator infrastructure (S3.1) — this slice reuses them.
- No TTS or barge-in (S3.2).
- No custom wake-word training; only phrases supported by the bundled model.
- No always-listening behaviour without opt-in.

Rationale: wake word is the only feature that keeps the microphone open continuously. It is
separated into its own slice so its privacy properties — opt-in, on-device, visibly armed — can be
verified independently of the voice features that do not require an open mic.

---

## 1. Ordering principles

1. **Opt-in before any listening** — the engine must not start without an explicit, recorded
   consent.
2. **Disclosure before opt-in** — the user must know the mic stays open before enabling.
3. **Armed indicator before arming** — the visible signal must exist before the mic can stay open.
4. **Ring buffer before detection** — detection consumes the buffer.
5. **Detection before handoff** — there must be a trigger before the STT flow runs.
6. **Footprint check before enabling on the floor** — if it does not fit, it does not ship on that
   tier.
7. **On-device is absolute.** No wake-word audio may leave the device under any configuration.

---

## 2. Task list

### Group 1 — Wake-word engine

**A1 — Bundle openWakeWord**

Deliverable: the on-device engine from Phase 3 §5 (V3).

Definition of done:
- [ ] openWakeWord is bundled; no external runtime or download is required.
- [ ] The engine runs entirely on-device (test A1-T1).
- [ ] Model files are integrity-checked at load; a mismatch is fatal with a clear error.
- [ ] The engine performs no network access, verified under the S0.3 containment regime.

**A2 — Supported phrases**

Definition of done:
- [ ] The set of supported phrases is enumerated and documented.
- [ ] Phrase selection is persisted.
- [ ] An unsupported phrase is rejected at configuration time, not silently ignored.
- [ ] The chosen phrase is shown wherever wake word is displayed.

**A3 — Detection**

Definition of done:
- [ ] Detection fires a `detected` event with a confidence score.
- [ ] Detection latency (phrase end → event) is measured and reported.
- [ ] False-accept and false-reject behaviour is characterised and documented.
- [ ] Detection is deterministic for a given audio input (test A3-T1).

---

### Group 2 — Opt-in & disclosure

**B1 — Opt-in requirement**

Deliverable: the gate behind the wake-word default.

Definition of done:
- [ ] Wake word is **off by default** (P3-11).
- [ ] Enabling requires an explicit user action; it cannot be enabled by a config default or a
      migration.
- [ ] The opt-in is recorded with a timestamp and version.
- [ ] Disabling is immediate and stops all listening.

**B2 — Disclosure**

Definition of done:
- [ ] The disclosure states that the microphone stays open while armed (Phase 3 §5.2).
- [ ] It states that detection is on-device and no audio leaves the device.
- [ ] It states how to disable and that disabling is immediate.
- [ ] It is shown before the engine starts, not after.

**B3 — Opt-in revocation**

Definition of done:
- [ ] Disabling stops the engine and closes the microphone (P3-5 interaction).
- [ ] Revocation is immediate with no restart.
- [ ] Revocation is recorded in the audit/log surfaces.
- [ ] Re-enabling requires the disclosure path again, not a silent toggle.

---

### Group 3 — Armed indicator

**C1 — Distinct armed state**

Deliverable: the visible signal required while listening (P3-13).

Definition of done:
- [ ] The mic indicator shows a state **distinct from ordinary listening** while wake word is
      armed (P3-13).
- [ ] The state is always visible when armed; it cannot be hidden by the renderer (ties to S3.1 C1).
- [ ] The state is present in full, overlay, and tray-only modes.
- [ ] The indicator distinguishes `armed` from `detected` and from `listening`.

**C2 — State transitions**

Definition of done:
- [ ] Transitions: `disabled` → `armed` → `detected` → `listening` → back to `armed`.
- [ ] Transitions are explicit and testable (test C2-T1).
- [ ] An error state is visible, not silent.
- [ ] The indicator never shows `armed` when the engine is not running.

---

### Group 4 — Detection & handoff

**D1 — Detection to capture**

Definition of done:
- [ ] On detection, capture continues using the pre-roll buffer so the first syllable is not lost
      (Phase 3 §5.3).
- [ ] VAD ends the utterance on silence.
- [ ] The utterance is transcribed through the normal S3.1 path.
- [ ] The transcript is handed to the ChatEngine as a normal user turn.

**D2 — Re-arm behaviour**

Definition of done:
- [ ] After the response, the engine returns to `armed` or remains per the user's setting
      (Phase 3 §5.3).
- [ ] Re-arming does not drop the disclosure or the indicator.
- [ ] A detection during playback respects barge-in semantics (ties to S3.2 C1).
- [ ] Re-arm is bounded: repeated detections cannot create overlapping captures.

**D3 — Interaction with PTT**

Definition of done:
- [ ] PTT and wake word do not conflict: PTT takes precedence while held (test D3-T1).
- [ ] A wake-word detection while PTT is active is ignored or queued per a documented rule.
- [ ] Mute suppresses both (ties to S3.1 C3).
- [ ] The indicator reflects whichever mode is active.

---

### Group 5 — Ring buffer & privacy

**E1 — Rolling in-memory buffer**

Definition of done:
- [ ] Audio is held in a small rolling buffer, continuously overwritten (Phase 3 §5.2).
- [ ] The buffer is in memory only and **never persisted** (P3-12).
- [ ] Buffer size is bounded and documented.
- [ ] Buffer contents are never written to a log, trace, or crash dump.

**E2 — No egress**

Definition of done:
- [ ] No wake-word audio leaves the device under any configuration (P3-12).
- [ ] The engine is contained under the same OS-level restriction as the bundled server.
- [ ] A network-activity test over an armed session shows zero related egress (test E2-T1).
- [ ] Enabling wake word does not enable or imply any cloud voice scope.

**E3 — False-accept handling**

Definition of done:
- [ ] A false accept that yields no speech produces no turn (ties to S3.1 B3).
- [ ] The engine returns to `armed` without user action.
- [ ] Repeated false accepts are counted so tuning is data-driven.
- [ ] False accepts do not open the mic indefinitely (a timeout returns to `armed`).

---

### Group 6 — Governor & footprint

**F1 — Light-pipeline classification**

Definition of done:
- [ ] Wake word is classified as a **light** pipeline, like the avatar (Phase 3 §7).
- [ ] It never requests a heavy slot (test F1-T1).
- [ ] It yields to generation and voice under the priority order.
- [ ] It does not prevent the chat model from being evicted when idle.

**F2 — Floor-tier footprint**

Deliverable: the check behind P3-16.

Definition of done:
- [ ] The steady-state memory and CPU cost of an armed engine is measured against the S0.4 S7
      scenario (P3-16).
- [ ] If it does not fit alongside the idle avatar within the floor budget, wake word is **disabled
      on the floor tier** with a clear notice (P3-16).
- [ ] The decision is recorded in the tier profile, not hard-coded.
- [ ] Higher tiers enable it by default subject to opt-in.

**F3 — Battery and thermal consideration**

Definition of done:
- [ ] Continuous listening cost is documented for laptop users.
- [ ] The engine pauses on battery-saver if the platform signals it (test F3-T1).
- [ ] Pausing is visible in the indicator (not silently disarmed).
- [ ] Resuming requires no user action when conditions improve.

---

### Group 7 — Verification

**G1 — Test doubles**

Definition of done:
- [ ] A synthetic audio source can emit the wake phrase and near-miss phrases.
- [ ] The engine can be run headlessly for footprint measurement.
- [ ] The governor's clock and memory are injectable.
- [ ] No test requires a real microphone.

**G2 — P3-11: opt-in default**

Definition of done:
- [ ] P3-11 passes: wake word is off until explicit opt-in with disclosure.
- [ ] A config default cannot enable it.
- [ ] The disclosure is asserted to precede engine start.

**G3 — P3-12: on-device**

Definition of done:
- [ ] P3-12 passes: no network activity during detection.
- [ ] The buffer is asserted never to be persisted.
- [ ] The containment test covers the wake-word engine.

**G4 — P3-13: armed indicator**

Definition of done:
- [ ] P3-13 passes: a visible, distinct armed state whenever listening.
- [ ] The renderer cannot hide it.
- [ ] Presence across window modes is asserted.

**G5 — P3-14: wake-word flow**

Definition of done:
- [ ] P3-14 passes: detection → pre-roll capture → transcribe → reply → re-arm.
- [ ] The first syllable is not clipped.
- [ ] Re-arm returns to the correct state.

**G6 — P3-16: footprint**

Definition of done:
- [ ] P3-16 passes: the engine fits the floor budget, or is disabled with a notice.
- [ ] The measured footprint is recorded against the S0.4 ceiling.
- [ ] The tier-profile decision is asserted.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1 (bundling), S0.3 (containment pattern) | A2, A3 |
| A2 | A1 | B1 |
| A3 | A1 | D1 |
| B1 | A2 | B2, B3 |
| B2 | B1 | G2 |
| B3 | B1, S3.1-C3 | G2 |
| C1 | S3.1-C1 | C2, G4 |
| C2 | C1, A3 | D1, G4 |
| D1 | C2, A3, S3.1-B4, S3.1-E1 | D2, G5 |
| D2 | D1 | D3, G5 |
| D3 | D2, S3.1-E1, S3.2-C1 | — |
| E1 | S3.1-B4 | D1, G3 |
| E2 | E1, S0.3-E2 | G3 |
| E3 | D1, S3.1-B3 | — |
| F1 | A1, S0.2-A1 | F2 |
| F2 | F1, S0.4 (S7 result) | G6 |
| F3 | F1, C1 | — |
| G1 | A1, S3.1-A1 | G2–G6 |
| G2 | G1, B1, B2, B3 | — |
| G3 | G1, E1, E2 | — |
| G4 | G1, C1, C2 | — |
| G5 | G1, D1, D2 | — |
| G6 | G1, F2 | — |

Parallel opportunities: Group 3 (indicator) can be built alongside Group 2 (opt-in) once the engine
exists. Group 5 (buffer/privacy) is independent of Group 4 (handoff).

---

## 4. Slice-level Definition of Done

S3.3 is complete when **all** of the following hold:

- [ ] Wake word is off until explicit opt-in with disclosure (P3-11).
- [ ] Detection runs entirely on-device with no network activity (P3-12).
- [ ] A visible, distinct armed state is shown whenever listening (P3-13).
- [ ] The full flow works: detection → pre-roll capture → transcribe → reply → re-arm (P3-14).
- [ ] The floor-tier footprint fits the budget, or wake word is disabled on the floor with a
      notice (P3-16).
- [ ] Audio is held only in a rolling in-memory buffer and never persisted (E1).
- [ ] Disabling is immediate and closes the microphone (B3).
- [ ] Wake word is a light pipeline and never requests a heavy slot (F1).
- [ ] Enabling wake word does not enable or imply any cloud voice scope (E2).
- [ ] All tests run offline with a synthetic audio source.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Engine starts before disclosure is shown | The core opt-in promise is broken | Disclosure before start; asserted (B2, G2) |
| Armed indicator is subtle or hideable | User cannot tell the mic is open | Distinct, main-process-owned, always visible (C1, G4) |
| Buffer written to a log or crash dump | Continuous audio leakage | Memory-only, never persisted; asserted (E1, G3) |
| Wake word enabled by a config default or migration | Silent always-listening | Opt-in only; config cannot enable it (B1, G2) |
| Footprint breaches the floor budget | Memory pressure, poor chat latency | S7 measurement; disable on floor if needed (F2, G6) |
| False accepts open the mic indefinitely | Battery drain, privacy perception | Timeout returns to `armed`; false accepts counted (E3) |
| Wake word and PTT conflict | Overlapping captures | Defined precedence; mute suppresses both (D3) |
| Battery drain on laptops | User disables the feature out of frustration | Battery-saver pause, visible in the indicator (F3) |
| Enabling wake word implies cloud voice | Consent confusion | No coupling; separate scopes (E2) |

---

## 6. Traceability

| Phase 3 reference / test | Covered by |
|---|---|
| §5.1 `WakeWordService` | A1, B1, B3 |
| §5.2 Off by default, on-device, armed indicator, configurable phrase | B1, B2, C1, A2, E2 |
| §5.3 Wake-word flow | D1, D2 |
| §7 Light-pipeline classification | F1 |
| P3-11 Wake word default | B1, B2, G2 |
| P3-12 Wake word on-device | E2, G3 |
| P3-13 Armed indicator | C1, G4 |
| P3-14 Wake-word flow | D1, D2, G5 |
| P3-16 Wake-word footprint | F2, G6 |

S3.3 completes the voice track. Its output (armed state, detection events) is consumed by S4.2's
emotion resolver only if a persona chooses to react to wake detection; no other slice depends on it.
