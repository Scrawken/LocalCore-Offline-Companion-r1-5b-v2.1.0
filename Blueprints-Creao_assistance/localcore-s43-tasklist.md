# LocalCore — S4.3 Implementation Task List

Slice: **S4.3 — Lip-sync and idle animation**
Source: Phase 4 §3 (lip-sync), §4 (idle animation), §6 (governor and degradation);
S3.2 (TTS, viseme emission); S4.1 (AvatarService); S4.2 (emotion).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The `LipSyncDriver`: viseme-timeline consumption and the amplitude fallback.
- Playback-clock synchronization and interpolation at render FPS.
- Barge-in behaviour for the mouth.
- The idle profile: blink, breathing, sway, and micro-expressions.
- Idle onset after 15 seconds and stop on interaction.
- Idle-versus-speaking precedence.
- The governor's degradation ladder as it applies to animation, including suspension during model
  load.

**Explicit non-goals (do not build here):**
- No emotion resolution or taxonomy (S4.2).
- No TTS synthesis or viseme *production* (S3.2) — this slice consumes visemes.
- No renderer substrate or window modes (S4.1).
- No full-body or gesture animation beyond the idle profile.

Rationale: lip-sync and idle animation are the two behaviours that make the avatar read as alive,
and they compete for the same limited budget. They are separated from emotion so the
priority between them — lip-sync outranks idle — can be implemented and tested explicitly.

---

## 1. Ordering principles

1. **Driver before paths** — the interface exists before either implementation.
2. **Viseme path before fallback** — the preferred path is primary; the fallback covers its absence.
3. **Path selection before synchronization** — the driver must know which clock it is following.
4. **Lip-sync before idle** — the mouth is the higher-priority behaviour.
5. **Idle precedence rules before degradation** — degradation depends on knowing what outranks what.
6. **Degradation order is fixed:** FPS → idle → quality → static pose. Lip-sync survives as long as
   possible.
7. **Everything samples the playback clock**, never the synthesis clock.

---

## 2. Task list

### Group 1 — Lip-sync driver

**A1 — `LipSyncDriver` interface**

Deliverable: the driver from Phase 4 §3.1.

Definition of done:
- [ ] `fromVisemes(frames)`, `fromAudio(audio)`, `sample(atMs)`, and `reset()` are implemented.
- [ ] `sample` is pure with respect to its inputs and the supplied time.
- [ ] The driver holds no reference to the audio device; it is driven by the playback clock.
- [ ] The interface matches what S3.2 emits, with no adapter drift.

**A2 — `MouthState` and blending**

Definition of done:
- [ ] `MouthState` carries viseme weights (`aa`, `ih`, `ou`, `ee`, `oh`) and an `openness` value.
- [ ] Weights are normalized so the mouth does not exceed full deformation (test A2-T1).
- [ ] Blending between frames is smooth, not stepped.
- [ ] `openness` is provided for the coarse fallback path.

**A3 — Rest state**

Definition of done:
- [ ] `reset()` returns the mouth to a closed rest state.
- [ ] The rest state is applied on silence, on end of playback, and on barge-in.
- [ ] Rest is reached within the barge-in bound (≤150ms) when interrupted.
- [ ] `reset()` is idempotent.

---

### Group 2 — Lip-sync paths

**B1 — Viseme path**

Definition of done:
- [ ] When `AudioChunk.viseme` is present and non-empty, `fromVisemes` is used (Phase 4 §3.2).
- [ ] Frames are sampled by `atMs` against the playback clock (P4-10).
- [ ] Out-of-order or overlapping frames are handled deterministically.
- [ ] A malformed timeline falls back to the amplitude path rather than failing.

**B2 — Amplitude fallback path**

Definition of done:
- [ ] When visemes are absent, `fromAudio` derives mouth openness from the PCM envelope
      (P4-11).
- [ ] The fallback is intentionally coarse and reads believably (Phase 4 §3.2).
- [ ] Energy maps to a small viseme set with documented thresholds.
- [ ] The fallback is deterministic for a given buffer.

