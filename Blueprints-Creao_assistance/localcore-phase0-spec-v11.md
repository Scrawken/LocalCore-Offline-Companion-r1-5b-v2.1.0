
# LocalCore — Phase 0 Technical Spec (v1.1, final)

Scope: Egress Gateway contract and floor-tier Resource Governor test plan, plus the app-data
layout and no-writes-outside guarantee they depend on.

Phase 0 ships **no user-facing features**. Its only job is to make later privacy and performance
claims provable. Supersedes the v1.0 Phase 0 spec.

---

## 0. Decisions locked in this spec

| # | Decision | Choice |
|---|---|---|
| P1 | Personal-data egress policy | **Prompt first time, then persistent "always allow" per scope** |
| P2 | Egress audit log retention | **User-configurable, default 30 days** |
| P3 | Floor reference machines | **Floor-A (Iris Xe / Vega 8) + Floor-B (UHD 620)** |
| P4 | Peak memory ceiling (floor) | **≤85% of 8GB (~6.8GB)** |

Everything below reflects these. No open items remain.

---

## 1. Scope & non-goals

In scope: Egress Gateway (interfaces, consent checks, logging); Resource Governor (concurrency
model + floor-tier test plan); app-data layout and the no-writes-outside test.

Out of scope for Phase 0: chat, memory, voice, avatar behaviour, desktop tools, cloud providers.
Those consume these contracts; they do not define them.

Everything here is implementable in the existing Electron project. Nothing requires CREAO services.

---

# 2. Egress Gateway

## 2.1 Purpose & invariants

The gateway is the only code path permitted to reach the network.

Invariants:
- **Deny by default.** No consent record means no request.
- **Every attempt is logged**, granted or denied.
- **Personal data never leaves the device without the user having seen a preview.**
- **Persistent consent is per-scope, visible, and revocable in one click.**
- **Revocation is immediate** — the next request is denied, no restart.
- **The renderer cannot reach the network at all**, by construction and by test.

## 2.2 Threat model

Defends against: silent phone-home; conversation/memory payloads attached without the user
knowing; downloads from unapproved hosts; a compromised or buggy renderer; retry storms.

Does not defend against: a malicious OS-level process outside the app; malware reading app-data
while the app is unlocked; a user who grants broad consent without reading the prompt.

## 2.3 Interfaces

Types:

    type EgressScope =
      | "network:cloud-inference"
      | "network:model-download"
      | "network:asset-download"
      | "network:update-check"
      | "network:telemetry";

    type ConsentDecision = "allow" | "deny" | "ask";

    type DataCategory =
      | "conversation" | "memory-fact" | "memory-transcript"
      | "audio" | "generated-media" | "device-info" | "none";

    interface ConsentRecord {
      scope: EgressScope;
      decision: ConsentDecision;
      grantedBy: "user" | "default" | "policy";
      grantedAt: number;
      expiresAt?: number;             // session or absolute expiry
      allowHosts?: string[];          // optional host narrowing
      dataConsent?: boolean;          // user approved personal-data egress for this scope
      dataConsentCategories?: DataCategory[];  // exact categories approved
      dataConsentAt?: number;
    }

    interface RedactionPreview {
      fields: Array<{
        path: string;                 // e.g. "messages[3].content"
        category: DataCategory;
        sample?: string;              // truncated, for the consent dialog
        redactable: boolean;
      }>;
      bytesEstimate: number;
      containsPersonalData: boolean;
    }

    interface EgressRequest {
      scope: EgressScope;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      url: string;
      purpose: string;                // human-readable justification, shown in prompts and logs
      caller: string;                 // module id, for audit
      payload?: unknown;              // never sent without passing consent + preview
      dataCategories?: DataCategory[];
      timeoutMs?: number;
      idempotent?: boolean;           // governs retry eligibility
      requestId?: string;
    }

    type DenyReason =
      | "no-consent" | "consent-expired" | "host-not-allowed"
      | "user-denied" | "scope-disabled" | "offline" | "rate-limited";

    interface EgressResult {
      ok: boolean;
      status?: number;
      body?: unknown;
      headers?: Record<string, string>;
      deniedReason?: DenyReason;
      auditId: string;
      durationMs: number;
    }

Gateway and consent services:

    interface EgressGateway {
      request(req: EgressRequest): Promise<EgressResult>;
      check(req: EgressRequest): Promise<ConsentCheck>;   // dry run, no send
      preview(req: EgressRequest): RedactionPreview;      // what would leave the device
      on(event: "egress", cb: (entry: AuditEntry) => void): void;
    }

    interface ConsentCheck {
      decision: ConsentDecision;
      scope: EgressScope;
      requiresPrompt: boolean;
      reason?: DenyReason;
      record?: ConsentRecord;
    }

    interface ConsentService {
      get(scope: EgressScope): ConsentRecord | undefined;
      set(record: ConsentRecord): Promise<void>;
      revoke(scope: EgressScope): Promise<void>;              // immediate effect
      revokePersonalData(scope: EgressScope): Promise<void>;  // clears dataConsent only
      list(): ConsentRecord[];
    }

