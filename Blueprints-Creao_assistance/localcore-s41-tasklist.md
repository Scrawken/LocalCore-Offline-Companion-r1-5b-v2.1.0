# LocalCore — S4.1 Implementation Task List

Slice: **S4.1 — Avatar renderer and window modes**
Source: Phase 4 §1 (architecture), §5 (window modes), §6 (governor);
S0.1 (sandbox); S0.2 (governor).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The VRM renderer wired into the renderer process (three.js + three-vrm).
- The `AvatarService` control surface and its IPC command set.
- Window modes: full, overlay, and tray-only.
- Overlay click-through (on by default) and always-on-top behaviour.
- Position and mode persistence.
- Governor integration: light-pipeline classification, throttling, suspension during model load,
  and the degradation ladder.
- Renderer sandboxing and performance reporting.

**Explicit non-goals (do not build here):**
- No emotion resolution (S4.2) — this slice renders a static or neutral avatar.
- No lip-sync or idle animation (S4.3).
- No TTS or viseme consumption (S3.2).
- No avatar authoring or asset marketplace.

Rationale: S4.1 builds the rendering substrate and the windowing behaviour. It is separated from
emotion and lip-sync so the performance-critical, resource-sensitive parts can be measured and
tuned against the S0.4 budget before expressive behaviour is layered on.

---

## 1. Ordering principles

1. **Renderer before service** — the control surface needs something to control.
2. **Service before window modes** — modes are commands on the service.
3. **Sandbox before any asset load** — the renderer must never be able to reach the network.
4. **Full mode before overlay and tray-only** — overlay and tray are variations on a working base.
5. **Governor integration before degradation** — the ladder is driven by governor signals.
6. **Persistence alongside modes** — a mode that cannot be restored is a bug.
7. **Tray-only must release resources.** It is the strongest lever the user has over avatar cost.

---

## 2. Task list

### Group 1 — Renderer foundation

**A1 — VRM renderer wiring**

Deliverable: the existing VRM renderer integrated into the app.

Definition of done:
- [ ] The renderer loads a VRM and renders it in the renderer process using WebGL.
- [ ] A default/bundled VRM is used when no user asset is configured.
- [ ] Rendering starts only when a visible mode is active (not in tray-only).
- [ ] A renderer crash does not take down the app; it is reported and recoverable (test A1-T1).

**A2 — Renderer sandbox**

Definition of done:
- [ ] The renderer performs **no network access** (P4-23).
- [ ] It inherits the S0.1 sandbox: context isolation, no node integration, CSP `connect-src 'none'`.
- [ ] The avatar renderer cannot reach the proxy, the server, or any host (test A2-T1).
- [ ] Asset loading is restricted to the app-data asset directory.

**A3 — Performance reporting**

Definition of done:
- [ ] The renderer reports FPS and GPU/memory pressure to the main process (Phase 4 §1).
- [ ] Reporting is periodic and cheap.
- [ ] The reported FPS is the rendered FPS, not a nominal target.
- [ ] Reporting continues under throttling so the governor can see the effect of its decisions.

**A4 — VRM asset loading**

Definition of done:
- [ ] Assets load from the app-data assets directory with integrity verification.
- [ ] A corrupt or incompatible VRM produces a clear error and falls back to the default.
- [ ] Loading is bounded in time; a slow load does not freeze the UI.
- [ ] The loaded asset's capabilities (available expressions) are reported for S4.2.

---

### Group 2 — AvatarService

**B1 — Control surface**

Deliverable: `AvatarService` from Phase 4 §1.

Definition of done:
- [ ] `setEmotion`, `setPose`, `speakWithVisemes`, `setIdleProfile`, `setWindowMode` exist and are
      typed.
- [ ] `setEmotion` and `speakWithVisemes` are present but may be no-ops until S4.2/S4.3
      (documented as such).
- [ ] Commands are sent to the renderer over a defined IPC channel.
- [ ] The service is the only module that commands the renderer.

**B2 — State reporting**

Definition of done:
- [ ] `state()` returns `emotion`, `speaking`, `windowMode`, `fps`, and `quality` (Phase 4 §1).
- [ ] State reflects the renderer's actual state, not a cached command.
- [ ] State is available to the UI without polling the renderer directly.
- [ ] An `error` event is surfaced for renderer failures.

**B3 — Command ordering and idempotency**

Definition of done:
- [ ] Commands are applied in order; a later command supersedes an earlier one (test B3-T1).
- [ ] Re-issuing an identical command is idempotent.
- [ ] A command issued before the renderer is ready is queued or dropped per a documented rule.
- [ ] Rapid command sequences do not produce a stale final state.

**B4 — Error handling**

Definition of done:
- [ ] A renderer failure is reported as an `error` event with a safe reason.
- [ ] The app remains usable (chat and voice) with the avatar failed.
- [ ] Recovery attempts are bounded and logged.
- [ ] A failed avatar never blocks chat.