**B3 — Path selection**

Definition of done:
- [ ] Selection is per-chunk: a chunk with visemes uses them, a chunk without uses the fallback.
- [ ] Switching paths mid-utterance does not produce a visible discontinuity (test B3-T1).
- [ ] The selected path is exposed for diagnostics (B4).
- [ ] Selection never blocks playback.

**B4 — Path reporting**

Definition of done:
- [ ] The driver reports which path was used for each utterance (ties to S3.2 D2).
- [ ] Reporting is cheap and does not allocate per frame.
- [ ] The report is available to the trace and the debug surface.
- [ ] Reporting survives path switching within an utterance.

---

### Group 3 — Synchronization

**C1 — Playback-clock alignment**

Definition of done:
- [ ] Sampling uses the **playback clock**, not the synthesis clock (P4-14).
- [ ] Alignment survives audio buffering and jitter (P4-14).
- [ ] A drift beyond a documented bound triggers a re-sync rather than a visible mismatch.
- [ ] The clock source is injectable for tests.

**C2 — Barge-in stop**

Definition of done:
- [ ] Lip-sync stops with playback on barge-in (P4-13).
- [ ] The mouth returns to rest within ≤150ms (P4-13).
- [ ] No residual sampling continues after the stop.
- [ ] The stop is coordinated with S3.2's `interrupted` event, not polled.

**C3 — Interpolation at render FPS**

Definition of done:
- [ ] Weights are interpolated between samples at the render FPS (Phase 4 §3.3).
- [ ] Interpolation does not overshoot or oscillate (test C3-T1).
- [ ] On the floor tier, interpolation keeps the mouth smooth at ~24 FPS.
- [ ] Interpolation cost is negligible relative to rendering.

**C4 — End-of-playback**

Definition of done:
- [ ] The final frame closes the mouth (P4-12).
- [ ] Silence within an utterance produces a closed mouth (P4-12).
- [ ] A truncated utterance still ends closed.
- [ ] End-of-playback is idempotent.

---

### Group 4 — Idle animation

**D1 — Idle profile**

Deliverable: `IdleProfile` from Phase 4 §4.

Definition of done:
- [ ] Fields: `breathing`, `blink`, `sway`, `microExpressions`, `idleAfterMs`, `fps`.
- [ ] `idleAfterMs` defaults to **15000** (A5).
- [ ] `fps` comes from the tier profile, not a constant.
- [ ] The profile is persisted and user-adjustable.

**D2 — Blink**

Definition of done:
- [ ] Blinking is procedural with a randomized interval within a natural range.
- [ ] Blinking is suppressed during strong emotions where it would look wrong (Phase 4 §4).
- [ ] Blink timing is seeded deterministically for tests (test D2-T1).
- [ ] Blink does not fire during a blink (no double-trigger).

**D3 — Breathing and sway**

Definition of done:
- [ ] Breathing is a subtle periodic motion.
- [ ] Sway is slow and low-amplitude.
- [ ] Both are suppressed during strong emotions or speech where inappropriate.
- [ ] Amplitudes are configurable and bounded.

**D4 — Micro-expressions**

Definition of done:
- [ ] Occasional small expression shifts occur, damped by persona expressiveness.
- [ ] Micro-expressions never override an active explicit emotion (ties to S4.2).
- [ ] Their frequency is bounded so the avatar does not fidget.
- [ ] They are deterministic given a seed.

**D5 — Idle onset and stop**

Definition of done:
- [ ] Idle behaviour begins after 15 seconds of no interaction (P4-15).
- [ ] It stops **immediately** on interaction (chat, voice, or pointer) (P4-15).
- [ ] The onset timer uses the injectable clock.
- [ ] Interaction during idle does not cause a visible jump.

**D6 — Idle versus speaking precedence**

