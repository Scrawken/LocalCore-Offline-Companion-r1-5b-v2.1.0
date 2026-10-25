# LocalCore — S3.1 Implementation Task List

Slice: **S3.1 — Push-to-talk STT, audio capture, VAD, mic indicator**
Source: Phase 3 §1 (pipeline), §2 (PTT STT), §4 (mic indicator), §6 (audio policy);
S0.2 (governor); S1.2 (ChatEngine).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The microphone capture stream and in-memory PCM buffering.
- Voice activity detection, silence trimming, and empty-speech handling.
- The main-process-owned mic indicator.
- The `SttProvider` contract and the local whisper.cpp engine (tiny + base, tier-based).
- The push-to-talk flow: start, stop, cancel, and handoff to the ChatEngine.
- Audio policy: no persistence by default, in-memory buffers only.
- The audio-versus-transcript UI distinction.

**Explicit non-goals (do not build here):**
- No text-to-speech or barge-in (S3.2).
- No wake word (S3.3).
- No cloud STT (Phase 6).
- No avatar reaction to voice (Phase 4) — this slice emits no emotion cues.
- No transcript persistence beyond what S1.2 already writes.

Rationale: S3.1 is the input half of voice. It stops before synthesis so the capture path — the most
privacy-sensitive surface in the product — can be verified in isolation.

---

## 1. Ordering principles

1. **Capture before VAD** — there must be audio before it can be analysed.
2. **VAD before the PTT flow** — trimming and empty-detection shape the flow.
3. **Indicator before any capture path is reachable** — the visible signal must exist before the
   mic can open.
4. **Provider contract before the engine** — the engine is one implementation of a defined shape.
5. **Lease integration before handoff** — the STT lease must be released before the ChatEngine
   acquires the LLM lease on the floor tier.
6. **Audio policy before enabling persistence** — the default must be "never written" and the
   opt-in must be explicit.
7. **The indicator is main-process owned.** The renderer cannot hide or fake it.

---

## 2. Task list

### Group 1 — Audio capture

**A1 — Microphone capture stream**

Deliverable: the PCM capture pipeline.

Definition of done:
- [ ] Capture opens the OS microphone and produces PCM frames at a fixed sample rate.
- [ ] Capture is started only by an explicit user action (PTT press or wake-word detection).
- [ ] The stream is closed when capture ends; no capture remains open while idle (test A1-T1).
- [ ] A device-unavailable failure produces a structured error, not a silent dead mic.

**A2 — PCM framing and in-memory buffering**

Definition of done:
- [ ] Frames are buffered **in memory only** (ties to F1).
- [ ] The buffer is bounded; a long press cannot grow memory without limit (test A2-T1).
- [ ] Buffer format is documented (sample rate, channels, bit depth).
- [ ] Overflow behaviour is defined (truncate oldest or reject) and does not corrupt the stream.

**A3 — Device selection and permission**

Definition of done:
- [ ] The default input device is used unless the user selects another.
- [ ] OS microphone permission denial is detected and surfaced with guidance.
- [ ] Changing the default device mid-session is handled without a crash.
- [ ] Device selection is persisted.

**A4 — Capture teardown**

Definition of done:
- [ ] Capture is torn down on stop, cancel, error, and app exit (test A4-T1).
- [ ] No audio callback fires after teardown.
- [ ] A leaked capture stream is detectable (the indicator would show `listening` while idle).
- [ ] Teardown is idempotent.

---

### Group 2 — VAD

**B1 — Voice activity detection**

Definition of done:
- [ ] VAD classifies frames as speech or silence with a documented threshold.
- [ ] VAD is local and CPU-cheap; it does not use a model that competes with the LLM.
- [ ] The threshold is configurable to tolerate noisy environments.
- [ ] VAD output is deterministic for a given audio input (test B1-T1).

**B2 — Silence trimming**

Definition of done:
- [ ] Leading and trailing silence is trimmed before transcription (Phase 3 §2.3).
- [ ] Trimming preserves the first and last speech frames (no clipping).
- [ ] Trimming is bounded so an all-silence buffer is handled.
- [ ] Trimmed audio is what is sent to STT — no silent padding is transcribed.

**B3 — Empty-speech detection**

Definition of done:
- [ ] A capture with no speech returns `null` and produces **no turn** (P3-2).
- [ ] Sub-threshold audio is treated as empty, not transcribed into noise (test B3-T1).
- [ ] Empty detection produces no memory write (ties to P3-2).
- [ ] The user receives feedback that nothing was heard, rather than silence.

