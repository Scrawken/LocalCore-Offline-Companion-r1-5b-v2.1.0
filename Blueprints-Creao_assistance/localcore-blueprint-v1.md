
# LocalCore — Product Blueprint (v1.0, final)

Windows desktop AI companion. Local-first, offline-capable, cloud optional and off by default.
Fully standalone — no CREAO-hosted services. Extends the existing Electron project.
Supersedes v0.1 and v0.2.

---

## 1. Locked decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Memory default | **Opt-out** — remembers by default, user can disable |
| D2 | Companion model | **One companion now**, multi-character-ready schema |
| D3 | Voice input | **Push-to-talk default**, wake word opt-in (ships in Phase 3) |
| D4 | Cloud posture | **Optional, off by default** |
| D5 | Hosting | **None — fully standalone** (no hosted services) |
| D6 | Hardware floor | **8GB / integrated GPU should work**; higher tiers are the real experience |
| D7 | Memory retention | **Prune raw turns after a rolling window; keep rolled-up summaries** |
| D8 | Memory scope | **Facts + full transcripts** captured by default |
| D9 | Latency target | **Recommended:** see §2 (≤3s first token on floor tier) |
| D10 | Wake word phase | **Phase 3**, alongside push-to-talk |
| D11 | Hardware tiers | **Tier-based** — detect and degrade gracefully |

### Invariants
- No network egress without an explicit, recorded consent event.
- All conversation, memory, and avatar data stays on device by default.
- The model is replaceable, addressed only through the Model Provider contract.
- Generated media is user data with inspect / save / delete controls.
- Every memory layer is viewable, deletable, and exportable.

---

## 2. Performance targets (recommended, to be measured)

D9 needed a recommendation, so here it is. These are **targets to validate in the Phase 0 prototype**, not promises.

**The floor row is parameterised.** Its model class and first-token target are the `floor.model` and
`floor.firstTokenTargetMs` parameters; the authoritative outcome matrix is **Phase 1 §0.1**. The
values shown are the P0 default, in force until the S0.4 spike reports.

| Tier | Typical hardware | Model class | First-token target | Full reply |
|---|---|---|---|---|
| Floor | 8GB RAM, integrated GPU | `floor.model` (P0: 2–3B, Q4) | **`floor.firstTokenTargetMs` (P0: ≤3s)** | Streaming |
| Mid | 8–12GB VRAM | 7–8B, Q4 | ≤1.5s | Streaming |
| High | 16GB+ VRAM | 8–14B, Q4/Q5 | ≤1s | Streaming |

Supporting rules:
- **Never block the UI.** Show a "thinking" indicator within ~300ms even if the first token is seconds away. Perceived latency is governed by that indicator, not by the model.
- **Stream immediately.** First token should start the response; do not wait for completion.
- **Voice round-trip** is inherently slower on the floor tier — set expectations in the UI rather than hiding it.
- If the floor tier cannot hit `floor.firstTokenTargetMs` with a 2–3B model, apply profile **P1** (Phase 1 §0.1): the model drops to 1.5B and quality drops with it. That trade is measured by the spike, not assumed.

---

## 3. Memory lifecycle (reconciling D1, D7, D8)

D8 says capture facts **and full transcripts**; D7 says prune raw turns but keep summaries. Together they define four layers with different lifetimes:

| Layer | Contents | Lifetime | Sensitivity |
|---|---|---|---|
| Session buffer | Current session turns | In memory; discarded at session end | Highest while live |
| Raw transcripts | Full turn text | **Rolling window** (recommend 30 days, user-adjustable), then pruned | Highest |
| Rolling summaries | Condensed conversation summaries | Long-term until deleted | Medium |
| Facts | Extracted preferences/entities | Long-term until deleted | Medium |

Net effect: recent conversations are fully readable; older ones survive only as summaries plus extracted facts.

