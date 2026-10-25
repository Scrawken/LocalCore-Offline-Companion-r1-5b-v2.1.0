# LocalCore — S3.2 Implementation Task List

Slice: **S3.2 — TTS, barge-in, viseme emission**
Source: Phase 3 §3 (TTS and barge-in), §3.5 (tier-based selection), §7 (governor);
S3.1 (capture, VAD, mic indicator); S1.2 (ChatEngine); S0.2 (governor).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The `TtsProvider` contract and the local engines (Piper on floor, Kokoro on higher tiers).
- The TTS service: synthesis, playback, and lifecycle events.
- Barge-in: stopping playback within ≤150ms on detected speech or keyboard interrupt.
- Viseme metadata emission for Phase 4 lip-sync, with an amplitude fallback path.
- Overlap policy: whether TTS may run alongside generation on the floor tier.
- Tier-based engine selection.
- Governor integration and idle unload.

**Explicit non-goals (do not build here):**
- No lip-sync rendering or avatar reaction (Phase 4) — this slice *emits* viseme timing only.
- No cloud TTS (Phase 6).
- No capture, VAD, or mic indicator (S3.1).
- No wake word (S3.3).

Rationale: S3.2 is the output half of voice. It is separated from capture so barge-in — which
spans both halves — can be verified as a distinct behaviour with its own latency bound.

---

## 1. Ordering principles

1. **Provider contract before engines** — engines are implementations of a fixed shape.
2. **Synthesis before playback** — there must be audio before it can be played.
3. **Playback before barge-in** — barge-in stops something that exists.
4. **Viseme emission alongside synthesis** — timing must be produced with the audio, not
   reconstructed later.
5. **Barge-in before overlap policy** — overlap is only safe once interruption is reliable.
6. **Governor integration before overlap decisions** — overlap depends on whether the floor tier
   can afford it.
7. **Barge-in latency is a bound, not a goal.** It is asserted in tests.

---

## 2. Task list

### Group 1 — TTS provider & engines

**A1 — `TtsProvider` contract conformance**

Deliverable: the interface from Phase 3 §3.1.

Definition of done:
- [ ] `id`, `displayName`, `capabilities()`, `load()`, `unload()`, `synthesize()`, `health()` are
      implemented.
- [ ] `capabilities()` reports `languages`, `streaming`, `visemes`, `minTier`, `modelSizeMB`,
      `egress`.
- [ ] The service depends only on the contract, so cloud TTS can be added in Phase 6.
- [ ] No `any` and no interface drift.

**A2 — Piper engine (floor and mid)**

Definition of done:
- [ ] Piper is bundled and used on the floor and mid tiers (V2).
- [ ] Voice selection is available and persisted.
- [ ] Synthesis streams audio chunks rather than returning one buffer (test A2-T1).
- [ ] Engine failure produces a structured error, not silent audio.

**A3 — Kokoro engine (high tier)**

Definition of done:
- [ ] Kokoro is bundled and selected on the high tier (V2).
- [ ] Selection is driven by the tier detector and is user-overridable.
- [ ] Falling back to Piper when Kokoro is unavailable is explicit and logged.
- [ ] Quality/engine choice is reported in diagnostics.

**A4 — Model and voice load/unload**

Definition of done:
- [ ] The TTS model/voice loads on demand, not at boot.
- [ ] It unloads when idle via the governor's eviction.
- [ ] Loading acquires a `tts` lease.
- [ ] Reload after eviction is transparent (test A4-T1).

---

### Group 2 — TTS service & playback

**B1 — Synthesis**

Definition of done:
- [ ] `synthesize(text)` produces `AudioChunk`s with sample rate, start, and duration.
- [ ] Long text is synthesized incrementally so playback can begin before completion
      (Phase 3 §3.4).
- [ ] Text is not altered by the service (no summarization, no truncation beyond a documented cap).
- [ ] Synthesis errors are structured and stop playback cleanly.

**B2 — Playback**

Definition of done:
- [ ] Audio is played through the OS output device at the correct sample rate.
- [ ] Playback reports `started`, `progress`, and `ended` events.
- [ ] Playback does not block the UI thread.
- [ ] Device change or unavailability is handled without a crash.

**B3 — Service lifecycle**

Definition of done:
- [ ] `speak(text)` returns a `SpeechHandle` with `turnId` and start time.
- [ ] `state()` reports `idle`, `synthesizing`, or `speaking` (Phase 3 §3.2).
- [ ] Only one active speech per conversation; a second request is queued or rejected per a
      documented rule.
- [ ] `ended` is emitted exactly once per speech (test B3-T1).

**B4 — Sentence-level streaming**