**B4 — Pre-roll buffer**

Deliverable: the seam S3.2 (barge-in) and S3.3 (wake word) will use.

Definition of done:
- [ ] A small rolling pre-roll buffer is maintained during listening states.
- [ ] The buffer is in memory only and never persisted.
- [ ] Its size is configurable and documented.
- [ ] It is exposed to S3.2/S3.3 through a defined interface, not by direct access.

---

### Group 3 — Mic indicator

**C1 — Main-process-owned indicator**

Deliverable: the always-visible mic state surface (Phase 3 §4).

Definition of done:
- [ ] The indicator is owned and rendered by the **main process** (test C1-T1).
- [ ] The renderer cannot hide or spoof it.
- [ ] It reflects the true capture state, not a cached UI flag.
- [ ] It is present in full, overlay, and tray-only window modes.

**C2 — State machine**

Definition of done:
- [ ] States: `idle`, `listening`, `transcribing`, `speaking`, `muted`, `error` (Phase 3 §4).
- [ ] Transitions are explicit and testable (test C2-T1).
- [ ] `listening` is shown whenever the mic is open, including PTT hold and barge-in arming.
- [ ] An `error` state is visible, not silent.

**C3 — Mute**

Definition of done:
- [ ] Mute is immediate and global: it closes the capture stream (P3-5).
- [ ] Mute stops wake-word listening (ties to S3.3).
- [ ] Mute is reflected in the indicator without delay.
- [ ] Unmute does not auto-resume capture; the user must re-initiate.

**C4 — Presence across window modes**

Definition of done:
- [ ] The indicator remains discoverable in tray-only mode.
- [ ] In overlay mode it does not obstruct the avatar or capture clicks when click-through is on.
- [ ] A mode change does not drop the indicator or change its state.
- [ ] The indicator is never rendered by page code.

---

### Group 4 — STT provider & local engine

**D1 — `SttProvider` contract conformance**

Deliverable: the interface from Phase 3 §2.1.

Definition of done:
- [ ] `id`, `displayName`, `capabilities()`, `load()`, `unload()`, `transcribe()`, `stream()`,
      `health()` are implemented.
- [ ] `capabilities()` reports `languages`, `streaming`, `minTier`, `modelSizeMB`, and `egress`.
- [ ] The engine depends only on the contract, so cloud STT can be added in Phase 6.
- [ ] No `any` and no interface drift.

**D2 — whisper.cpp engine, tier-based**

Definition of done:
- [ ] The engine is bundled; no external runtime is required.
- [ ] **Floor uses whisper.cpp tiny; mid and high use base** (V1).
- [ ] Model selection is driven by the S0.2 tier detector and is user-overridable.
- [ ] The chosen model is reported in diagnostics so latency can be attributed.

**D3 — Model load and unload**

Definition of done:
- [ ] The STT model loads on demand, not at boot.
- [ ] It unloads when idle via the governor's eviction.
- [ ] Loading acquires an `stt` lease; a failed load surfaces a structured error.
- [ ] Reload after eviction is transparent to the user (test D3-T1).

**D4 — Streaming partials**

Definition of done:
- [ ] Partial transcripts may be emitted while listening; the **final** transcript is what is sent
      (Phase 3 §2.3).
- [ ] Partials are marked stable or unstable.
- [ ] Partials are never persisted and never become a turn.
- [ ] Disabling partials does not affect the final transcript.

**D5 — Language handling**

Definition of done:
- [ ] The default language is configurable and persisted.
- [ ] An unsupported language produces a structured error, not a silent wrong-language transcript.
- [ ] Language is recorded with the transcript for diagnostics.
- [ ] Auto-detection, if offered, is explicit and does not change the model silently.

---

### Group 5 — Push-to-talk flow

**E1 — PTT controls**

Deliverable: `pressToTalkStart`, `pressToTalkStop`, `cancel` (Phase 3 §2.2).

Definition of done:
- [ ] `pressToTalkStart()` opens the mic, sets state to `listening`, and turns on the indicator.
- [ ] `pressToTalkStop()` trims, transcribes, and returns the transcript or `null`.
- [ ] `cancel()` discards audio and produces no turn (P3-3).
- [ ] Concurrent PTT starts are rejected or coalesced deterministically (test E1-T1).

**E2 — STT lease acquisition and release**