### Why this needs explicit controls
Opt-out + full transcripts is the most sensitive default available. It is defensible **only** because nothing leaves the device and everything is reversible. Required controls:
- **Persistent memory indicator** — always visible while memory is active.
- **Unified memory panel** — shows facts, summaries, *and* raw transcripts, each with source turns.
- **Per-layer deletion** — delete a single fact, a summary, a whole transcript, or a conversation.
- **One-click wipe-all** — clears every layer within one turn.
- **First-run disclosure** — states plainly: memory is on, transcripts are stored locally for N days, here is how to change it — before any capture.
- **Memory write log** — visible record of what was captured and when.
- **Encryption at rest** — mandatory (Windows DPAPI / safeStorage).
- **Retention enforcement** — pruning is automatic and auditable; the user can shorten the window at any time.

If any of these controls is cut for schedule, opt-out memory becomes a trust liability. They are not optional polish.

---

## 4. Phased MVP plan

Each phase ships something usable and independently testable.

### Phase 0 — Foundation & guardrails
Deliverables: Egress Gateway (single network choke point); Consent store (network default-deny); app-data layout with no-writes-outside guarantee; crash/restart persistence; **resource governor prototype**; **hardware tier detector**.
Acceptance:
- Full chat turn completes with all outbound network blocked — no crash, no retry storm.
- No writes outside the app-data dir across a full session (filesystem watcher).
- A network call without consent is blocked and logged.
- Resource governor unloads/reloads the model without losing conversation state.
- **Floor-tier prototype proves LLM + avatar + voice can coexist on 8GB integrated** (or documents the serialization required).

### Phase 1 — Reliable character & chat
Deliverables: persona definition; streaming chat with cancel; conversation persistence/search/delete; two swappable model providers (at least one floor-tier local model); context assembly.
Acceptance:
- 50-turn session survives restart with identical history and order.
- Provider swap mid-session does not corrupt history.
- Cancel mid-stream leaves no partial turn; next turn clean.
- First-token and full-response latency measured per tier against §2 targets.
- "Thinking" indicator appears within ~300ms on the floor tier.
- Deleting a conversation removes rows and derived summaries; second delete is a no-op.

### Phase 2 — Memory (opt-out) with the §3 lifecycle
Deliverables: the four memory layers; encrypted local store; local embeddings + vector index; retention/pruning job; the full control set in §3.
Acceptance:
- First run discloses memory-on and the retention window before any capture.
- Memory indicator visible at all times.
- Unified panel shows facts, summaries, and raw transcripts with source traces.
- Wipe-all clears all layers within one turn; retrieval then returns nothing.
- Raw transcripts older than the window are pruned and replaced by summaries (verified by aging a test corpus).
- Disabling memory stops writes and injection immediately, no restart.
- Store encrypted at rest.

### Phase 3 — Voice
Deliverables: push-to-talk STT; TTS with stop/barge-in; always-visible mic indicator; **wake word (opt-in, on-device)**.
Acceptance:
- Push-to-talk round-trip works hands-free.
- TTS interruptible mid-sentence; companion reacts correctly.
- Mic indicator visible whenever the mic is open; mute immediate.
- Wake word is off by default, requires explicit opt-in, runs on-device, and shows an armed-listening indicator.
- No audio persisted unless the user explicitly enables it.
- Voice + LLM serialize correctly on the floor tier.

### Phase 4 — Avatar expressiveness
Deliverables: emotion states; lip-sync from TTS; idle animation/blink; window modes (full / overlay / tray-only).
Acceptance:
- Emotions trigger deterministically from a test harness.
- Lip-sync tracks TTS amplitude; mouth closes on silence.
- Idle animation starts after a configurable period, stops on interaction.
- Rendering stays within the tier budget (floor target ~30fps).
- Tray-only mode still supports chat and voice.

### Phase 5 — Desktop tools with permissions
Deliverables: tool registry with declared scopes; Action Broker; approval UX showing exact target/command/diff; scoped filesystem roots; audit log.
Acceptance:
- Unapproved action is blocked, not executed, and surfaced.
- Approval dialog shows the exact command/path/diff.
- "Allow once / session / always" behave distinctly and are revocable.
- Revoking a scope stops the tool immediately, mid-session.
- Every consequential action is in the audit log with a matching result.
- Destructive actions never proceed on a single implicit approval.

### Phase 6 — Optional third-party cloud (no CREAO)
Deliverables: explicit cloud enablement (off by default); per-request consent with redaction preview; cloud providers behind the same Model Provider contract; no account, no CREAO services.
Acceptance:
- Fresh install performs zero network egress (verified at OS level).
- Enabling cloud requires an explicit toggle plus acknowledgment.
- Each cloud call previews exactly what would be sent.
- Disabling cloud returns to fully local with no residual calls.

