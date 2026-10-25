# LocalCore — S4.2 Implementation Task List

Slice: **S4.2 — Emotion states and cue resolution**
Source: Phase 4 §2 (taxonomy, mapping, cue resolution, anti-flicker, decay);
S1.2 (ChatEvents); S4.1 (AvatarService); S1.1 (persona).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The twelve-label emotion taxonomy and its VRM expression mapping.
- Graceful degradation when an avatar lacks a blendshape.
- The persona-level collapse map.
- The `EmotionResolver`: explicit cues, chat-event rules, and a local sentiment classifier.
- Cue priority and the minimum dwell time.
- The confusion-matrix harness.
- Persona expressiveness modulation, the decay model, and `conversationMood`.
- Delivery of resolved emotion to the S4.1 `AvatarService`.

**Explicit non-goals (do not build here):**
- No lip-sync or idle animation (S4.3).
- No window modes or renderer substrate (S4.1).
- No TTS or voice input (S3.x).
- No model-emitted emotion tag as a dependency — it is an optional enhancement only.
- No cloud sentiment analysis.

Rationale: emotion resolution is cheap, local, and deterministic. It is separated from rendering and
from lip-sync so the taxonomy can be tuned against a test harness rather than against a running
avatar.

---

## 1. Ordering principles

1. **Taxonomy before mapping** — labels exist before they are mapped to blendshapes.
2. **Mapping before the resolver** — the resolver must emit labels the avatar can render.
3. **Rules before sentiment** — deterministic cues are cheaper and more reliable.
4. **Priority before dwell** — the dwell exception applies only to high-priority cues.
5. **Collapse map before tuning** — tuning burden is bounded by the persona's effective set.
6. **The resolver stays local and cheap.** No network, no per-turn LLM call.
7. **Emotion is transient.** It decays; it is not a persistent state.

---

## 2. Task list

### Group 1 — Taxonomy & mapping

**A1 — Twelve-label taxonomy**

Deliverable: the `EmotionLabel` union from Phase 4 §2.1.

Definition of done:
- [ ] The twelve labels are implemented: `neutral`, `happy`, `amused`, `excited`, `affectionate`,
      `curious`, `thinking`, `surprised`, `concerned`, `sad`, `frustrated`, `embarrassed`.
- [ ] `EmotionState` carries `label`, `intensity`, `since`, `ttlMs`, and `minDwellMs`.
- [ ] `intensity` is bounded 0–1 and validated.
- [ ] The type compiles under strict mode with no `any`.

**A2 — Expression mapping**

Deliverable: the mapping table from Phase 4 §2.2.

Definition of done:
- [ ] Every label maps to a primary blendshape plus optional secondary weight (P4-2).
- [ ] The mapping is **data, not code**, so it can be tuned per avatar.
- [ ] A test asserts every label has a mapping and no mapping key is missing (P4-2).
- [ ] Secondary weights are applied without exceeding 1.0 total.

**A3 — Graceful degradation**

Definition of done:
- [ ] If a primary blendshape is absent, the secondary is used (P4-2).
- [ ] If both are absent, the expression falls back to `neutral` (test A3-T1).
- [ ] The available expressions are read from the loaded VRM (S4.1 A4).
- [ ] Degradation is logged once per avatar, not per frame.

**A4 — Collapse map**

Deliverable: the persona-level reduction from Phase 4 §2.4.

Definition of done:
- [ ] A persona may collapse the twelve labels into a smaller effective set (P4-7).
- [ ] The taxonomy remains twelve; only the effective set is reduced.
- [ ] The collapse is applied before mapping, not after.
- [ ] A collapse is validated so it cannot produce an unmapped label.

---

### Group 2 — Emotion resolver

**B1 — Resolver interface**

Deliverable: `EmotionResolver` from Phase 4 §2.3.

Definition of done:
- [ ] `onChatEvent`, `resolve`, `current`, and `reset` are implemented.
- [ ] `resolve` takes text and an `EmotionContext` (persona, recent emotions, mood).
- [ ] The resolver is pure with respect to its inputs plus the current time (injectable clock).
- [ ] The resolver emits an `EmotionState`, never a raw label.

**B2 — Explicit cue**

Definition of done:
- [ ] If the persona model emits a structured emotion tag, it is used (Phase 4 §2.3).
- [ ] The tag is validated against the taxonomy; an unknown tag is ignored, not coerced.
- [ ] Absence of a tag is normal and does not degrade behaviour.
- [ ] The tag is optional: the resolver works identically without it (test B2-T1).

**B3 — Chat-event rules**

Deliverable: the deterministic rules from Phase 4 §2.3.

Definition of done:
- [ ] `thinking` event → `thinking` emotion.
- [ ] First token after a long pause → `curious`.
- [ ] `turnCompleted` with an error → `concerned`.
- [ ] `cancelled` → `neutral`.

**B4 — Local sentiment classifier**

Definition of done:
- [ ] A small local classifier (or lexicon) produces valence/arousal from user and assistant text.
- [ ] It runs locally with no network and no per-turn LLM call (Phase 4 §0).
- [ ] Its output maps to a label together with rule context (test B4-T1).
- [ ] It is deterministic for a given text.