## 2.4 Request lifecycle

1. Caller invokes `gateway.request(req)`.
2. Gateway validates: known scope, registered caller, parseable URL, host within `allowHosts`.
3. Gateway resolves consent (see 2.5). No caching — re-read every request, so revocation is immediate.
4. If the outcome is `ask`, the gateway emits a prompt with the redaction preview and waits for a
   decision (bounded timeout, default deny).
5. Gateway executes through a single internal HTTP client.
6. Redirects are re-checked against the host allowlist at every hop.
7. Gateway writes an audit entry regardless of outcome.
8. Gateway returns `EgressResult`.

## 2.5 Consent checks (per P1)

Resolution algorithm:

    resolve(req):
      record = consent.get(req.scope)
      if record is undefined or record.decision == "deny":
          return DENY("no-consent")
      if record.expiresAt and now() > record.expiresAt:
          return DENY("consent-expired")
      if record.allowHosts and host(req.url) not in record.allowHosts:
          return DENY("host-not-allowed")
      preview = preview(req)
      if preview.containsPersonalData:
          if record.dataConsent is not true:
              return ASK("personal-data")                    # first time, always
          if categories(req) not subset of record.dataConsentCategories:
              return ASK("personal-data-broadened")          # new category => re-consent
          # persistent consent present and categories covered
          return ALLOW_WITH_INDICATOR
      if record.decision == "ask":
          return ASK("scope")
      return ALLOW

### Personal-data policy in detail

- **First time** a scope would carry personal data (conversation, memory fact, memory transcript,
  audio, or generated media), the user sees a preview of exactly what would leave the device.
- The prompt offers: Deny, Allow once, **Always allow for this scope**.
- "Always allow" stores `dataConsent: true` plus the exact `dataConsentCategories` approved.
- Thereafter, no per-request prompt for those categories — but the guarantees below still hold.

### Mitigations that keep persistent consent defensible

Persistent personal-data consent is weaker than an unconditional gate, so these are mandatory,
not optional:

1. **Per-scope only.** Consent is granted to one scope (e.g. `network:cloud-inference`). It is
   never global and never applies to a different scope.
2. **Category-bound.** Consent records the exact data categories approved. If a request would send
   a category not in that set, consent is invalidated and the user is re-prompted.
3. **Persistent indicator.** Whenever a personal-data egress is active under an always-allow scope,
   a visible indicator is shown for the duration.
4. **One-click revoke.** `revokePersonalData(scope)` clears the persistent grant and returns that
   scope to prompting. Reachable from the same place the indicator is shown.
5. **Fully audited.** Every egress under an always-allow scope is still logged with host, path,
   categories, and payload hash.
6. **Periodic re-confirmation (recommended).** Optionally re-prompt on a long interval (e.g. 90
   days) so consent does not silently persist forever.

## 2.6 Enforcement mechanisms

- **Renderer isolation:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  CSP with `connect-src 'none'`. No network primitive in the renderer.
- **IPC only:** the gateway is the only main-process module allowed to import `net`/`http`/`https`/`fetch`.
- **Import rule:** a lint rule fails CI if any other module imports a network primitive.
- **Request interceptor:** `session.webRequest.onBeforeRequest` blocks any request not registered by
  an in-flight gateway call.
- **Workers/webviews** sandboxed to the same CSP.
- **External verification:** the zero-egress test runs with the OS firewall blocking outbound traffic.

## 2.7 Logging & audit schema (per P2)

Append-only, local, encrypted, user-viewable, clearable. Retention is **user-configurable,
default 30 days**, and independent of memory retention.

    interface AuditEntry {
      auditId: string;
      timestamp: number;
      caller: string;
      scope: EgressScope;
      method: string;
      host: string;
      path: string;                 // path only — never query string or body
      decision: "allow" | "deny" | "prompted";
      denyReason?: DenyReason;
      consentRecordId?: string;
      personalDataConsent?: boolean; // true when sent under an always-allow grant
      dataCategories: DataCategory[];
      payloadHash?: string;          // sha-256 of the body, never the body
      bytesSent: number;
      bytesReceived: number;
      status?: number;
      durationMs: number;
      error?: string;
    }

Log privacy rules:
- Never store bodies or full query strings; store host + path only, hash payloads.
- Encrypted at rest; user-clearable at any time.
- Default retention 30 days; user may lengthen, shorten, or disable pruning.
- Pruning is auditable (an entry noting when old entries were removed).

## 2.8 Failure behavior