Definition of done:
- [ ] While speaking, lip-sync runs and idle motion is suppressed (P4-16).
- [ ] On speech end, idle resumes according to the onset timer.
- [ ] Precedence is explicit in code, not incidental.
- [ ] A speaking avatar never loses its mouth to an idle animation (P4-16).

---

### Group 5 — Degradation & governor

**E1 — Degradation ladder**

Deliverable: the ordered ladder from Phase 4 §6.

Definition of done:
- [ ] The order is: reduce FPS → drop idle animation → reduce quality → freeze to a static pose
      (P4-22).
- [ ] **Lip-sync is preserved until after idle animation is dropped** (test E1-T1).
- [ ] Each step is triggered by a governor signal and appears in the trace.
- [ ] The ladder never reaches a state where chat is affected (P4-22).

**E2 — Suspension during model load**

Definition of done:
- [ ] Animation suspends while the LLM/STT loads and resumes after (P4-21).
- [ ] The last rendered frame persists rather than freezing to a blank.
- [ ] Suspension is driven by governor signals, not a timer.
- [ ] Lip-sync is not started during suspension; a queued utterance begins after resumption.

**E3 — Governor signals**

Definition of done:
- [ ] The animation subsystem subscribes to pressure, eviction, and degrade events (S0.2 E1).
- [ ] It reacts to `degrade` by stepping down the ladder.
- [ ] It reacts to recovery by stepping up, with hysteresis to avoid oscillation
      (test E3-T1).
- [ ] It reports its own cost so the governor can see the effect.

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] A stub audio source with known amplitude produces a predictable envelope.
- [ ] A scripted viseme timeline drives the viseme path.
- [ ] The clock and FPS are injectable.
- [ ] A stub renderer records `MouthState` and idle commands without a GPU.

**F2 — P4-10: viseme lip-sync**

Definition of done:
- [ ] P4-10 passes: with visemes present, the mouth follows the supplied timeline.

**F3 — P4-11: fallback lip-sync**

Definition of done:
- [ ] P4-11 passes: without visemes, the mouth follows the PCM envelope.

**F4 — P4-12: silence**

Definition of done:
- [ ] P4-12 passes: the mouth closes on silence and at playback end.

**F5 — P4-13: barge-in**

Definition of done:
- [ ] P4-13 passes: lip-sync stops with playback within ≤150ms.

**F6 — P4-14: playback alignment**

Definition of done:
- [ ] P4-14 passes: lip-sync stays aligned when audio buffers.

**F7 — P4-15: idle onset**

Definition of done:
- [ ] P4-15 passes: idle starts after 15s and stops on interaction.

**F8 — P4-16: idle versus speaking**

Definition of done:
- [ ] P4-16 passes: speaking keeps lip-sync while idle motion is suppressed.

**F9 — P4-17: floor FPS**

Definition of done:
- [ ] P4-17 passes: rendering meets the ~24 FPS floor target with lip-sync and idle active.

**F10 — P4-21: suspension**

Definition of done:
- [ ] P4-21 passes: the avatar suspends during model load and resumes after.

**F11 — P4-22: pressure degradation**

Definition of done:
- [ ] P4-22 passes: FPS → idle → quality degrade in order; chat is unaffected.
- [ ] Lip-sync survives longer than idle.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S3.2-D1, S4.1-B1 | A2, A3, B1 |
| A2 | A1 | B1, B2, C3 |
| A3 | A1 | C2, C4 |
| B1 | A2, S3.2-D1 | B3, F2 |
| B2 | A2, S3.2-D2 | B3, F3 |
| B3 | B1, B2 | B4 |
| B4 | B3 | — |
| C1 | A1, S3.2-B2 | C3, F6 |
| C2 | A3, S3.2-C2 | F5 |
| C3 | C1, A2, S4.1-A3 | F9 |
| C4 | A3, C1 | F4 |
| D1 | S4.1-B1 | D2–D6 |
| D2 | D1 | F7 |
| D3 | D1 | F7 |
| D4 | D1, S4.2-D1 | F8 |
| D5 | D1, S4.2 (interaction) | F7 |
| D6 | D5, A1 | F8 |
| E1 | D6, S0.2-E1 | F11 |
| E2 | E1, S0.2 (events) | F10 |
| E3 | E1, S0.2-E1 | F11 |
| F1 | A1, D1 | F2–F11 |
| F2 | F1, B1 | — |
| F3 | F1, B2 | — |
| F4 | F1, C4 | — |
| F5 | F1, C2 | — |
| F6 | F1, C1 | — |
| F7 | F1, D5 | — |
| F8 | F1, D6 | — |
| F9 | F1, C3 | — |
| F10 | F1, E2 | — |
| F11 | F1, E1, E3 | — |