---

### Group 3 — Window modes

**C1 — Full mode**

Definition of done:
- [ ] Full mode shows the normal window with chat and avatar (Phase 4 §5.1).
- [ ] It is the default mode.
- [ ] Resizing does not break avatar rendering or aspect ratio.
- [ ] Mode state is reported to the service.

**C2 — Overlay mode**

Definition of done:
- [ ] Overlay is frameless, transparent, and always-on-top, rendering only the avatar
      (Phase 4 §5.2).
- [ ] **Click-through is ON by default** (A3, P4-18).
- [ ] The window is movable and does not steal focus while idle.
- [ ] It respects the taskbar and stays within the visible desktop area.

**C3 — Tray-only mode**

Definition of done:
- [ ] No visible window; the app runs in the tray (Phase 4 §5.3).
- [ ] **Avatar rendering stops entirely**, releasing GPU and its light-pipeline slot (P4-15).
- [ ] Chat and voice remain fully functional via tray, hotkey, or voice.
- [ ] Re-entering a visible mode restores the avatar losslessly.

**C4 — Mode transitions**

Definition of done:
- [ ] Mode changes preserve conversation, voice, memory, and emotion state (P4-20).
- [ ] Tray-only → visible re-initializes the renderer and restores the last pose/emotion.
- [ ] Rapid mode switching does not leak renderer processes or GPU resources (test C4-T1).
- [ ] A failed transition leaves the app in a usable mode.

**C5 — Click-through and always-on-top**

Definition of done:
- [ ] `setClickThrough` and `setAlwaysOnTop` work from the tray and a hotkey (P4-18).
- [ ] A hotkey restores interaction when click-through is on.
- [ ] Click-through does not affect the full-mode window.
- [ ] The current state is discoverable in the tray menu.

---

### Group 4 — Governor integration

**D1 — Light-pipeline classification**

Definition of done:
- [ ] The avatar registers as a **light** pipeline (Phase 4 §6).
- [ ] It never requests a heavy slot (test D1-T1).
- [ ] It is throttled, never blocked.
- [ ] Its memory footprint is reported to the governor.

**D2 — Suspension during model load**

Definition of done:
- [ ] The avatar suspends animation while the LLM/STT loads and resumes after (Phase 0 S1).
- [ ] Suspension is driven by governor signals, not a timer.
- [ ] The suspension is not visible as a freeze — the last frame persists.
- [ ] Resumption is automatic.

**D3 — Degradation ladder**

Deliverable: the ordered degradation from Phase 4 §6.

Definition of done:
- [ ] The order is: reduce FPS → drop idle animation → reduce quality → freeze to a static pose
      (P4-22).
- [ ] Lip-sync and chat are preserved as long as possible.
- [ ] Each step is triggered by a governor signal and is observable in the trace.
- [ ] The ladder never reaches a state where chat is affected (P4-22).

**D4 — Tray-only resource release**

Definition of done:
- [ ] Entering tray-only releases the light-pipeline slot entirely (P4-15).
- [ ] GPU resources are released, not merely paused (test D4-T1).
- [ ] Re-entering a visible mode re-acquires the slot without a leak.
- [ ] The governor reflects the release in `stats()`.

---

### Group 5 — Persistence

**E1 — Mode persistence**

Definition of done:
- [ ] The window mode is persisted and restored on restart (P4-24).
- [ ] A restored tray-only mode does not flash a window on startup.
- [ ] An invalid stored mode falls back to full.
- [ ] Persistence uses the S0.1 config path and write wrapper.

**E2 — Overlay position persistence**

Definition of done:
- [ ] Overlay position is persisted and restored (P4-24).
- [ ] A restored position off-screen (e.g. monitor removed) is corrected to a visible position
      (test E2-T1).
- [ ] Position changes are debounced before writing.
- [ ] Multi-monitor changes do not leave the overlay unreachable.

**E3 — Asset persistence**

Definition of done:
- [ ] The selected VRM asset is persisted and restored.
- [ ] A missing asset falls back to the default with a logged reason.
- [ ] Asset selection does not require a restart.
- [ ] Asset files live under the app-data assets directory.

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] A headless renderer stub can accept commands and report FPS without a GPU.
- [ ] The governor's clock and memory are injectable.
- [ ] Window-mode tests run without a real display where possible.
- [ ] Tests run offline and deterministically.

**F2 — P4-14 / P4-18: overlay and click-through**

Definition of done:
- [ ] P4-14 passes: transparent, always-on-top, movable, click-through toggle works.
- [ ] P4-18 passes: click-through is on by default and restorable via hotkey/tray.

**F3 — P4-15: tray-only**

Definition of done:
- [ ] P4-15 passes: rendering stops; chat and voice still work.
- [ ] GPU resources are released.
- [ ] Re-entry restores the avatar.

