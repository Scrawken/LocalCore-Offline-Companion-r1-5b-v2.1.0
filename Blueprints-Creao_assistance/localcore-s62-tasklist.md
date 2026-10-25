# LocalCore — S6.2 Implementation Task List

Slice: **S6.2 — Cloud providers, BYOK, and per-request preview**
Source: Phase 6 §3 (preview), §4 (providers), §5 (configuration and credentials);
S1.2 (ModelProvider), S3.2 (TtsProvider), S3.1 (SttProvider), S6.1 (consent UI), S0.1 (gateway).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- `CloudModelProvider`, `CloudSttProvider`, and `CloudTtsProvider` implementing the existing local
  contracts.
- The OpenAI-compatible and Anthropic adapters (CL4).
- Provider configuration with presets and a custom base URL (CL3).
- Credential handling: OS keychain storage, never logged, deletable.
- Egress scope routing per request type.
- Per-request preview integration (display-only in v1).
- Provider selection and the one-way fallback rule.

**Explicit non-goals (do not build here):**
- No consent UI or activity view (S6.1).
- No end-to-end privacy verification (S6.3).
- No redaction toggles (CL2).
- No account, sync, or managed proxy — cloud is strictly BYOK (D5).
- No changes to the local provider (S1.3) or the engine (S1.2).

Rationale: S6.2 makes cloud real behind the contracts already defined. It is verified against mock
endpoints so adapters and credential handling can be tested without any provider account.

---

## 1. Ordering principles

1. **Contracts before adapters** — providers satisfy interfaces that already exist.
2. **Configuration before credentials** — a provider needs an endpoint before a key.
3. **Credentials before any request** — no request without a resolved, stored key.
4. **Scope routing before providers execute** — a request must know which scope it consumes.
5. **Preview before send** — the gateway computes the preview; the provider must not bypass it.
6. **Local stays default.** Cloud is opt-in per conversation or per turn.
7. **One-way fallback.** Cloud may fall back to local; local never falls back to cloud.

---

## 2. Task list

### Group 1 — Cloud providers

**A1 — `CloudModelProvider`**

Deliverable: a `ModelProvider` implementation (Phase 1 §3.1).

Definition of done:
- [ ] Implements `id`, `displayName`, `capabilities()`, `load`, `unload`, `stream`, `countTokens`,
      `health`.
- [ ] `capabilities()` reports `egress: true` and the real context/output limits.
- [ ] The engine drives it with **no provider-specific branches** (P6-14).
- [ ] Streaming semantics match local so the engine is unchanged.

**A2 — `CloudSttProvider`**

Deliverable: an `SttProvider` implementation (Phase 3 §2.1).

Definition of done:
- [ ] Implements the full `SttProvider` contract with `egress: true`.
- [ ] Audio is transmitted only after a previewed consent event (ties to C4 in S6.1).
- [ ] The provider is registered behind the same contract, so voice code is unchanged.
- [ ] Failure modes match the local provider's error taxonomy.

**A3 — `CloudTtsProvider`**

Deliverable: a `TtsProvider` implementation (Phase 3 §3.1).

Definition of done:
- [ ] Implements the full `TtsProvider` contract with `egress: true`.
- [ ] Reply text is transmitted only after a previewed consent event.
- [ ] Viseme support is reported honestly; absence falls back to the amplitude path (ties to S4.3).
- [ ] Streaming semantics match local.

**A4 — Egress scope routing**

Definition of done:
- [ ] Chat routes under `network:cloud-inference` (P6-16).
- [ ] STT and TTS route under `network:cloud-voice` (P6-16).
- [ ] Model and asset acquisition route under `network:model-download` / `network:asset-download`.
- [ ] **Voice egress is separate from inference:** allowing inference does not allow voice
      (P6-16, P6-4).

---

### Group 2 — OpenAI-compatible adapter

**B1 — Adapter implementation**

Definition of done:
- [ ] Chat completions are requested in the OpenAI-compatible shape (CL4).
- [ ] The base URL is configurable (preset or custom) (CL3).
- [ ] The adapter never constructs a request without going through the gateway.
- [ ] Timeouts and cancellation are honoured.

**B2 — Streaming mapping**

Definition of done:
- [ ] Server-sent chunks map to `CompletionChunk` in order, with no loss or duplication
      (test B2-T1).
- [ ] Usage maps to a single `usage` chunk where provided.
- [ ] Stream end maps to `done` with the correct finish reason.
- [ ] A malformed stream terminates cleanly with `done`/`error`.

**B3 — Error mapping**

Definition of done:
- [ ] HTTP 401/403 → `consent-denied` or an auth error, never a silent retry.
- [ ] 429 → `rate-limited`, recoverable.
- [ ] 5xx and timeouts → `provider-unavailable`, recoverable.
- [ ] Network unreachable → `offline`.

---

### Group 3 — Anthropic adapter

**C1 — Adapter implementation**

Definition of done:
- [ ] Messages are sent in Anthropic's native shape (CL4).
- [ ] The system prompt is mapped correctly (persona block handling).
- [ ] The adapter honours the same timeout, cancellation, and gateway rules.
- [ ] Both adapters are selectable per provider configuration (P6-15).

