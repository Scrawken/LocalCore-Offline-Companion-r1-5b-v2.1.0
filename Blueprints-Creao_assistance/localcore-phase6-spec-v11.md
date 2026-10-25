
# LocalCore — Phase 6 Technical Spec: Optional Cloud & Extended Presence (v1.1, final)

Scope: the Egress Gateway consent UI end to end, cloud providers behind the same contracts as
local, per-request redaction preview, and the standalone no-account posture.

Depends on Phase 0 (Egress Gateway, Consent, Audit), Phase 1 (ModelProvider), and Phase 3
(SttProvider, TtsProvider). This is the last phase. Supersedes v1.0.

---

## 0. Decisions locked in this spec

| # | Decision | Choice |
|---|---|---|
| CL1 | Default consent mode | **Ask each time** (strictest) |
| CL2 | Redaction | **Preview display-only in v1**; redaction toggles later |
| CL3 | Endpoints | **Presets for common providers + custom URL** |
| CL4 | Cloud providers | **OpenAI-compatible + Anthropic** in v1 |
| CL5 | Telemetry | **None at all** |

Also inherited: D4 (cloud off by default), D5 (fully standalone, no CREAO), V5 (cloud voice behind
the gateway), and the Phase 0 P1 personal-data policy.

Invariants:
- **Fresh install performs zero network egress.**
- **Cloud is off until explicitly enabled**, per scope.
- **Every cloud request prompts by default.** A persistent grant is an explicit user upgrade.
- **No account, no sign-up, no sync, no marketplace, no telemetry.**
- **Cloud uses user-supplied credentials.** There is no CREAO-managed proxy.
- **Personal data never leaves without a previewed consent event.**
- **Fallback is one-way.** Cloud → local is allowed; local → cloud is never silent.
- **Every egress is audited**, granted or denied.

---

# 1. No-account posture

**In scope:**
- Cloud chat models, cloud STT, cloud TTS — user-configured, user-keyed.
- A consent and activity UI over the Phase 0 gateway.
- A truthful per-request preview of what would leave the device.

**Explicitly out of scope:**
- **No account or login.** No identity system exists.
- **No sync.** Personas, memory, and media never leave the device for continuity.
- **No marketplace.** No hosted catalog of characters or assets.
- **No CREAO services.** No managed inference proxy, no distribution CDN.
- **No telemetry of any kind** (CL5). Not even opt-in.

Consequence: cloud requires the user to bring their own provider endpoint and key. That is the
price of the standalone posture.

---

# 2. Consent UI end to end

The renderer draws the UI; **the main process enforces every decision** with a per-request nonce
the renderer cannot forge.

    interface CloudConsentUI {
      getState(): CloudConsentState;
      enableScope(scope: EgressScope): Promise<void>;
      disableScope(scope: EgressScope): Promise<void>;
      setScopeMode(scope: EgressScope, mode: "deny" | "ask" | "allow"): Promise<void>;
      revokePersonalData(scope: EgressScope): Promise<void>;
      listActivity(filter?: ActivityFilter): Promise<AuditEntry[]>;
    }

    interface CloudConsentState {
      cloudEnabled: boolean;
      scopes: Array<{
        scope: EgressScope;
        mode: "deny" | "ask" | "allow";       // default: "ask" (CL1)
        personalDataConsent: boolean;
        dataConsentCategories?: DataCategory[];
        allowHosts?: string[];
      }>;
      providers: CloudProviderConfig[];
      activitySummary: { requests: number; denied: number; lastAt?: number };
    }

## 2.1 Default consent mode (CL1)

- **Every cloud scope defaults to `ask`.** The per-request dialog (§2.3) is the normal path, not an
  exception.
- A user may upgrade a specific scope to `allow` (persistent) or downgrade to `deny`.
- The personal-data gate (Phase 0 P1) still forces a previewed prompt the first time personal data
  would leave, even if a scope is set to `allow`.

## 2.2 Flow A — First-time enablement