- **Offline:** return `deny("offline")` without error spam. Never queue inference or personal data.
- **Resumable scopes** (`model-download`, `asset-download`) may queue with backoff.
- **Bounded retries:** max 3, exponential backoff with jitter, only for `idempotent` scopes.
- **Timeouts** enforced per request; a timeout is a failure, not a retry loop.

## 2.9 Acceptance tests (gateway)

| # | Test | Expected |
|---|---|---|
| G1 | No consent record | Denied `no-consent`, audit entry written |
| G2 | Allow record | Executed, audit entry written |
| G3 | `ask` scope, user denies | Not sent, audit `prompted` + `user-denied` |
| G4 | `ask` scope, user allows once | Sent once; next identical request prompts again |
| G5 | Revoke scope mid-session | Next request denied immediately, no restart |
| G6 | Personal-data payload, first time | Forced prompt with preview, even if scope allowed |
| G6b | After "always allow", same categories | Sent, no prompt, indicator shown, audit marks `personalDataConsent` |
| G6c | Request adds a new category | Consent invalidated, re-prompted |
| G6d | `revokePersonalData` | Returns to prompting; next request prompts |
| G7 | Host outside `allowHosts` | Denied `host-not-allowed` |
| G8 | Renderer attempts direct fetch | Blocked by CSP/interceptor, logged as violation |
| G9 | Fresh install, OS firewall blocks all egress | App fully functional, zero successful egress |
| G10 | Offline, resumable download | Queued with backoff, no storm; inference not queued |
| G11 | Audit log retention | Default 30 days; user change applies; pruning logged |

---

# 3. Floor-tier Resource Governor

## 3.1 Purpose

Prove (or disprove) that the LLM, avatar, STT, and TTS can coexist on an 8GB integrated-GPU
machine — and if they cannot, document exactly what must be serialized.

## 3.2 Resource model & tiers

Heavy pipelines (mutually constrained): `llm`, `stt`, `tts`.
Light pipelines (always allowed, throttled): `embedding`, `avatar`, `wake-word`.

**Classification note (revised):** `embedding` is **light**, not heavy. The Phase 0 draft listed it
as heavy before the embedder was chosen. The selected embedder (Phase 2 M4) is a ~90MB CPU-only
ONNX MiniLM running in a worker in short bursts, occupying no model slot. It is bounded in batch
size and yields to generation, so it must not consume the single heavy slot on the floor tier.
Phase 2 §3.3 and S2.1 E4 rely on this classification.

    type PipelineKind = "llm" | "stt" | "tts" | "embedding" | "avatar" | "wake-word";

    type Tier = "floor" | "mid" | "high";

    interface TierProfile {
      tier: Tier;
      maxConcurrentHeavy: number;   // floor: 1, mid: 2, high: 3
      modelBudgetMB: number;
      avatarFps: number;
      avatarQuality: "low" | "medium" | "high";
      llmIdleEvictMs: number;
      freeMemoryFloorMB: number;    // evict before OOM
      peakMemoryCeilingMB: number;  // P4: ~6960MB on 8GB (85%)
      sttEnabled: boolean;
      ttsEnabled: boolean;
    }

## 3.3 Governor interface

    interface ResourceGovernor {
      acquire(kind: PipelineKind, opts?: {
        priority?: number;
        timeoutMs?: number;         // block up to this, then degrade
      }): Promise<Lease>;
      release(lease: Lease): void;
      evictIdle(): Promise<void>;
      setProfile(profile: TierProfile): void;
      stats(): GovernorStats;
      on(event: "pressure" | "evict" | "degrade", cb: (e: unknown) => void): void;
    }

    interface Lease { id: string; kind: PipelineKind; acquiredAt: number; }

    interface GovernorStats {
      activeLeases: Lease[];
      residentMB: Partial<Record<PipelineKind, number>>;
      evictions: number;
      lastPressureAt?: number;
      profile: TierProfile;
    }

Priority (higher wins): voice round-trip > chat generation > embedding > idle maintenance.

`embedding` appears in the ordering as a scheduling hint only. Because it is a light pipeline it is
never blocked — it is deferred behind generation and voice, and its batch size is bounded.

Behavior:
- **Blocking with timeout.** No free heavy slot → wait up to `timeoutMs`, then return a degraded
  lease (smaller model / disabled pipeline) rather than hanging.
- **Idle eviction.** LLM unloaded after `llmIdleEvictMs`; reload is transparent.
- **Pressure eviction.** Free memory below `freeMemoryFloorMB` → evict LLM before the OS swaps/OOMs.
- **Ceiling enforcement.** If resident memory approaches `peakMemoryCeilingMB`, evict or degrade
  before crossing it.