**C2 — Message format mapping**

Definition of done:
- [ ] Role mapping is correct and preserves order (test C2-T1).
- [ ] Multi-turn history maps without loss.
- [ ] A message format the adapter cannot represent fails with a clear error, not a silent
      truncation.
- [ ] Mapping is covered by fixture tests.

**C3 — Streaming mapping**

Definition of done:
- [ ] Anthropic's streaming events map to `CompletionChunk` in order.
- [ ] Usage is captured where provided.
- [ ] Cancellation aborts the upstream request.
- [ ] Malformed streams terminate cleanly.

---

### Group 4 — Configuration

**D1 — Presets and custom URL**

Deliverable: the configuration from Phase 6 §5 (CL3).

Definition of done:
- [ ] Presets exist for common providers (OpenAI, Anthropic) supplying `kind` and `baseUrl`.
- [ ] A **custom** option accepts any user-entered base URL (P6-21).
- [ ] **A preset never includes a key** (P6-21).
- [ ] A custom URL must satisfy the same host-allowlist consent as a preset (P6-21).

**D2 — Provider configuration model**

Definition of done:
- [ ] `CloudProviderConfig` includes `id`, `kind`, `presetId`, `baseUrl`, `modelId`, `apiKeyRef`,
      `enabled`.
- [ ] Config is persisted in app-data and validated on load.
- [ ] An invalid config disables the provider with a clear reason rather than failing at request
      time.
- [ ] Multiple providers can be configured; one is selected per conversation.

**D3 — Model selection**

Definition of done:
- [ ] A provider's model id is configurable and recorded in each assistant turn (ties to S1.2).
- [ ] Changing the model affects future turns only.
- [ ] An unavailable model produces a structured error, not a silent substitution.
- [ ] The selected model is visible in the UI.

---

### Group 5 — Credentials

**E1 — Keychain storage**

Deliverable: BYOK handling (Phase 6 §5).

Definition of done:
- [ ] Keys are stored in the **OS keychain** via `safeStorage`; only a reference is persisted
      (P6-19).
- [ ] The key is resolved at request time and held only in memory (test E1-T1).
- [ ] A key cannot be read from the config file or any app-data file.
- [ ] Key storage failure fails the provider setup, never falling back to plaintext.

**E2 — Key never logged**

Definition of done:
- [ ] Keys are **never** written to logs, the audit log, error output, or crash reports
      (P6-26).
- [ ] A test injects a distinctive key value and asserts it appears nowhere in any log (P6-26).
- [ ] Error messages from the provider are scrubbed before surfacing.
- [ ] The activity view shows host and purpose, never the credential.

**E3 — Key deletion**

Definition of done:
- [ ] Removing a provider deletes its keychain entry (P6-20).
- [ ] Deleting the key disables the provider immediately.
- [ ] A subsequent request fails with a clear "no credential" error.
- [ ] Deletion is audited without recording the key.

---

### Group 6 — Preview & selection

**F1 — Preview integration**

Definition of done:
- [ ] Every cloud request computes a preview through the S0.1 gateway before sending (P6-12).
- [ ] The preview is **display-only** in v1; no redaction controls (P6-13).
- [ ] The preview reflects the actual serialized payload (P6-12).
- [ ] The provider cannot send a request that bypasses the preview.

**F2 — Provider selection**

Definition of done:
- [ ] **Local remains the default provider** (D4).
- [ ] Cloud is selectable per conversation or per turn.
- [ ] Each assistant turn records which provider produced it.
- [ ] The UI can display which turns were local and which were cloud.

**F3 — One-way fallback**

Deliverable: the rule from Phase 6 §4.

Definition of done:
- [ ] A failed cloud request may fall back to local, with a **visible notice** (P6-17).
- [ ] A local request **never** falls back to cloud, under any failure (P6-17).
- [ ] The fallback direction is enforced in code, not by convention (test F3-T1).
- [ ] The fallback and its direction are recorded in the audit log.

---

### Group 7 — Verification

**G1 — Test doubles**

Definition of done:
- [ ] Mock OpenAI-compatible and Anthropic endpoints serve scripted streams.
- [ ] Mocks can simulate auth failure, rate limiting, timeout, malformed stream, and success.
- [ ] A mock keychain records access without exposing values.
- [ ] No test contacts a real provider.

**G2 — P6-12: preview accuracy**

Definition of done:
- [ ] P6-12 passes: the preview matches the actual transmitted payload.
- [ ] The assertion compares the preview to the bytes the gateway sends.

**G3 — P6-14: provider swap**

Definition of done:
- [ ] P6-14 passes: cloud providers satisfy the same contracts; the engine is unchanged.
- [ ] Swapping local ↔ cloud mid-conversation preserves history and ordering.

**G4 — P6-15: both adapters**

Definition of done:
- [ ] P6-15 passes: OpenAI-compatible and Anthropic both function end to end against mocks.
- [ ] Fixture tests cover message-format mapping for both.

**G5 — P6-16: cloud voice scope**