**B5 — Cue priority**

Definition of done:
- [ ] Priority is: explicit tag > chat-event rules > sentiment (P4-3).
- [ ] A higher-priority cue overrides a lower one within the same turn (test B5-T1).
- [ ] Priority is expressed as data, not nested conditionals.
- [ ] The chosen cue source is recorded for debugging.

---

### Group 3 — Anti-flicker & tuning

**C1 — Minimum dwell time**

Deliverable: the anti-flicker control from Phase 4 §2.4.

Definition of done:
- [ ] `minDwellMs` (default 800ms) prevents a label change before the dwell elapses (P4-6).
- [ ] High-priority cues (error, barge-in) bypass the dwell (test C1-T1).
- [ ] Bypass is explicit and limited to a documented cue set.
- [ ] Dwell uses the injectable clock.

**C2 — Confusion-matrix harness**

Deliverable: the tuning harness from Phase 4 §2.4.

Definition of done:
- [ ] A labelled corpus drives the resolver and produces a confusion matrix (P4-8).
- [ ] The harness asserts an accuracy threshold and that **no label is unreachable** (P4-8).
- [ ] It flags labels that are constantly over-triggered (P4-8).
- [ ] The corpus and threshold are versioned so tuning changes are comparable.

**C3 — Determinism**

Definition of done:
- [ ] The same event stream and clock produce the same emotion sequence across runs
      (test C3-T1).
- [ ] No randomness, wall-clock reads, or iteration-order dependence.
- [ ] The confusion matrix is reproducible.
- [ ] Determinism holds with the collapse map applied.

---

### Group 4 — Persona modulation & decay

**D1 — Expressiveness scalar**

Definition of done:
- [ ] A persona `expressiveness` value scales emotion intensity (P4-5).
- [ ] A lower value produces lower intensity for the same cue (P4-5).
- [ ] The scalar cannot push intensity outside 0–1.
- [ ] The default expressiveness is documented.

**D2 — Decay model**

Definition of done:
- [ ] Transient emotions carry `ttlMs` and decay to the resting state (P4-4).
- [ ] Decay is time-driven and deterministic for a given event stream (P4-4).
- [ ] Decay targets `neutral` or a persona-defined baseline.
- [ ] Decay never produces an intermediate, unmapped label.

**D3 — `conversationMood`**

Definition of done:
- [ ] Mood is a slow running valence that biases the resting state (Phase 4 §2.5).
- [ ] Mood **resets each session** and is not persisted (A4, P4-9).
- [ ] Mood never overrides an explicit cue.
- [ ] Mood's effect on the resting state is bounded and documented.

---

### Group 5 — Avatar integration

**E1 — Emotion delivery**

Definition of done:
- [ ] Resolved emotion is delivered via `AvatarService.setEmotion` (S4.1 B1).
- [ ] Delivery is throttled so rapid changes do not flood IPC (test E1-T1).
- [ ] The delivered state includes intensity, not just the label.
- [ ] A delivery failure does not break the conversation.

**E2 — Intensity handling**

Definition of done:
- [ ] Intensity maps to expression weight within the mapping's bounds.
- [ ] Intensity 0 produces the resting state, not an empty expression.
- [ ] Intensity changes are applied smoothly, not as jumps, where the renderer supports it.
- [ ] Intensity is clamped before delivery.

**E3 — Avatar unavailable**

Definition of done:
- [ ] With the avatar failed or in tray-only mode, emotion resolution continues without error.
- [ ] No emotion work is done when the avatar is not rendering (test E3-T1).
- [ ] Re-entering a visible mode does not replay a stale emotion backlog.
- [ ] The resolver state is preserved across mode changes (ties to S4.1 C4).

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] A scripted `ChatEvent` stream drives the resolver deterministically.
- [ ] The clock is injectable for decay and dwell tests.
- [ ] A stub avatar records delivered emotions without rendering.
- [ ] Tests run offline and deterministically.

**F2 — P4-1: emotion trigger**

Definition of done:
- [ ] P4-1 passes: each of the twelve labels triggers deterministically from a harness.
- [ ] Every label is reachable (ties to C2).

**F3 — P4-2: expression mapping**

Definition of done:
- [ ] P4-2 passes: every label maps to a valid expression; missing blendshapes degrade gracefully.
- [ ] The mapping table is asserted to be complete.

**F4 — P4-3: cue priority**

Definition of done:
- [ ] P4-3 passes: explicit tag beats event rules beats sentiment.
- [ ] Override within a turn is asserted.

**F5 — P4-4: decay**

Definition of done:
- [ ] P4-4 passes: transient emotions decay to baseline within `ttlMs`.
- [ ] Decay is asserted with an injected clock.

**F6 — P4-5: persona modulation**

Definition of done:
- [ ] P4-5 passes: lower expressiveness produces lower intensity.

**F7 — P4-6: minimum dwell**

Definition of done:
- [ ] P4-6 passes: a label cannot change before `minDwellMs` except on high-priority cues.

**F8 — P4-7: collapse map**