Definition of done:
- [ ] Transcription acquires an `stt` lease from the S0.2 governor.
- [ ] The lease is released on success, cancel, and error (test E2-T1).
- [ ] **The STT lease is released before the ChatEngine acquires the `llm` lease** on the floor
      tier (P3-15).
- [ ] No lease leak is observable in the governor trace.

**E3 — Handoff to the ChatEngine**

Definition of done:
- [ ] A non-empty transcript is handed to the S1.2 engine as the user's input (P3-1).
- [ ] The handoff preserves the normal turn lifecycle (persist user turn, assemble, generate).
- [ ] A handoff failure surfaces a structured error and leaves no partial turn.
- [ ] The transcript enters memory under the normal Phase 2 rules (not a special path).

**E4 — Error handling**

Definition of done:
- [ ] Capture failure, STT failure, and engine failure map to distinct structured errors.
- [ ] Every failure path releases the STT lease and closes the mic.
- [ ] The indicator returns to `idle` (or `error`) after any failure.
- [ ] A failed transcription does not create an empty turn.

---

### Group 6 — Audio policy & privacy

**F1 — No audio persisted by default**

Deliverable: the default guarantee.

Definition of done:
- [ ] With persistence off, **no audio file is ever written** (P3-9).
- [ ] Audio lives only in memory and is discarded after transcription.
- [ ] The guarantee is verified by a filesystem test over a full voice session.
- [ ] No temp file, cache, or crash dump contains audio.

**F2 — Buffer discard and zeroing**

Definition of done:
- [ ] Buffers are released after use (test F2-T1).
- [ ] Where the platform allows, buffers are zeroed before release.
- [ ] The pre-roll buffer is continuously overwritten, not accumulated.
- [ ] A long session does not grow audio memory.

**F3 — Audio persistence (opt-in)**

Definition of done:
- [ ] Persistence is off by default and requires an explicit user enable (P3-10).
- [ ] When enabled, audio is stored encrypted under the S0.1 app-data layout.
- [ ] Stored audio is inspectable, deletable, and subject to a retention window.
- [ ] Disabling persistence deletes previously stored audio or offers to.

**F4 — Audio-versus-transcript messaging**

Deliverable: the honest UI distinction (Phase 3 §6).

Definition of done:
- [ ] The UI states both facts: "no audio is saved" **and** "the text of what you say becomes part
      of your conversation and is kept per your memory settings" (P3-23).
- [ ] The message reflects the user's actual memory settings, not a generic string.
- [ ] It is shown at the point of first voice use, not buried in settings.
- [ ] It is not shown again on every use.

---

### Group 7 — Verification

**G1 — Test doubles**

Definition of done:
- [ ] A synthetic audio source feeds known PCM patterns (speech, silence, noise).
- [ ] A stub STT provider returns scripted transcripts, including empty and error cases.
- [ ] The governor's clock and memory are injectable.
- [ ] No test requires a real microphone or the real model.

**G2 — P3-1: PTT round trip**

Definition of done:
- [ ] P3-1 passes: press, speak, release → transcript → reply, with no mouse needed.
- [ ] The test asserts the STT lease was released before the LLM lease was acquired.

**G3 — P3-2: empty speech**

Definition of done:
- [ ] P3-2 passes: no turn created and no memory write for empty speech.
- [ ] The test covers all-silence and sub-threshold audio.

**G4 — P3-3: cancel**

Definition of done:
- [ ] P3-3 passes: audio discarded, no turn created.
- [ ] The mic is closed and the indicator returns to `idle`.

**G5 — P3-4 / P3-5: indicator and mute**

Definition of done:
- [ ] P3-4 passes: the indicator is visible whenever the mic is open and cannot be hidden by the
      renderer.
- [ ] P3-5 passes: mute is immediate and stops capture.
- [ ] Presence across window modes is asserted.

**G6 — P3-9: no audio on disk**

Definition of done:
- [ ] P3-9 passes: with persistence off, no audio file is ever written.
- [ ] The test runs a full voice session and inspects the filesystem.
- [ ] The no-writes-outside watcher still passes with voice active.

**G7 — P3-23: messaging**

