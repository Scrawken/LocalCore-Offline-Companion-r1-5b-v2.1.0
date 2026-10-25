# LocalCore — S0.1 Foundation Implementation Task List

Slice: **S0.1 — Foundation & guardrails**
Source: Phase 0 spec §2–§4; Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- Electron app skeleton with a hardened renderer.
- App-data layout with a no-writes-outside guarantee.
- Consent store and default-deny policy.
- Egress Gateway (contract, consent checks, logging).
- Enforcement mechanisms that make the gateway the only network path.
- Audit log core, retention, and a minimal view/clear surface.
- The verification harness for G1–G11 and the no-writes-outside test.

**Explicit non-goals (do not build here):**
- No model, no Ollama, no provider registry (S0.3 / S1.3).
- No chat UI, no persona, no conversation persistence (S1.1 / S1.2).
- No memory, voice, avatar, or desktop tools.
- No resource governor (S0.2).

Rationale: S0.1 is the cheapest slice to build and the most expensive to retrofit. Everything that
enforces a privacy promise later depends on it, so it lands first and alone.

---

## 1. Ordering principles

1. **Skeleton before storage** — there must be a process to own the app-data directory.
2. **Storage before audit** — the audit log is stored encrypted and inside app-data.
3. **Audit before gateway** — the gateway logs on every path, so the log must exist first.
4. **Consent before gateway** — the gateway resolves consent on every request.
5. **Gateway before enforcement** — there is nothing to enforce until the contract exists.
6. **Enforcement before verification** — tests assert the enforcement holds.
7. **Parallelizable:** Groups 2 and 3 can proceed together; Group 6 can start once Group 5's
   interfaces are frozen, before its internals are complete.

---

## 2. Task list

### Group 1 — Skeleton & renderer hardening

**A1 — Electron + TypeScript app skeleton**

Deliverable: a runnable Electron app (main + renderer) with dev and packaged build scripts.

Definition of done:
- [ ] `dev` script launches a window; `build` produces a distributable for Windows.
- [ ] TypeScript compiles with strict mode; no `any` in the gateway-adjacent surface.
- [ ] Main and renderer entry points are separate; shared types live in a common module.
- [ ] App boots with **zero outbound network calls** (verified by a boot-time assertion).
- [ ] No `remote` module usage.

**A2 — Renderer hardening**

Deliverable: a renderer that structurally cannot reach the network.

Definition of done:
- [ ] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- [ ] CSP applied with `connect-src 'none'` and `default-src 'self'` (plus the minimum needed for
      local assets); CSP is set by the main process, not the page.
- [ ] No remote content is loaded at any point.
- [ ] A deliberate `fetch()` in the renderer is blocked and reported (test A2-T1).
- [ ] `require`/`process` are unavailable in the renderer (test A2-T2).

**A3 — Typed IPC bridge**

Deliverable: a minimal, explicit preload API exposed via `contextBridge`.

Definition of done:
- [ ] Every channel is explicitly named and typed; there is no generic "invoke anything" channel.
- [ ] An undeclared channel call is rejected (test A3-T1).
- [ ] The preload exposes no filesystem, network, or process primitives.
- [ ] Shared request/response types are imported from the common module, not re-declared.

---

### Group 2 — Storage foundation

**B1 — App-data layout**

Deliverable: the directory structure from Phase 0 §4, created on first run.

Definition of done:
- [ ] Directories created under the app-data root: `config/`, `conversations/`,
      `memory/{facts,summaries,transcripts}/`, `assets/`, `models/`, `logs/`, `governor/`.
- [ ] Creation is idempotent; re-running does not error or duplicate.
- [ ] Path resolution works identically in dev and packaged builds.
- [ ] A manifest file documents each directory's purpose and retention owner.
- [ ] Directory permissions are as restrictive as the platform allows.

**B2 — Encryption-at-rest wrapper**

Deliverable: a single module wrapping OS-backed encryption (Windows DPAPI via `safeStorage`).

Definition of done:
- [ ] `encrypt(blob) → ciphertext` and `decrypt(ciphertext) → blob` round-trip correctly.
- [ ] Ciphertext differs from plaintext for the same input across calls (test B2-T1).
- [ ] The key is never exported, logged, or written outside the OS store.
- [ ] If OS encryption is unavailable, sensitive data is **refused**, not written in plaintext
      (test B2-T2).