Definition of done:
- [ ] P4-7 passes: a persona collapse reduces the effective set without changing the taxonomy.

**F9 — P4-8: confusion matrix**

Definition of done:
- [ ] P4-8 passes: the labelled corpus meets the accuracy threshold; no unreachable label.
- [ ] Over-triggered labels are flagged.

**F10 — P4-9: mood reset**

Definition of done:
- [ ] P4-9 passes: `conversationMood` starts at baseline each session.
- [ ] Mood is asserted not to be persisted.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1 (shared types) | A2, B1 |
| A2 | A1, S4.1-A4 | A3, E2 |
| A3 | A2, S4.1-A4 | F3 |
| A4 | A1 | C2, F8 |
| B1 | A1, S1.2-C2 | B2–B5 |
| B2 | B1 | B5 |
| B3 | B1, S1.2-C2 | B5 |
| B4 | B1 | B5 |
| B5 | B2, B3, B4 | C1, F4 |
| C1 | B5, S0.2 (clock) | F7 |
| C2 | A4, B5 | F9 |
| C3 | B5, C1 | F2 |
| D1 | B5, S1.1-A1 | F6 |
| D2 | B5, S0.2 (clock) | F5 |
| D3 | D2 | F10 |
| E1 | B1, S4.1-B1 | E2 |
| E2 | E1, A2 | — |
| E3 | E1, S4.1-B2 | — |
| F1 | B1, E1 | F2–F10 |
| F2 | F1, C3 | — |
| F3 | F1, A2, A3 | — |
| F4 | F1, B5 | — |
| F5 | F1, D2 | — |
| F6 | F1, D1 | — |
| F7 | F1, C1 | — |
| F8 | F1, A4 | — |
| F9 | F1, C2 | — |
| F10 | F1, D3 | — |

Parallel opportunities: Group 3 (anti-flicker and tuning) can proceed alongside Group 4 (modulation
and decay) once the resolver emits labels. Group 1's mapping can be built before the resolver.

---

## 4. Slice-level Definition of Done

S4.2 is complete when **all** of the following hold:

- [ ] All twelve labels trigger deterministically from a harness (P4-1).
- [ ] Every label maps to a valid expression, and missing blendshapes degrade gracefully (P4-2).
- [ ] Cue priority holds: explicit tag > event rules > sentiment (P4-3).
- [ ] Transient emotions decay to baseline within `ttlMs` (P4-4).
- [ ] Lower persona expressiveness produces lower intensity (P4-5).
- [ ] A label cannot change before `minDwellMs` except on high-priority cues (P4-6).
- [ ] A persona collapse map reduces the effective set without changing the taxonomy (P4-7).
- [ ] The confusion matrix meets the accuracy threshold with no unreachable label (P4-8).
- [ ] `conversationMood` resets each session and is not persisted (P4-9).
- [ ] Resolution is local and cheap: no network and no per-turn LLM call.
- [ ] All tests run offline and deterministically with an injected clock.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Twelve labels flicker between near-neighbours | Looks more artificial than a single expression | Minimum dwell; confusion matrix; collapse map (C1, C2, A4) |
| A label is unreachable | Taxonomy is decorative | Confusion harness asserts reachability (C2, F9) |
| Sentiment classifier over-triggers one label | Avatar looks stuck | Over-trigger flagging in the harness (C2) |
| Model-emitted tag treated as required | Breaks on small models that omit it | Tag is optional; resolver works without it (B2) |
| Decay produces an unmapped intermediate | Render error | Decay targets mapped states only (D2) |
| Emotion work continues with no avatar rendering | Wasted CPU in tray-only | Resolution paused when not rendering (E3) |
| Rapid emotion changes flood IPC | Renderer stutter | Throttled delivery (E1) |
| Persona expressiveness pushes intensity out of range | Invalid expression weights | Clamping (D1, E2) |
| Mood persists across sessions | User surprised by carried-over mood | Reset each session; asserted (D3, F10) |

---

## 6. Traceability

| Phase 4 reference / test | Covered by |
|---|---|
| §2.1 Twelve-label taxonomy | A1 |
| §2.2 Expression mapping | A2, A3 |
| §2.3 Cue resolution (tag, rules, sentiment, persona) | B2–B5 |
| §2.3 `EmotionResolver` | B1 |
| §2.4 Minimum dwell, collapse map, confusion harness | C1, C2, A4 |
| §2.5 Decay and `conversationMood` | D2, D3 |
| §6 Delivery to the avatar | E1–E3 |
| P4-1 Emotion trigger | F2 |
| P4-2 Expression mapping | A2, F3 |
| P4-3 Cue priority | B5, F4 |
| P4-4 Decay | D2, F5 |
| P4-5 Persona modulation | D1, F6 |
| P4-6 Minimum dwell | C1, F7 |
| P4-7 Collapse map | A4, F8 |
| P4-8 Confusion matrix | C2, F9 |
| P4-9 Mood reset | D3, F10 |

S4.2 output (resolved `EmotionState`) is consumed by S4.3 (lip-sync and idle animation run
alongside emotion) and by the persona authoring surface.