Definition of done:
- [ ] Playback begins as soon as the first sentence is available (Phase 3 §3.4).
- [ ] Sentence boundaries are detected deterministically.
- [ ] The full response is still spoken in order with no gaps or repeats.
- [ ] Streaming is disabled gracefully if the engine cannot stream.

---

### Group 3 — Barge-in

**C1 — Trigger detection**

Definition of done:
- [ ] Barge-in triggers on detected user speech via the S3.1 VAD (Phase 3 §3.3).
- [ ] It also triggers on an explicit keyboard interrupt.
- [ ] The mic path stays armed during playback so detection is possible.
- [ ] False triggers from playback audio are suppressed (echo handling) (test C1-T1).

**C2 — Stop within ≤150ms**

Deliverable: the latency bound behind V4.

Definition of done:
- [ ] `stop(handle)` halts synthesis and playback **within ≤150ms** of the trigger (P3-6).
- [ ] The latency is measured and reported, not assumed.
- [ ] Audio already spoken is not repeated; the turn text is unaffected.
- [ ] An `interrupted` event is emitted exactly once.

**C3 — Capture start after barge-in**

Definition of done:
- [ ] Capture begins immediately after barge-in so the utterance is not clipped (Phase 3 §3.3).
- [ ] The S3.1 pre-roll buffer supplies the leading frames.
- [ ] The resulting transcript follows the normal PTT handoff path.
- [ ] The mic indicator transitions correctly (`speaking` → `listening`).

**C4 — Keyboard interrupt**

Definition of done:
- [ ] A global or in-window interrupt stops playback.
- [ ] The interrupt does not open the mic.
- [ ] The interrupt is discoverable (documented shortcut).
- [ ] Repeated interrupts are idempotent.

---

### Group 4 — Viseme emission

**D1 — Viseme timeline**

Deliverable: the metadata Phase 4 lip-sync consumes (P3-20).

Definition of done:
- [ ] When the engine supports it, `AudioChunk.viseme` carries `{ atMs, viseme }` frames.
- [ ] Frames are ordered by `atMs` and cover the chunk's duration.
- [ ] Visemes use the documented set (`aa`, `ih`, `ou`, `ee`, `oh`) or a documented mapping.
- [ ] The timeline is aligned to the **playback clock**, not the synthesis clock (test D1-T1).

**D2 — Amplitude fallback**

Definition of done:
- [ ] When the engine does not supply visemes, an amplitude envelope is emitted instead
      (Phase 4 §3.2).
- [ ] The fallback is coarse but aligned to playback.
- [ ] The service reports which path was used, so Phase 4 can select its driver.
- [ ] The fallback is deterministic for a given audio buffer.

**D3 — Silence handling**

Definition of done:
- [ ] Silence in the audio produces a closed-mouth state (ties to P4-12).
- [ ] Gaps between sentences are represented, not skipped.
- [ ] The final frame closes the mouth.
- [ ] Silence handling is tested with synthetic audio.

---

### Group 5 — Overlap policy & governor

**E1 — Overlap decision**

Deliverable: whether TTS may run alongside generation on the floor.

Definition of done:
- [ ] The policy is driven by the S0.4 S4 result: overlap is permitted **only if it was proven to
      fit** (Phase 3 §3.4).
- [ ] If not proven, TTS serializes behind generation (test E1-T1).
- [ ] The policy is recorded in the tier profile, not hard-coded.
- [ ] A change to the policy is an explicit profile revision.

**E2 — Governor integration**

Definition of done:
- [ ] Synthesis acquires a `tts` lease; the lease is released on end, interrupt, and error
      (test E2-T1).
- [ ] TTS yields to voice round-trip priority appropriately.
- [ ] On the floor tier, TTS never overlaps the LLM unless E1 permits it.
- [ ] No lease leak is observable in the trace.

**E3 — Idle unload**

Definition of done:
- [ ] The TTS voice unloads when idle via the governor.
- [ ] Unloading does not interrupt an active playback.
- [ ] The next speak reloads transparently.
- [ ] Reload cost is measured and included in voice latency reporting.

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] A stub TTS provider returns scripted audio chunks with known timing and visemes.
- [ ] An amplitude-only stub exercises the fallback path.
- [ ] A synthetic audio output captures what was played for assertions.
- [ ] No test requires a real speaker or the real engine.

**F2 — P3-6: barge-in latency**

Definition of done:
- [ ] P3-6 passes: playback stops within ≤150ms of speech detection.
- [ ] Capture begins without clipping the first syllable.
- [ ] The measured latency is recorded, not just pass/fail.

**F3 — P3-7: keyboard interrupt**

Definition of done:
- [ ] P3-7 passes: playback stops; delivered text is not re-spoken.
- [ ] The mic is not opened by the interrupt.