Definition of done:
- [ ] P6-16 passes: voice egress uses `cloud-voice`, separate from inference.
- [ ] Allowing inference does not permit voice.

**G6 — P6-19 / P6-20: credentials**

Definition of done:
- [ ] P6-19 passes: keys are in the OS keychain, never logged or audited.
- [ ] P6-20 passes: removing a provider removes its keychain entry.

**G7 — P6-21 / P6-26: configuration and audit privacy**

Definition of done:
- [ ] P6-21 passes: presets supply endpoint defaults; a custom URL is accepted.
- [ ] P6-26 passes: the audit log contains host/path/categories/hash, never bodies or keys.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S1.2-E1, S6.1-C1 | B1, C1 |
| A2 | S3.1-D1, S6.1-C1 | A4 |
| A3 | S3.2-A1, S6.1-C1 | A4 |
| A4 | A1, A2, A3, S0.1-A1 | G5 |
| B1 | A1, D1, E1 | B2, B3 |
| B2 | B1 | G2 |
| B3 | B1 | — |
| C1 | A1, D1, E1 | C2, C3 |
| C2 | C1 | G4 |
| C3 | C1 | G4 |
| D1 | S0.1-A3 | B1, C1 |
| D2 | D1 | D3, F2 |
| D3 | D2 | F2 |
| E1 | S0.1-B2 | E2, E3 |
| E2 | E1, S0.1-F1 | G6 |
| E3 | E1 | G6 |
| F1 | A1–A3, S0.1-D3 | G2 |
| F2 | D2, D3 | F3 |
| F3 | F2, S1.3-A1 | G3 |
| G1 | B1, C1, E1 | G2–G7 |
| G2 | G1, F1 | — |
| G3 | G1, F2, F3 | — |
| G4 | G1, C1, C2, C3 | — |
| G5 | G1, A4 | — |
| G6 | G1, E1, E2, E3 | — |
| G7 | G1, D1, E2 | — |

Parallel opportunities: the OpenAI-compatible and Anthropic adapters (Groups 2 and 3) can be built
concurrently. Group 5 (credentials) is independent of the adapters once configuration exists.

---

## 4. Slice-level Definition of Done

S6.2 is complete when **all** of the following hold:

- [ ] Cloud model, STT, and TTS providers satisfy the existing local contracts (P6-14).
- [ ] Both the OpenAI-compatible and Anthropic adapters function end to end (P6-15).
- [ ] Voice egress uses `cloud-voice`, separate from inference (P6-16).
- [ ] Presets supply endpoint defaults and a custom URL is accepted (P6-21).
- [ ] Keys live in the OS keychain and are never logged or audited (P6-19, P6-26).
- [ ] Removing a provider removes its keychain entry (P6-20).
- [ ] Every cloud request computes a truthful preview before sending (P6-12).
- [ ] No redaction controls exist in v1 (P6-13).
- [ ] Local remains the default provider (F2).
- [ ] Fallback is one-way: cloud → local only, with a visible notice (P6-17).
- [ ] All tests run offline against mock endpoints.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Key written to a log or the audit log | Credential exposure | Injected-key absence test across all logs (E2, G6) |
| Preset ships with a key | Credential distribution | Presets carry no key; asserted (D1, G7) |
| Cloud provider bypasses the preview | Uninformed egress | Preview computed by the gateway; provider cannot skip it (F1) |
| Local request falls back to cloud | Silent leakage on a local failure | One-way fallback enforced in code (F3, G3) |
| Voice allowed by enabling inference | Audio sent without audio-specific consent | Separate scopes; asserted (A4, G5) |
| Adapter message mapping loses turns | Silent history truncation | Fixture tests; explicit failure on unrepresentable formats (C2) |
| Custom URL to an unapproved host | Egress outside the allowlist | Custom URLs satisfy the same host-consent (D1) |
| Key storage falls back to plaintext | Catastrophic exposure | Fail setup rather than degrade (E1) |
| Model change rewrites history | Turn provenance lost | Model recorded per turn; changes affect future only (D3) |

---

## 6. Traceability

| Phase 6 reference / test | Covered by |
|---|---|
| §3 Per-request preview (display-only, CL2) | F1 |
| §4 Cloud providers behind local contracts | A1–A3 |
| §4 Scope routing | A4 |
| §4 One-way fallback | F3 |
| §5 `CloudProviderConfig`, presets + custom (CL3) | D1, D2 |
| §5 Credential handling (BYOK) | E1–E3 |
| §5 OpenAI-compatible + Anthropic (CL4) | B1, C1 |
| P6-12 Preview accuracy | F1, G2 |
| P6-13 Display-only | F1 |
| P6-14 Provider swap | A1, G3 |
| P6-15 Both adapters | B1, C1, G4 |
| P6-16 Cloud voice scope | A4, G5 |
| P6-19 Key storage | E1, G6 |
| P6-20 Key deletion | E3, G6 |
| P6-21 Presets + custom | D1, G7 |
| P6-26 Audit privacy | E2, G7 |

S6.2 output (cloud providers, credentials, preview) is consumed by S6.3 (end-to-end privacy
verification) and the release checklist (GATE-5).