**F4 — P4-20: mode transitions**

Definition of done:
- [ ] P4-20 passes: conversation/voice/memory/emotion state preserved across modes.
- [ ] Rapid switching does not leak renderer processes.

**F5 — P4-23: sandbox**

Definition of done:
- [ ] P4-23 passes: the avatar renderer performs no network access.
- [ ] The renderer cannot reach the proxy or any host.

**F6 — P4-24: persistence**

Definition of done:
- [ ] P4-24 passes: window mode and overlay position survive restart.
- [ ] Off-screen correction is asserted.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1-A2 | A2–A4, B1 |
| A2 | A1, S0.1-E2/E3 | F5 |
| A3 | A1, S0.2-B1 | D1 |
| A4 | A1, S0.1-B3 | B1, E3 |
| B1 | A1, A4 | B2–B4, C1 |
| B2 | B1 | D2, F4 |
| B3 | B1 | C4 |
| B4 | B1 | — |
| C1 | B1 | C2 |
| C2 | C1 | C5, F2 |
| C3 | C1 | C4, F3 |
| C4 | C2, C3, B2 | F4 |
| C5 | C2 | F2 |
| D1 | A3, S0.2-A1 | D2 |
| D2 | D1, S0.2 (events) | F3 |
| D3 | D2 | — |
| D4 | C3, D1 | F3 |
| E1 | C1, S0.1-A3 | F6 |
| E2 | C2, S0.1-A3 | F6 |
| E3 | A4, S0.1-A3 | — |
| F1 | A1, B1 | F2–F6 |
| F2 | F1, C2, C5 | — |
| F3 | F1, C3, D4 | — |
| F4 | F1, C4 | — |
| F5 | F1, A2 | — |
| F6 | F1, E1, E2 | — |

Parallel opportunities: Group 3 (window modes) and Group 4 (governor integration) can proceed
concurrently once the service exists. Group 5 (persistence) can begin as soon as a mode is
implemented.

---

## 4. Slice-level Definition of Done

S4.1 is complete when **all** of the following hold:

- [ ] A VRM renders in the app and responds to the `AvatarService` control surface (A1, B1).
- [ ] The renderer performs no network access (P4-23).
- [ ] Overlay is transparent, always-on-top, movable, with click-through on by default (P4-14,
      P4-18).
- [ ] Tray-only stops rendering and releases GPU resources while chat and voice keep working
      (P4-15).
- [ ] Mode transitions preserve conversation, voice, memory, and emotion state (P4-20).
- [ ] Window mode and overlay position survive restart, with off-screen correction (P4-24).
- [ ] The avatar is a light pipeline, throttled and never blocked (D1).
- [ ] The avatar suspends during model load and resumes automatically (D2).
- [ ] The degradation ladder never reaches a state where chat is affected (P4-22).
- [ ] All tests run offline, with a headless renderer stub where needed.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Renderer reaches the network | Breaks the sandbox guarantee | Sandbox inherited from S0.1; asserted (A2, F5) |
| Overlay becomes unclickable and unreachable | User cannot recover interaction | Click-through toggle, hotkey, tray control (C5) |
| Overlay restores off-screen after a monitor change | Invisible, unreachable window | Off-screen correction on restore (E2, F6) |
| Tray-only pauses rendering but holds GPU memory | Budget not actually released | Release, not pause; asserted (D4, F3) |
| Rapid mode switching leaks renderer processes | Memory growth | Transition leak test (C4, F4) |
| Avatar starves the model under pressure | Chat latency regression | Light pipeline, degradation ladder, suspension (D1–D3) |
| Renderer crash takes down the app | Total loss of the companion | Recoverable renderer failure (A1, B4) |
| Corrupt VRM asset | Blank or broken avatar | Integrity check and default fallback (A4, E3) |

---

## 6. Traceability

| Phase 4 reference / test | Covered by |
|---|---|
| §1 Component overview, render architecture | A1–A4, B1–B4 |
| §5.1 Full mode | C1 |
| §5.2 Overlay | C2, C5 |
| §5.3 Tray-only | C3, D4 |
| §5.4 Transitions | C4, E1, E2 |
| §6 Light pipeline, suspension, degradation | D1–D3 |
| P4-14 Overlay | C2, F2 |
| P4-15 Tray-only | C3, D4, F3 |
| P4-18 Click-through | C2, C5, F2 |
| P4-19 Tray-only chat/voice | C3 |
| P4-20 Mode transitions | C4, F4 |
| P4-22 Pressure degradation | D3 |
| P4-23 Sandbox | A2, F5 |
| P4-24 Persistence | E1, E2, F6 |

S4.1 output (`AvatarService`, window modes) is consumed by S4.2 (emotion rendering), S4.3 (lip-sync
and idle animation), S2.5 (indicator presence across modes), and S0.4's S4/S7 scenarios.