1. Settings → Cloud shows: **"Cloud is off. Everything currently runs on your device."**
2. User toggles cloud on.
3. Disclosure states what cloud adds, what leaves the device, and which scopes exist.
4. Per-scope setup: grant, deny, or leave at the default `ask`
   (`cloud-inference`, `cloud-voice`, `model-download`, `asset-download`, `update-check`).
5. Credentials: the user picks a provider preset or enters a custom base URL, then supplies a key.
6. Optional connection test (itself a gated `cloud-inference` request).
7. Cloud is enabled only for granted scopes.

## 2.3 Flow B — Per-request consent (the default path)

1. A model or voice request needs egress.
2. The gateway assembles the payload and computes the preview (§3).
3. The dialog shows: destination host, purpose, data categories, the field-level preview, and —
   in v1 — no redaction controls (display-only, CL2).
4. The user chooses **Deny**, **Send once**, or **Always allow for this scope** (category-bound).
5. On send, an audit entry is written; on deny, the request fails with `consent-denied`.

## 2.4 Flow C — Revocation

- Settings → Cloud lists every grant; revoking takes effect on the next request with no restart.
- `revokePersonalData` returns a scope to prompting.
- Revocations are audited.

## 2.5 Flow D — Activity view

- Network activity list: timestamp, host, purpose, decision, categories, result, duration.
- Filter by scope and decision. Clearable. Retention follows the Phase 0 window (default 30 days).

## 2.6 Personal-data policy (Phase 0 P1, unchanged)

- First personal-data egress → forced previewed prompt.
- "Always allow for this scope" stores `personalDataConsent` plus the exact approved categories.
- Consent is per scope, **category-bound** (a new category re-prompts), shown by a persistent
  indicator while active, revocable in one click, fully audited.

---

# 3. Per-request preview (display-only in v1, CL2)

The preview must reflect the **actual** payload, not an approximation.

    interface RedactionPreview {
      fields: Array<{
        path: string;              // e.g. "messages[3].content"
        category: DataCategory;
        sample?: string;           // truncated, for the dialog
      }>;
      bytesEstimate: number;
      containsPersonalData: boolean;
      redactionAvailable: false;   // v1: display-only
    }

    // Defined for a later phase; NOT shipped in v1.
    interface RedactionPlan {
      excludeCategories: DataCategory[];
      excludeFields?: string[];
    }

Rules:
- v1 shows the preview but offers **no field-level removal**; the user's choice is allow-once,
  always-allow, or deny.
- The preview is computed from the exact serialized payload, so it is truthful about what leaves.
- The persona block and the current user message are always shown as required.
- When redaction ships later, the `RedactionPlan` is applied **before** the preview is computed, so
  the preview stays truthful.

---

# 4. Cloud providers behind the same contracts

Cloud implementations satisfy the exact interfaces already defined locally, so the registry treats
them as ordinary swappable providers.

- **CloudModelProvider** implements `ModelProvider` (Phase 1 §3.1).
- **CloudSttProvider** implements `SttProvider` (Phase 3 §2.1).
- **CloudTtsProvider** implements `TtsProvider` (Phase 3 §3.1).

Rules:
- Protocols: **OpenAI-compatible and Anthropic** adapters both ship in v1 (CL4).
- Every request routes through the Egress Gateway with its scope:
  - chat → `network:cloud-inference`
  - STT/TTS → `network:cloud-voice`
  - model/asset acquisition → `network:model-download` / `network:asset-download`
- Streaming semantics match local, so `ChatEngine` and `TtsService` are unchanged.
- `capabilities()` reports `egress: true` for cloud providers.
- Provider selection is per conversation or per turn; local remains the default.
- **Fallback is one-way:** cloud may fall back to local (with a visible notice); local never falls
  back to cloud.

---

# 5. Provider configuration & credential handling (BYOK)

    interface CloudProviderConfig {
      id: string;
      kind: "openai-compatible" | "anthropic" | "custom";
      presetId?: string;        // e.g. "openai", "anthropic"
      baseUrl: string;
      modelId: string;
      apiKeyRef: string;        // OS keychain reference, never the key itself
      enabled: boolean;
    }