---

## 5. Component architecture & contracts

- **Presentation** — chat, avatar window, tray, settings, permission dialogs, memory panel.
- **Companion Core (Orchestrator)** — owns a turn end-to-end.
- **Capability services** — Model Provider, Memory, Voice, Avatar, Desktop Tools. No service calls another directly.
- **Platform services** — Permission & Consent, Egress Gateway, Asset Vault, Audit Log, Resource Governor, Tier Detector.
- **Foundation** — Electron main/renderer, local storage, OS keychain/DPAPI.

Contracts:
- **Model Provider** — stream(messages, params) → tokens; embeddings(text) → vectors; capabilities descriptor.
- **Memory** — write(fact|summary|transcript, source); retrieve(query); list/edit/delete per layer; export/import; wipe-all; set retention; enable/disable.
- **Voice** — transcribe(audio) → text; synthesize(text) → audio + viseme timing.
- **Avatar** — setEmotion, setPose, speakWithVisemes, setIdleProfile, setWindowMode.
- **Desktop Tools** — declare scope, dry-run description, approval, execute, log.
- **Permission & Consent** — request/grant/revoke with immediate effect.
- **Egress Gateway** — send(request, justification); deny by default.
- **Resource Governor** — acquire/release pipelines; evict idle model; coordinate heavy work.
- **Tier Detector** — probe RAM/VRAM → quality preset.

Turn flow: input → memory check + retrieval → prompt assembly → streamed generation → avatar cues + optional TTS → persist → memory write (unless disabled) → audit.

---

## 6. Local vs cloud matrix

| Capability | Default | Cloud option | Privacy implication |
|---|---|---|---|
| Chat generation | Local (tier-appropriate model) | Optional, per-conversation | Cloud sees assembled prompt incl. memory unless redacted |
| Embeddings / retrieval | Local | Optional | Bulk text egress; keep local |
| Memory store | **Local, on by default, encrypted** | None (standalone) | Never leaves device; safety via transparency + wipe |
| Raw transcripts | **Local, rolling window** | None | Highest-sensitivity local data |
| Speech-to-text | Local | Optional | Cloud STT sends raw audio — highest sensitivity |
| Wake word | Local, on-device, opt-in | None | Always-listening must be explicit + indicated |
| Text-to-speech | Local | Optional | Cloud TTS sends reply text |
| Avatar & VRM assets | Fully local | None | No reason to cloud |
| Desktop tools | Local | None | Never delegate OS actions to cloud |
| Image / media generation | Local small model or off | Optional | Prompts can reveal intent |
| Telemetry | Off | Off | Opt-in, aggregate only, never content |

---

## 7. Standalone vs CREAO-hosted

**Decision D5: fully standalone. Nothing requires CREAO.** Phases 0–6 ship with no server component. Optional cloud inference uses third-party providers gated by the Egress Gateway. No account, no sync, no marketplace. Any future hosted feature would be additive and must degrade to local-only.

---

## 8. Risks (ranked)

1. **Floor-tier feasibility (top risk).** 8GB + integrated may not run LLM + avatar + voice concurrently. Mitigation: resource governor + serialization, validated in Phase 0.
2. **Full transcripts on by default.** Highest-sensitivity default; the §3 controls are load-bearing. Mitigation: disclosure, indicator, wipe, encryption, retention.
3. **Weak small-model behavior.** Persona consistency and memory extraction at 2–3B will be rough. Mitigation: constrained extraction, structured memory formats, persona engineering.
4. **Wake word privacy.** Off by default, on-device, visible armed indicator.
5. **Prompt injection via tools/retrieved content.** Treat retrieved and tool content as untrusted data.
6. **Model licensing.** Ship license metadata with every model.
7. **Scope creep into OS automation.** Keep Phase 5 scoped and permissioned.

---

## 9. Recommended next step

Freeze Phase 0 scope. The two deliverables that de-risk everything else are the **Egress Gateway** (makes "off by default" provable) and the **floor-tier resource-governor prototype** (proves the 8GB experience is real). Both are cheap now and expensive to retrofit.