Definition of done:
- [ ] P3-23 passes: the UI states both the no-audio-saved and transcript-follows-memory facts.
- [ ] The message reflects the current memory settings.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1 (app skeleton) | A2–A4 |
| A2 | A1 | B1, B4, F2 |
| A3 | A1, S0.1-A3 | — |
| A4 | A1 | C2, G6 |
| B1 | A2 | B2, B3 |
| B2 | B1 | E1 |
| B3 | B1, B2 | G3 |
| B4 | A2 | S3.2, S3.3 |
| C1 | S0.1-A2, S0.2 | C2 |
| C2 | C1, A1 | C3, C4, G5 |
| C3 | C2 | G5 |
| C4 | C2, S4.1 (window modes) | — |
| D1 | S0.2-A2 | D2 |
| D2 | D1, S0.3 (bundled runtime pattern) | D3 |
| D3 | D2, S0.2-C1 | D4, G2 |
| D4 | D2, D3 | — |
| D5 | D2 | — |
| E1 | B2, B3, C2, D3 | E2–E4 |
| E2 | E1, S0.2-C1 | E3, G2 |
| E3 | E2, S1.2-C1 | G2 |
| E4 | E1, E2 | G4 |
| F1 | A2, S0.1-B3 | F2, G6 |
| F2 | A2, F1 | G6 |
| F3 | F1, S0.1-B2 | — |
| F4 | F1, S2.1 (settings) | G7 |
| G1 | A1, D1 | G2–G7 |
| G2 | G1, E2, E3 | — |
| G3 | G1, B3 | — |
| G4 | G1, E1, E4 | — |
| G5 | G1, C2, C3 | — |
| G6 | G1, F1, F2 | — |
| G7 | G1, F4 | — |

Parallel opportunities: Group 2 (VAD) and Group 3 (indicator) can be built concurrently once
capture (Group 1) exists. Group 4 (STT) is independent of Group 3.

---

## 4. Slice-level Definition of Done

S3.1 is complete when **all** of the following hold:

- [ ] PTT round trip works hands-free: press, speak, release → transcript → reply (P3-1).
- [ ] Empty or sub-threshold speech produces no turn and no memory write (P3-2).
- [ ] Cancel discards audio and produces no turn (P3-3).
- [ ] The mic indicator is visible whenever the mic is open and cannot be hidden by the renderer
      (P3-4).
- [ ] Mute is immediate and global (P3-5).
- [ ] With persistence off, no audio file is ever written (P3-9).
- [ ] The UI states both the no-audio-saved and transcript-follows-memory facts (P3-23).
- [ ] The STT lease is released before the LLM lease is acquired on the floor tier (P3-15).
- [ ] The STT model loads on demand, unloads when idle, and reloads transparently (D3).
- [ ] All tests run offline with a synthetic audio source and a stub STT provider.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Audio written to a temp file or crash dump | Breaks the no-audio-persisted promise | In-memory only; filesystem test over a full session (F1, G6) |
| Indicator is renderer-owned | User cannot trust the display | Main-process ownership (C1, G5) |
| STT lease held during LLM generation | Serialization violation; stalls voice on floor | Lease released before handoff (E2, G2) |
| Leaked capture stream | Mic stays open while idle | Teardown on every path; leak detectable (A4) |
| Empty audio transcribed into noise | Empty turns pollute memory | VAD threshold and empty detection (B3, G3) |
| Wrong STT model loaded for the tier | Latency or memory breach | Tier-driven selection (D2) |
| Buffer grows on a long press | Memory spike | Bounded buffer with defined overflow (A2) |
| "No audio saved" misread as "nothing persists" | User surprise when memory retains transcripts | Explicit dual messaging (F4, G7) |

---

## 6. Traceability

| Phase 3 reference / test | Covered by |
|---|---|
| §1 Audio pipeline | A1–A4, B1–B4 |
| §2.1 `SttProvider` | D1, D2 |
| §2.2 `VoiceInputService` | E1 |
| §2.3 Push-to-talk flow | E1–E4 |
| §2.4 Tier-based STT selection (V1) | D2 |
| §4 Mic indicator | C1–C4 |
| §6 Audio policy | F1–F4 |
| §7 Floor serialization | E2 |
| P3-1 PTT round trip | E3, G2 |
| P3-2 Empty speech | B3, G3 |
| P3-3 Cancel capture | E1, G4 |
| P3-4 Mic indicator | C1, G5 |
| P3-5 Mute | C3, G5 |
| P3-9 No audio on disk | F1, G6 |
| P3-15 Floor serialization | E2, G2 |
| P3-23 Transcript/audio messaging | F4, G7 |

S3.1 output (capture, VAD, indicator, STT provider, PTT flow) is consumed by S3.2 (barge-in uses
capture and the pre-roll buffer) and S3.3 (wake word reuses capture and VAD).