Rules:
- **Presets** for common providers supply `kind` + `baseUrl` defaults; a **custom** option accepts
  any user-entered base URL (CL3). A preset never includes a key.
- Credentials are stored in the **OS keychain** (DPAPI / Credential Manager) via `safeStorage`; the
  app stores only a reference.
- **Keys are never logged**, never written to the audit log, never included in error output, and
  never sent anywhere except the configured provider.
- Removing a provider deletes its keychain entry.
- A custom `baseUrl` must satisfy the same host-allowlist consent as a preset.

---

# 6. Extended presence

"Extended presence" means the companion's optional cloud-enhanced capabilities — not accounts or
sync.

What cloud extends:
- Higher-quality chat and larger context when the user opts in.
- Cloud voice (STT/TTS) as an alternative to local engines.
- Larger model acquisition beyond what the floor tier runs locally.

What does not change:
- The companion remains fully functional offline and on local models.
- Presence (overlay, tray, wake word, memory) is entirely local and never depends on cloud.
- Disabling cloud returns the app to a fully local state with no residual background calls.

---

# 7. Offline & failure behavior

- **Offline:** cloud fails with `offline`; the app continues locally. Inference is never queued.
- **Resumable scopes** (`model-download`, `asset-download`) may queue with bounded backoff.
- **Rate limited / provider error:** surfaced as recoverable; never retried on cloud without
  consent.
- **Consent denied:** `consent-denied`; no silent local retry unless the user enabled fallback.
- **Revocation mid-session:** next request denied immediately; no restart.

---

# 8. Acceptance tests

| # | Test | Expected |
|---|---|---|
| P6-1 | Fresh install | Zero network egress, verified at OS level |
| P6-2 | Cloud default | Off until explicitly enabled |
| P6-3 | Default mode | Every cloud scope defaults to `ask` |
| P6-4 | Per-scope enablement | Enabling inference does not enable voice |
| P6-5 | Disclosure | Enablement shows what leaves the device before any request |
| P6-6 | Per-request consent | The default path prompts with a truthful preview |
| P6-7 | Personal-data gate | First personal-data egress forces a previewed prompt |
| P6-8 | Category-bound consent | A new category re-prompts; consent does not silently widen |
| P6-9 | Persistent indicator | Visible while personal-data egress is active |
| P6-10 | One-click revoke | Returns the scope to prompting; next request prompts |
| P6-11 | Revocation immediacy | Next request denied with no restart |
| P6-12 | Preview accuracy | Preview matches the actual transmitted payload |
| P6-13 | Display-only | No field-level redaction controls exist in v1 |
| P6-14 | Provider swap | Cloud providers satisfy the same contracts; engine unchanged |
| P6-15 | Both adapters | OpenAI-compatible and Anthropic both function |
| P6-16 | Cloud voice scope | Voice egress uses `cloud-voice`, separate from inference |
| P6-17 | One-way fallback | Cloud → local allowed; local → cloud never silent |
| P6-18 | Offline | Cloud fails cleanly; app continues locally; inference not queued |
| P6-19 | Key storage | Keys in OS keychain; never logged or audited |
| P6-20 | Key deletion | Removing a provider removes its keychain entry |
| P6-21 | Presets + custom | Presets supply endpoint defaults; custom URL accepted |
| P6-22 | Activity view | Every egress listed with decision, categories, and result |
| P6-23 | Disable cloud | Returns to fully local with no residual calls |
| P6-24 | No account | No sign-up, login, sync, or marketplace surface exists |
| P6-25 | No telemetry | No telemetry code path exists at all |
| P6-26 | Audit privacy | Log contains host/path/categories/hash, never bodies or keys |

---

# 9. Status

All Phase 6 decisions are locked (CL1–CL5). No open items remain. The spec is ready to implement
on top of Phases 0–5.