Parallel opportunities: Group 4 (idle animation) is independent of Groups 1–3 (lip-sync) once the
service and profile exist. Group 5 (degradation) depends on both.

---

## 4. Slice-level Definition of Done

S4.3 is complete when **all** of the following hold:

- [ ] With visemes present, the mouth follows the supplied timeline (P4-10).
- [ ] Without visemes, the mouth follows the PCM envelope (P4-11).
- [ ] The mouth closes on silence and at playback end (P4-12).
- [ ] Barge-in stops lip-sync with playback within ≤150ms (P4-13).
- [ ] Lip-sync stays aligned when audio buffers (P4-14).
- [ ] Idle animation starts after 15s and stops immediately on interaction (P4-15).
- [ ] Speaking keeps lip-sync while idle motion is suppressed (P4-16).
- [ ] Rendering meets the ~24 FPS floor target (P4-17).
- [ ] The avatar suspends during model load and resumes after (P4-21).
- [ ] Degradation runs FPS → idle → quality with chat unaffected, and lip-sync outliving idle
      (P4-22).
- [ ] All tests run offline with injectable clock, FPS, and a stub renderer.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Sampling the synthesis clock instead of playback | Visible lip-sync drift | Align to the playback clock; buffering test (C1, F6) |
| Degradation drops lip-sync before idle | Avatar reads as broken | Fixed ladder order; lip-sync outranks idle (E1, F11) |
| Mouth left open on barge-in | Unsettling artefact | Rest within the barge-in bound (C2, F5) |
| Interpolation overshoots | Mouth wobbles | Bounded interpolation; assertion (C3) |
| Idle animation fights an active emotion | Contradictory expression | Micro-expressions damped and suppressed (D4) |
| Idle does not stop on interaction | Avatar looks inattentive | Immediate stop on interaction (D5, F7) |
| Blink fires during blink | Visible glitch | No double-trigger (D2) |
| Hysteresis missing on recovery | FPS oscillates under pressure | Hysteresis on ladder recovery (E3) |
| Animation cost unbounded on floor | FPS below target | FPS from tier profile; suspension during load (C3, E2, F9) |

---

## 6. Traceability

| Phase 4 reference / test | Covered by |
|---|---|
| §3.1 `LipSyncDriver` | A1–A3 |
| §3.2 Path selection | B1–B3 |
| §3.3 Synchronization rules | C1–C4 |
| §4 Idle animation, onset | D1–D6 |
| §6 Degradation ladder | E1, E3 |
| §6 Suspension during model load | E2 |
| P4-10 Viseme lip-sync | B1, F2 |
| P4-11 Fallback lip-sync | B2, F3 |
| P4-12 Silence | C4, F4 |
| P4-13 Barge-in | C2, F5 |
| P4-14 Playback alignment | C1, F6 |
| P4-15 Idle onset | D5, F7 |
| P4-16 Idle versus speaking | D6, F8 |
| P4-17 Floor FPS | C3, F9 |
| P4-21 Suspension | E2, F10 |
| P4-22 Pressure degradation | E1, E3, F11 |

S4.3 completes the avatar track. Its output (mouth state, idle behaviour) is consumed only by the
renderer; no later slice depends on it except Phase 4's own acceptance suite.