- [ ] No other module calls the OS crypto API directly (enforced with B3's wrapper rule).

**B3 — Filesystem access wrapper**

Deliverable: the single module permitted to write files.

Definition of done:
- [ ] All writes resolve and validate against the app-data root; out-of-tree paths are rejected.
- [ ] Writes are atomic (temp file + rename).
- [ ] A lint rule fails CI if any module outside the wrapper imports `fs` for writing
      (test B3-T1).
- [ ] Sensitive files are written through B2's encryption wrapper, never raw.

**B4 — No-writes-outside enforcement**

Deliverable: a runtime guard plus a test harness that proves the guarantee.

Definition of done:
- [ ] Runtime guard rejects any write path outside app-data (test B4-T1).
- [ ] A filesystem watcher runs for a full session and fails the test on any out-of-tree write
      (test B4-T2).
- [ ] The watcher covers cold start, an IPC round trip, and a shutdown cycle.
- [ ] The test is wired into CI, not run manually.

---

### Group 3 — Audit core

**F1 — Audit entry schema and append-only store**

Deliverable: the `AuditEntry` type and an encrypted, append-only store.

Definition of done:
- [ ] Schema matches Phase 0 §2.7 exactly (all fields present, correct types).
- [ ] Entries persist across restart and remain ordered.
- [ ] The store is append-only; there is no update or delete path for an individual entry.
- [ ] The store is encrypted at rest (uses B2).
- [ ] A `category` field distinguishes `egress` / `action` / `memory` for later phases.

**F2 — Log every attempt**

Deliverable: logging wired into every gateway outcome path.

Definition of done:
- [ ] Granted, denied, and prompted outcomes each write exactly one entry.
- [ ] Entry count equals attempt count for a scripted sequence (test F2-T1).
- [ ] Each entry carries a unique `auditId` returned to the caller.
- [ ] A failure to write the audit entry fails the request (no silent unlogged egress).

**F3 — Log privacy rules**

Deliverable: enforcement that the log itself leaks nothing.

Definition of done:
- [ ] Request and response bodies are never stored; only `host`, `path`, and a payload hash.
- [ ] Query strings are stripped from the stored path (test F3-T1).
- [ ] A credential placed in a payload never appears anywhere in the log (test F3-T2).
- [ ] The log is user-clearable and encrypted at rest.

---

### Group 4 — Consent

**C1 — Consent data model**

Deliverable: the `ConsentRecord` / `EgressScope` / `ConsentDecision` / `DataCategory` types with
versioned persistence.

Definition of done:
- [ ] Types match Phase 0 §2.3 exactly.
- [ ] Records persist across restart in the encrypted store.
- [ ] A `schemaVersion` field exists with a migration stub.
- [ ] All five network scopes are representable, including `network:cloud-voice` (Phase 3
      extension) reserved for forward compatibility.

**C2 — Consent service**

Deliverable: `get` / `set` / `revoke` / `revokePersonalData` / `list`.

Definition of done:
- [ ] Each method has unit tests.
- [ ] There is **no caching** — every read hits the store, so revocation is immediate
      (test C2-T1).
- [ ] `revokePersonalData` clears only the personal-data grant, leaving the scope record intact
      (test C2-T2).
- [ ] Concurrent writes cannot corrupt the store.

**C3 — Consent resolution**

Deliverable: the `resolve()` algorithm from Phase 0 §2.5.

Definition of done:
- [ ] Table-driven tests cover every branch: no record, expired, host-not-allowed,
      personal-data-ask, category-broadened-ask, scope-ask, allow.
- [ ] The implementation matches the spec's pseudocode line for line in behaviour.
- [ ] `check()` returns the same decision the request path would take (no divergence).

**C4 — Default-deny policy**

Deliverable: a fresh install with zero allow records.

Definition of done:
- [ ] No consent record is created on install.
- [ ] A request with no record is denied with `no-consent` (test C4-T1).
- [ ] The default policy is asserted by a test, not by documentation.

---

### Group 5 — Gateway core

**D1 — Request pipeline**

Deliverable: `request(req)` implementing the 8-step lifecycle from Phase 0 §2.4.

Definition of done:
- [ ] Steps execute in the specified order; each is unit-testable in isolation.
- [ ] Unknown scope, unregistered caller, and unparseable URL are rejected before any consent
      lookup (test D1-T1).
- [ ] The pipeline never sends before consent resolution and preview.

**D2 — Internal HTTP client**

Deliverable: the single client the gateway uses to execute requests.

Definition of done:
- [ ] Only one client instance exists; no other module constructs one.
- [ ] Per-request timeouts are enforced.
- [ ] Redirects are re-checked against `allowHosts` at every hop (test D2-T1).
- [ ] A redirect to a non-allowlisted host is blocked, not followed.

**D3 — Redaction preview**

Deliverable: `preview(req) → RedactionPreview`.

Definition of done:
- [ ] Field paths, categories, truncated samples, byte estimate, and `containsPersonalData` are
      populated.
- [ ] The preview is computed from the **exact serialized payload** (test D3-T1).
- [ ] Samples are truncated to a fixed bound.
- [ ] The persona/user-message-required fields are marked non-redactable.

**D4 — `check()` dry run**

Deliverable: a consent decision without sending.

Definition of done:
- [ ] `check()` opens no socket (test D4-T1).
- [ ] It returns the same decision `request()` would.
- [ ] It is safe to call from the UI thread.

**D5 — Personal-data gate**

Deliverable: forced prompting for personal data, and re-consent on category broadening.

Definition of done:
- [ ] Personal data with no `dataConsent` forces `ask` regardless of scope decision (G6).
- [ ] After "always allow", the same categories proceed without a prompt (G6b).
- [ ] A new category invalidates consent and re-prompts (G6c).
- [ ] `revokePersonalData` returns the scope to prompting (G6d).

**D6 — Failure behavior**

Deliverable: offline, retry, and timeout handling per Phase 0 §2.8.

Definition of done:
- [ ] Offline returns `deny("offline")` with no retry storm (test D6-T1).
- [ ] Retries are bounded (max 3), backed off, jittered, and only for `idempotent` scopes
      (test D6-T2).
- [ ] Inference and personal-data requests are never queued (test D6-T3).
- [ ] A timeout is a failure, not a retry loop.

**D7 — Gateway events**

Deliverable: `on("egress", cb)` emitting one event per attempt.

Definition of done:
- [ ] Exactly one event is emitted per request, matching its audit entry (test D7-T1).
- [ ] Listeners cannot alter the request or its decision.

---

### Group 6 — Enforcement

**E1 — Import rule**

Deliverable: a lint/dependency rule restricting network imports to the gateway module.

Definition of done:
- [ ] CI fails if any module outside the gateway imports `net` / `http` / `https` / `fetch`
      (test E1-T1).
- [ ] The rule is verified by an intentional violation fixture that must fail the build.
- [ ] The rule covers the main process, preload, and renderer bundles.

**E2 — Request interceptor**

Deliverable: `session.webRequest.onBeforeRequest` blocking unregistered requests.

Definition of done:
- [ ] Every in-flight gateway request is registered with a token; only registered requests pass.
- [ ] A renderer-initiated request is blocked and logged as a violation (G8).
- [ ] The interceptor does not block the gateway's own execution path.

**E3 — Worker & webview sandboxing**

Deliverable: workers and webviews held to the same CSP and network restrictions.

Definition of done:
- [ ] Webviews are disabled or sandboxed to the same policy (test E3-T1).
- [ ] A worker cannot reach the network (test E3-T2).
- [ ] No path bypasses E2's interceptor.

---

### Group 7 — Audit retention & surface

**F4 — Retention and pruning**

Deliverable: configurable retention (default 30 days) with auditable pruning.

Definition of done:
- [ ] Default retention is 30 days; the user can lengthen, shorten, or disable pruning (G11).
- [ ] Pruning removes only entries past the window and writes a pruning note.
- [ ] Pruning is idempotent and safe to interrupt.
- [ ] Pruning never runs while a request is in flight.

**F5 — View / clear surface**

Deliverable: a minimal UI (or CLI) to inspect and clear the log.

Definition of done:
- [ ] The user can list entries with timestamp, host, purpose, decision, and result.
- [ ] The user can clear the log; the clear action is itself recorded.
- [ ] The surface is read-only except for clearing.

---

### Group 8 — Verification

**G1 — Test doubles**

Deliverable: a fake egress target so all gateway tests run with no real network.

Definition of done:
- [ ] A local mock transport/server satisfies gateway requests in tests.
- [ ] No test reaches a public host.
- [ ] The double can simulate: success, denial, timeout, redirect, and error.

**G2 — Gateway acceptance suite (G1–G11)**

Deliverable: all Phase 0 gateway acceptance tests implemented and passing.

Definition of done:
- [ ] G1–G11 pass in CI.
- [ ] Each test names the invariant it protects.
- [ ] Tests are deterministic and run offline.

**G3 — No-writes-outside test**

Deliverable: the watcher-based test from B4 wired into CI.

Definition of done:
- [ ] A full session produces no out-of-tree write.
- [ ] A deliberate out-of-tree write makes the test fail.
- [ ] The test runs on every CI build, not nightly only.

**E4 — External zero-egress verification**

Deliverable: a harness that runs the app with the OS firewall blocking outbound traffic.

Definition of done:
- [ ] With all outbound traffic blocked, the app cold-starts and completes an IPC round trip
      with no crash and no retry storm (G9).
- [ ] The harness produces a pass/fail report artifact.
- [ ] It runs at least nightly and before any release.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | — | A2, A3, B1 |
| A2 | A1 | E2, E3 |
| A3 | A1 | F5 |
| B1 | A1 | B2, B3, F1 |
| B2 | B1 | B3, F1 |
| B3 | B1, B2 | B4, F1 |
| B4 | B3 | G3 |
| F1 | B2, B3 | F2, F3 |
| F2, F3 | F1 | D1 |
| C1 | B2 | C2 |
| C2 | C1 | C3, C4 |
| C3, C4 | C2 | D1 |
| D1 | F2, C3, C4 | D2–D7 |
| D2–D7 | D1 | E1–E3 |
| E1, E2, E3 | D1, A2 | G2 |
| F4, F5 | F1 | — |
| G1 | D1 | G2 |
| G2 | G1, E1–E3 | — |

Parallel opportunities: Groups 2 and 3 (storage and audit) can proceed concurrently once A1 lands.
Group 6 (enforcement) can begin as soon as Group 5's interfaces are frozen, before its internals
are finished.

---

## 4. Slice-level Definition of Done

S0.1 is complete when **all** of the following hold:

- [ ] A fresh install performs **zero successful network egress**, verified with the OS firewall
      blocking outbound traffic (G9).
- [ ] No file is written outside the app-data directory across a full session, verified by the
      watcher (G3).
- [ ] A network request without a consent record is denied and logged (G1).
- [ ] Every attempt — granted, denied, or prompted — produces exactly one audit entry (F2).
- [ ] The audit log contains no bodies, no query strings, and no credentials (F3).
- [ ] The renderer cannot reach the network directly, verified by test (A2, E2, E3).
- [ ] Revoking consent takes effect on the next request with no restart (C2).
- [ ] All Phase 0 gateway acceptance tests G1–G11 pass in CI.
- [ ] All Go/No-Go checks run offline and deterministically.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Interceptor false positives block legitimate loopback (future Ollama) | Blocks S0.3 | Keep the loopback exemption narrow and owned by one module (Phase 1 §3.3) |
| OS encryption unavailable in some environments | Sensitive data cannot be stored | Refuse rather than downgrade (B2) |
| Watcher noise from Electron/OS temp files | Flaky no-writes test | Explicit, documented allowlist for OS-managed temp paths |
| CSP breaking needed local assets | Renderer fails to load | Scope CSP to the minimum required; test early |
| Import rule not covering all bundles | Silent bypass | Verify against a deliberate violation fixture (E1) |

---

## 6. Traceability

| Phase 0 test | Covered by |
|---|---|
| G1, G2 | F2, C4, G2 |
| G3, G4 | D1, G2 |
| G5 | C2, G2 |
| G6, G6b, G6c, G6d | D5, G2 |
| G7 | C3, D2, G2 |
| G8 | E2, G2 |
| G9 | E4, G2 |
| G10 | D6, G2 |
| G11 | F4, G2 |
| No-writes-outside | B4, G3 |
| Renderer isolation | A2, E2, E3 |