**F4 — P3-8: overlap**

Definition of done:
- [ ] P3-8 passes: TTS overlaps generation only if S4 proved it; otherwise serialized.
- [ ] The governor trace confirms the chosen behaviour.

**F5 — P3-10, P3-19, P3-20, P3-22**

Definition of done:
- [ ] P3-10 passes: audio persistence follows the S3.1 policy for synthesized audio.
- [ ] P3-19 passes: viseme timing is emitted when supported.
- [ ] P3-20 passes: the fallback path works when visemes are absent.
- [ ] P3-22 passes: floor loads Piper; high loads Kokoro.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.2-A2 | A2–A4 |
| A2 | A1 | A4, F5 |
| A3 | A1, S0.2-B3 | A4, F5 |
| A4 | A2, A3, S0.2-C1 | E3 |
| B1 | A4 | B2, B4, D1 |
| B2 | B1 | B3, C2 |
| B3 | B2 | C2, F3 |
| B4 | B1, S1.2-C3 | E1 |
| C1 | B2, S3.1-B4 | C2 |
| C2 | C1, B3 | C3, F2 |
| C3 | C2, S3.1-E1 | F2 |
| C4 | B3 | F3 |
| D1 | B1 | D3, F5 |
| D2 | B1 | D3, F5 |
| D3 | D1, D2 | — |
| E1 | B4, S0.4 (S4 result) | E2, F4 |
| E2 | E1, S0.2-C1 | F4 |
| E3 | A4, B3 | — |
| F1 | A1, B1 | F2–F5 |
| F2 | F1, C2, C3 | — |
| F3 | F1, C4 | — |
| F4 | F1, E1, E2 | — |
| F5 | F1, A2, A3, D1, D2 | — |

Parallel opportunities: Group 4 (viseme emission) can proceed alongside Group 3 (barge-in) once
synthesis produces audio. Group 1's engines can be built in parallel with each other.

---

## 4. Slice-level Definition of Done

S3.2 is complete when **all** of the following hold:

- [ ] TTS speaks a response through the local engine, streaming sentence by sentence (B4).
- [ ] Barge-in stops playback within ≤150ms and capture starts without clipping (P3-6).
- [ ] Keyboard interrupt stops playback without re-speaking delivered text (P3-7).
- [ ] TTS overlaps generation only if the S0.4 S4 result permits it (P3-8).
- [ ] Viseme timing is emitted when supported, with a working amplitude fallback (P3-19, P3-20).
- [ ] The floor tier loads Piper and the high tier loads Kokoro (P3-22).
- [ ] A `tts` lease is acquired and released on end, interrupt, and error, with no leaks (E2).
- [ ] The TTS voice unloads when idle and reloads transparently (E3).
- [ ] No synthesized audio is persisted unless the user enabled persistence (P3-10).
- [ ] All tests run offline with a stub provider and synthetic audio output.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Barge-in latency exceeds 150ms | Interruption feels broken | Measured and asserted, not assumed (C2, F2) |
| Playback audio retriggers barge-in | Self-interruption loop | Echo suppression in trigger detection (C1) |
| TTS overlaps generation without proof | Floor-tier OOM or latency spike | Overlap gated on the S0.4 S4 result (E1, F4) |
| Visemes aligned to synthesis, not playback | Lip-sync drifts | Align to the playback clock (D1) |
| `tts` lease leaked on interrupt | Slot leak stalls voice | Release on every path (E2) |
| Full-response buffering before speaking | Long perceived delay | Sentence-level streaming (B4) |
| Engine fallback silent | User gets no audio with no explanation | Explicit, logged fallback (A3) |
| Kokoro selected on a floor machine | Memory breach | Tier-driven selection (A3) |

---

## 6. Traceability

| Phase 3 reference / test | Covered by |
|---|---|
| §3.1 `TtsProvider` | A1–A3 |
| §3.2 `TtsService` | B1–B3 |
| §3.3 Barge-in semantics | C1–C4 |
| §3.4 Overlap with generation | B4, E1 |
| §3.5 Tier-based TTS selection (V2) | A2, A3 |
| §1 `AudioChunk.viseme` | D1, D2 |
| §7 Governor integration | E2, E3 |
| P3-6 TTS barge-in | C2, F2 |
| P3-7 Keyboard interrupt | C4, F3 |
| P3-8 TTS overlap | E1, F4 |
| P3-10 Audio persistence | F5 |
| P3-19 Viseme metadata | D1, F5 |
| P3-20 Fallback lip-sync path | D2, F5 |
| P3-22 Tier selection | A2, A3, F5 |

S3.2 output (TTS service, viseme timelines) is consumed by S4.3 (lip-sync) and S6.2 (cloud TTS
registered behind the same contract).