- **Light pipelines** (`embedding`, `avatar`, `wake-word`) are never blocked. They are throttled:
  the avatar drops to `avatarFps` and lowest quality under pressure, and embedding batches are
  bounded and yield to generation.

## 3.4 Floor profile (starting point, to be validated)

    {
      tier: "floor",
      maxConcurrentHeavy: 1,
      modelBudgetMB: 3000,        // ~2-3B Q4 working set
      avatarFps: 24,
      avatarQuality: "low",
      llmIdleEvictMs: 90000,
      freeMemoryFloorMB: 700,
      peakMemoryCeilingMB: 6960,  // P4: 85% of 8GB
      sttEnabled: true,
      ttsEnabled: true
    }

**Parameterised form.** These values are the **P0 column** of the floor-profile parameter block in
**Phase 1 §0.1**. The spike may select a different column (P1 memory-bound, P2 avatar-bound,
P3 voice-bound); applying it is a configuration write, not an edit to this document.

Implication: on the floor tier, STT and LLM never run concurrently — PTT releases the STT lease
before acquiring the LLM lease. TTS may overlap with streaming only if the test plan proves it fits;
otherwise it serializes after generation.

## 3.5 Test plan (per P3)

### Reference machines

| ID | RAM | GPU | CPU | Disk | Role |
|---|---|---|---|---|---|
| Floor-A | 8GB | Iris Xe / Vega 8 class | 4c/8t | NVMe | Primary floor target |
| Floor-B | 8GB | UHD 620 class | 4c/8t | SATA SSD | Lowest supported |

### Metrics collected per scenario

Peak RSS / working set (MB); shared GPU memory (MB); avatar FPS; first-token latency (ms);
tokens/sec; STT latency (ms); TTS first-audio latency (ms); page faults/sec; crash/OOM count;
audio dropouts.

### Scenarios

**S0 — Baseline idle.** App open, avatar idle, no model loaded. Steady-state memory and FPS.

**S1 — Chat cold start.** Model load + first turn. Load time, first token, peak RSS. Avatar suspends
animation during load, resumes after.

**S2 — Chat steady state.** 20-turn conversation. Tokens/sec, memory stability (no growth trend),
avatar FPS during generation.

**S3 — Voice round trip.** PTT → STT → LLM → TTS. End-to-end latency, peak memory, and governor
trace confirms STT and LLM leases never overlap.

**S4 — Concurrency stress.** Chat while TTS plays and avatar animates. Governor must serialize or
degrade — never OOM.

**S5 — Idle eviction.** Idle past `llmIdleEvictMs`. Model evicted; memory near baseline; next turn
reloads with no state loss.

**S6 — Soak.** Two hours with periodic interactions. No leak, no crash, stable FPS.

**S7 — Wake word armed.** Opt-in keyword spotter alongside idle avatar. Extra memory/CPU must fit
the floor budget.

### Pass thresholds (per P4)

| Metric | Threshold |
|---|---|
| Crashes / OOM | 0 across all scenarios |
| Peak RSS | ≤ 85% of 8GB (~6.8GB / 6960MB) |
| Avatar FPS (idle) | ≥ 24 |
| Avatar FPS (during generation) | ≥ 20 |
| First token (floor) | ≤ 3s |
| STT + LLM concurrency | 0 overlapping leases on floor |
| Memory after eviction | within 10% of S0 baseline |
| Swap thrash | below defined page-fault/sec ceiling |

### Failure handling

If a scenario fails, the fallback is documented: drop model size (2–3B → 1–2B); suspend avatar
animation during generation; serialize TTS behind generation; disable concurrent wake word.

## 3.6 Instrumentation

Governor lease timeline (acquire/release with timestamps); memory sampler at fixed interval;
latency markers per stage; all results written to a report file for run-to-run diffing.

## 3.7 Deliverable

A results matrix: scenario × metric → measured vs threshold → pass/fail → fallback if failed.
Plus a **recommended floor profile** derived from measurements rather than assumed.

---

# 4. Supporting: app-data layout & no-writes-outside test

    %APPDATA%/LocalCore/
      config/
      conversations/        encrypted
      memory/
        facts/
        summaries/
        transcripts/        rolling window; pruned per retention
      assets/               generated media, VRM, voice
      models/               downloaded model weights
      logs/
        egress-audit.log    append-only, encrypted, clearable, default 30-day retention
      governor/             lease traces, reports

No-writes-outside test: a filesystem watcher runs for a full session (cold start, chat, voice,
avatar, model load/evict). Any write outside the app-data directory fails the test.

---

# 5. Implementation boundary

| Component | Where |
|---|---|
| Egress Gateway, Consent store, Audit log | Existing Electron project |
| Resource Governor, Tier Detector | Existing Electron project |
| App-data layout, no-writes-outside enforcement | Existing Electron project |
| CREAO-hosted services | None — Phase 0 is fully standalone |
