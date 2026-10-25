# LocalCore — S0.3 Implementation Task List

Slice: **S0.3 — Bundled Ollama bring-up, auth proxy, egress containment**
Source: Phase 1 §3.3; Phase 0 §2 (Egress Gateway) and §4 (app-data layout); Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- Bundling and version-pinning the Ollama binary.
- Server configuration: loopback bind, non-default port, model-store redirect, concurrency limits.
- Server lifecycle: on-demand spawn, health checks, supervision, bounded restart, clean shutdown.
- Model provisioning through both delivery paths (offline bundle and small-installer download).
- The Local Inference Proxy (LIP): authenticated loopback proxy with an endpoint allowlist.
- Port isolation and egress containment of the Ollama process tree.
- Governor integration: unload hooks and process-tree memory reporting.
- A smoke test proving a request can traverse app → proxy → Ollama.

**Explicit non-goals (do not build here):**
- No `ModelProvider` implementation or chat streaming contract (S1.3).
- No persona, prompt assembly, or chat UI (S1.1 / S1.2).
- No memory, voice, avatar, or tools.
- No model quality or latency tuning (S1.4).
- No floor-feasibility scenario runs (S0.4).

Rationale: S0.3 proves the local inference substrate is reachable, contained, and supervised.
S1.3 wraps it in the provider contract; S0.4 measures whether it fits on the floor tier.

---

## 1. Ordering principles

1. **Provisioning before lifecycle** — there must be a binary and a config before a process.
2. **Lifecycle before the proxy** — the proxy needs a server to forward to.
3. **Proxy before the smoke test** — the smoke test exercises the full path.
4. **Containment before verification** — the guarantee is only meaningful once the controls exist.
5. **Governor integration after lifecycle** — hooks attach to a managed process.
6. **Model provisioning can run parallel to the proxy** — both depend on lifecycle, not on each other.
7. **Containment is not optional.** It is the price of choosing a separate-process runtime; without
   it, the Phase 0 zero-egress guarantee is false the moment Ollama starts.

---

## 2. Task list

### Group 1 — Provisioning & configuration

**A1 — Bundle and pin the Ollama distribution**

Deliverable: Ollama shipped with the app at a pinned version, with all runtime components.

Definition of done:
- [ ] The Ollama distribution (binary plus any runner components it needs) is bundled in the
      installer; no user-installed runtime is required (P1-20).
- [ ] The version is pinned and recorded in a manifest.
- [ ] Third-party license text is included and surfaced in the app's about/licenses surface.
- [ ] The bundled files are integrity-checked at startup (hash manifest) and a mismatch is fatal
      with a clear error.
- [ ] A missing or corrupt binary produces a recoverable error, not a crash.

**A2 — Server configuration model**

Deliverable: the environment/args used to launch Ollama.

Definition of done:
- [ ] `OLLAMA_HOST=127.0.0.1:<non-default-port>`; the port is chosen per launch and never `0.0.0.0`.
- [ ] `OLLAMA_MODELS=<app-data>/models/ollama`.
- [ ] `OLLAMA_MAX_LOADED_MODELS=1` and `OLLAMA_NUM_PARALLEL=1` on the floor tier.
- [ ] All configuration is derived from the active `TierProfile` (S0.2), not hard-coded.
- [ ] Configuration is logged (excluding nothing sensitive, since there are no secrets here) for
      diagnostics.

**A3 — App-data integration and write containment**

Deliverable: Ollama's state confined to the app-data directory.

Definition of done:
- [ ] Model store resolves under app-data via `OLLAMA_MODELS` (P1-16).
- [ ] Any other Ollama state path (logs, identity, history) is either redirected into app-data or
      explicitly accounted for and excluded from the no-writes-outside claim (test A3-T1).
- [ ] The S0.1 no-writes-outside watcher is extended to cover the Ollama process tree.
- [ ] A full run (start → load model → chat → unload → stop) produces no out-of-tree write.

---

### Group 2 — Server lifecycle & supervision

**B1 — On-demand spawn**

Deliverable: the server starts when first needed, not at boot.

Definition of done:
- [ ] The server is not spawned during app boot (test B1-T1).
- [ ] The first request triggers spawn; subsequent requests reuse the running process.
- [ ] Concurrent first-requests do not spawn two servers (single-flight, test B1-T2).
- [ ] Spawn failure surfaces as a structured error to the caller.

**B2 — Health checks and readiness**

Deliverable: a reliable readiness signal.

Definition of done:
- [ ] The manager polls a health endpoint until ready, with a bounded timeout.
- [ ] Requests wait for readiness rather than failing during startup (test B2-T1).
- [ ] A server that never becomes ready is reported as `unavailable` with the captured stderr tail.
- [ ] Health polling stops once ready (no continuous chatter).

**B3 — Supervision: crash detection and bounded restart**

Deliverable: automatic recovery from a crashed server.

Definition of done:
- [ ] An unexpected exit is detected and the server is restarted with exponential backoff
      (P1-17).
- [ ] Restarts are bounded; after the bound, the server is marked `unavailable` and the user is
      informed (test B3-T1).
- [ ] A restart never loses conversation state, because state lives in the store, not the server
      (P1-17).
- [ ] Restart attempts and outcomes are recorded for diagnostics.

**B4 — Clean shutdown and no orphans**

Deliverable: the server dies with the app.

Definition of done:
- [ ] App exit stops the server and its runner subprocesses (test B4-T1).
- [ ] A forced kill of the app leaves no orphaned server process on next launch (test B4-T2).
- [ ] A stale server from a previous run is detected and reclaimed at startup.
- [ ] Shutdown is bounded; a hung server is force-killed after a timeout.

**B5 — `ServerManager` API**

Deliverable: the lifecycle surface other modules consume.

Definition of done:
- [ ] `ensureRunning()`, `status()`, `unloadModel()`, and `stop()` are implemented and typed.
- [ ] `ensureRunning()` is idempotent and safe to call concurrently.
- [ ] `status()` reports `stopped` / `starting` / `ready` / `unavailable` with a reason.
- [ ] The API exposes the chosen port only to the proxy, never to the renderer.

---

### Group 3 — Model provisioning

**C1 — Offline-bundle path**

Deliverable: first run imports a bundled model with zero network.

Definition of done:
- [ ] The installer variant includes the GGUF; first run imports it locally (P1-22).
- [ ] With all network blocked, provisioning completes and the model is usable (P1-22).
- [ ] Import is idempotent: a second run detects the model and does nothing (test C1-T1).
- [ ] A corrupt or truncated bundle fails with a clear error, not a silent partial model.

**C2 — Small-installer path**

Deliverable: model acquired through the Egress Gateway, never via Ollama's own pull.

Definition of done:
- [ ] The GGUF is fetched through the Egress Gateway under `network:model-download` with a host
      allowlist (P1-21).
- [ ] **`ollama pull` is never invoked** (P1-21).
- [ ] A denied or failed download leaves the app functional on the previous state and reports the
      failure.
- [ ] Download is resumable for this scope, per Phase 0 §2.8.

**C3 — Modelfile generation and import**

Deliverable: local import of an acquired GGUF.

Definition of done:
- [ ] A Modelfile is generated from the GGUF path and the pinned model metadata.
- [ ] Import uses `ollama create` against the **proxy** (or a direct local exec), never a network
      path.
- [ ] Import failure is detected and surfaced; a half-imported model is not treated as present.
- [ ] The model tag is stable and recorded.

**C4 — License metadata**

Deliverable: model license stored and surfaced.

Definition of done:
- [ ] License metadata is stored alongside the model in app-data.
- [ ] It is visible in the app's model/credits surface.
- [ ] A model without known license metadata is flagged rather than silently accepted.

**C5 — Provisioning state machine**

Deliverable: deterministic, resumable model provisioning.

Definition of done:
- [ ] States are explicit: `absent` → `downloading` → `importing` → `ready` / `failed`.
- [ ] The state is persisted and survives restart (test C5-T1).
- [ ] `ready` requires a verification step (a probe request), not just file presence.
- [ ] Any failed state is recoverable by retrying provisioning.
- [ ] The **install-time delivery choice** (small installer with first-run download vs offline
      bundle) is presented to the user, recorded, and reversible afterwards (P1-28).

---

### Group 4 — Auth proxy (LIP)

**D1 — Proxy server in the main process**

Deliverable: an in-process HTTP server that is the only loopback client to Ollama.

Definition of done:
- [ ] The proxy binds `127.0.0.1:<app-port>`; it never binds a public interface (test D1-T1).
- [ ] It runs in the Electron main process; the renderer cannot address it directly.
- [ ] It is the only module permitted to open a loopback client connection to Ollama (import rule,
      test D1-T2).
- [ ] Starting the proxy is idempotent.

**D2 — Per-launch token**

Deliverable: authentication for app → proxy traffic.

Definition of done:
- [ ] A 256-bit token is generated with a CSPRNG at each app launch.
- [ ] The token is held only in memory and never persisted (test D2-T1).
- [ ] A request without a valid token is rejected with 401 and **not forwarded** (P1-23).
- [ ] The token differs across launches and an old token is rejected (P1-25).
- [ ] The token is never written to the audit log, logs, or error output (test D2-T2).

**D3 — Endpoint allowlist**

Deliverable: only the endpoints the app needs are reachable.

Definition of done:
- [ ] Allowed: `/api/chat`, `/api/tags`, `/api/show`, `/api/create`, `/api/delete`.
- [ ] **`/api/pull` is denied** (P1-24).
- [ ] Any non-allowlisted endpoint is denied with a clear error and logged (P1-24).
- [ ] The allowlist is data, not scattered conditionals (test D3-T1).

**D4 — Payload bounds, timeout, rate limit**

Deliverable: the proxy cannot be used to exhaust the app.

Definition of done:
- [ ] Maximum request body size is enforced.
- [ ] Per-request timeout is enforced.
- [ ] A basic rate limit exists and is documented.
- [ ] Oversized or slow requests fail cleanly without affecting other requests (test D4-T1).

**D5 — Audit logging**

Deliverable: every proxied request is auditable.

Definition of done:
- [ ] Every proxied request writes an audit entry with caller `lip` (P1-27).
- [ ] Entries record endpoint, decision, status, and duration — never the token or the body.
- [ ] A denied request is logged with the deny reason.
- [ ] Log volume is bounded (no per-token logging).

**D6 — Forwarding**

Deliverable: correct request/response forwarding to Ollama.

Definition of done:
- [ ] Requests are forwarded to Ollama's private port with streaming responses preserved.
- [ ] Client disconnects propagate to the upstream request (no leaked upstream work).
- [ ] Upstream errors are mapped, not passed through raw.
- [ ] The proxy adds no buffering that would break token streaming.

**D7 — Error mapping**

Deliverable: consistent errors for callers.

Definition of done:
- [ ] Unauthenticated, denied-endpoint, oversized, timeout, upstream-unavailable, and
      model-not-found map to distinct structured errors.
- [ ] Errors never include the token or upstream internals beyond a safe message.
- [ ] Error mapping is covered by tests (test D7-T1).

---

### Group 5 — Port isolation & egress containment

**E1 — Port isolation (spike + implementation)**

Deliverable: only the app can reach Ollama's port.

Definition of done:
- [ ] A spike validates process-scoped loopback filtering (Windows Filtering Platform keyed to the
      app's process path) on the target Windows versions.
- [ ] If validated, the rule is applied so only the app binary may connect to Ollama's port
      (P1-26).
- [ ] If WFP proves impractical, the AppContainer / restricted-context fallback is implemented and
      the residual risk is documented — **not** silently ignored.
- [ ] The chosen mechanism and its limits are recorded in the app's security notes.

**E2 — Egress containment of the process tree**

Deliverable: Ollama cannot reach the external network.

Definition of done:
- [ ] The Ollama process tree runs under an OS restriction blocking external network while allowing
      loopback (P1-18).
- [ ] With the restriction active, a full run produces zero external network access (P1-18).
- [ ] The restriction covers runner subprocesses, not just the daemon (test E2-T1).
- [ ] Removing the restriction is not possible from within the app.

**E3 — Inert configuration (defense in depth)**

Deliverable: Ollama configured not to try to reach out.

Definition of done:
- [ ] Model pull is disabled at the configuration level as well as blocked at the proxy.
- [ ] Update checks and telemetry are disabled where the runtime allows.
- [ ] Documentation states plainly that configuration is **defense in depth, not the guarantee** —
      the guarantee is E2.
- [ ] A test asserts the config flags are applied at launch.

**E4 — Containment verification harness**

Deliverable: an external check that the containment holds.

Definition of done:
- [ ] The harness runs a full session with OS-level outbound blocking and asserts zero external
      connections from the Ollama tree.
- [ ] The harness fails if the containment rule is absent (negative test).
- [ ] It produces a pass/fail report artifact.
- [ ] It runs at least nightly and before release.

---

### Group 6 — Governor integration

**F1 — Unload hook registration**

Deliverable: the governor can unload the model.

Definition of done:
- [ ] `ServerManager` registers an unload hook with the governor (S0.2 D4).
- [ ] The hook unloads the model (and, if required, stops the daemon) and returns only when done.
- [ ] A hook failure is reported and does not block other evictions.
- [ ] The governor never evicts while an `llm` lease is active (S0.2 D1-T2, D2-T2).

**F2 — Process-tree memory reporting**

Deliverable: the governor sees the real memory footprint.

Definition of done:
- [ ] The server manager reports the full process tree's memory to the governor (S0.2 B2).
- [ ] The measurement includes runner subprocesses, not just the daemon (test F2-T1).
- [ ] Unknown measurements propagate as unknown, never as zero.
- [ ] Reporting is periodic and cheap.

**F3 — Eviction reason mapping**

Deliverable: unload behaviour matches the eviction reason.

Definition of done:
- [ ] `idle` → unload model, keep daemon.
- [ ] `pressure` → unload model first; stop the daemon if that is insufficient.
- [ ] `ceiling` → same as pressure, with the ceiling value recorded.
- [ ] After any eviction, the next request reloads transparently (P1-19).

**F4 — `keep_alive` interface**

Deliverable: the seam S1.3 uses to control idle unload.

Definition of done:
- [ ] The manager exposes a way to set per-request `keep_alive` derived from
      `TierProfile.llmIdleEvictMs`.
- [ ] The mapping from `llmIdleEvictMs` to `keep_alive` is defined and tested.
- [ ] Setting `keep_alive: 0` unloads immediately and is verified (test F4-T1).

---

### Group 7 — Verification

**G1 — Test doubles**

Deliverable: the seams that let S0.3 be tested without real hardware.

Definition of done:
- [ ] A mock Ollama endpoint can be started in-process for proxy tests.
- [ ] The process spawner is injectable so lifecycle tests do not launch the real binary.
- [ ] The OS-restriction layer is injectable so containment logic is testable without WFP.
- [ ] No test requires a real model download.

**G2 — Lifecycle tests**

Deliverable: coverage of spawn, health, crash, restart, and shutdown.

Definition of done:
- [ ] On-demand spawn, single-flight, readiness waiting, crash restart with backoff, bounded
      restarts, clean shutdown, and orphan reclamation are all tested.
- [ ] Tests are deterministic and offline.
- [ ] A hung server is handled within the bounded shutdown timeout.

**G3 — Proxy tests**

Deliverable: coverage of authentication, allowlist, bounds, and audit.

Definition of done:
- [ ] P1-23, P1-24, P1-25, P1-27 pass.
- [ ] Token absence, token rotation, and token non-persistence are asserted.
- [ ] `/api/pull` is proven denied.
- [ ] Streaming is preserved through the proxy (no buffering).

**G4 — Containment tests**

Deliverable: coverage of loopback-only binding, egress containment, and write containment.

Definition of done:
- [ ] P1-15 (loopback only), P1-16 (no writes outside app-data), P1-18 (zero external egress), and
      P1-26 (direct access blocked) pass.
- [ ] The negative tests fail when the control is removed.
- [ ] The Ollama process tree is covered, not just the daemon.

**G5 — Provisioning tests**

Deliverable: coverage of both delivery paths.

Definition of done:
- [ ] P1-21 (small installer via gateway, no `ollama pull`) and P1-22 (offline bundle) pass.
- [ ] P1-28 passes: both delivery paths are selectable at install time; the choice is recorded and
      reversible.
- [ ] Idempotent re-provisioning is asserted.
- [ ] A corrupt bundle and a failed download both fail safely.

**G6 — End-to-end smoke test**

Deliverable: proof that the whole path works.

Definition of done:
- [ ] App → proxy (authenticated) → Ollama → a streamed response, using a small model.
- [ ] The smoke test runs offline and deterministically in CI.
- [ ] It asserts the audit entry was written with caller `lip`.
- [ ] It asserts the response streamed rather than arriving as one buffered blob.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1-B1 | A2, B1 |
| A2 | A1, S0.2-A2 (tier profile) | B1, A3 |
| A3 | A2, S0.1-B3/B4 | G4 |
| B1 | A1, A2 | B2, B5 |
| B2 | B1 | B5, C5 |
| B3 | B2 | B5 |
| B4 | B1 | B5, G2 |
| B5 | B2, B3, B4 | C1–C3, D1, F1 |
| C1 | B5 | C3, G5 |
| C2 | B5, S0.1 (gateway) | C3, G5 |
| C3 | C1, C2 | C4, C5 |
| C4 | C3 | — |
| C5 | C3, B2 | G5 |
| D1 | B5, S0.1 (audit) | D2–D7 |
| D2 | D1 | D3, G3 |
| D3 | D1 | G3 |
| D4 | D1 | G3 |
| D5 | D1, S0.1-F1 | G3 |
| D6 | D1 | G3, G6 |
| D7 | D6 | G3 |
| E1 | B5 | G4 |
| E2 | B5 | G4 |
| E3 | A2 | G4 |
| E4 | E1, E2, E3 | — |
| F1 | B5, S0.2-D4 | G2 |
| F2 | B5, S0.2-B2 | G2 |
| F3 | F1, F2 | — |
| F4 | B5 | S1.3 |
| G1 | B1, D1, E1 | G2–G6 |
| G2 | G1, B1–B5, F1–F3 | — |
| G3 | G1, D1–D7 | — |
| G4 | G1, E1–E3, A3 | — |
| G5 | G1, C1–C5 | — |
| G6 | D6, C5 | — |

Parallel opportunities: Group 3 (model provisioning) and Group 4 (proxy) can proceed concurrently
once Group 2 lands. Group 5's E1 spike can start as soon as the server port is known.

---

## 4. Slice-level Definition of Done

S0.3 is complete when **all** of the following hold:

- [ ] A bundled Ollama runs with no user-installed runtime (P1-20).
- [ ] The server binds loopback only on a non-default port and is unreachable on the LAN (P1-15).
- [ ] Only the app can reach the server's port; direct access from another process fails (P1-26).
- [ ] The Ollama process tree performs zero external network access under the OS restriction
      (P1-18).
- [ ] The model store is redirected into app-data and a full run writes nothing outside it (P1-16).
- [ ] The proxy authenticates every request, rejects missing/old tokens, and rotates per launch
      (P1-23, P1-25).
- [ ] `/api/pull` and non-allowlisted endpoints are denied (P1-24).
- [ ] Every proxied request is audited with caller `lip`, without the token or body (P1-27).
- [ ] The server restarts after a crash within the bound, without losing conversation state
      (P1-17).
- [ ] Both provisioning paths work: offline bundle (P1-22) and gateway download with no
      `ollama pull` (P1-21).
- [ ] Idle eviction unloads the model and the next request reloads transparently (P1-19).
- [ ] An app → proxy → Ollama streamed response works end to end, offline and deterministically
      (G6).

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| WFP process-scoped loopback filtering proves impractical | Cannot guarantee only-the-app access | AppContainer fallback; document residual risk honestly (E1) |
| Ollama writes state outside `OLLAMA_MODELS` | Breaks the no-writes-outside guarantee | Audit all Ollama paths; redirect or exclude explicitly (A3) |
| Ollama's runner subprocesses escape the egress rule | Silent external egress | Apply containment to the whole tree, and test it (E2) |
| Bundling the full Ollama distribution inflates the installer | Packaging friction | Pin and document size; consider the small-installer default |
| Crash-restart loop masks a persistent fault | User sees repeated failures | Bounded restarts then `unavailable` with stderr tail (B3) |
| Proxy buffering breaks token streaming | Chat feels non-streaming | Assert streaming is preserved in tests (D6, G6) |
| Orphaned server processes after a forced kill | Port conflicts, memory leak | Orphan detection and reclamation at startup (B4) |
| Token leakage into logs or audit | Credential exposure | Explicit non-persistence tests (D2-T2, D5) |

---

## 6. Traceability

| Phase 1 test | Covered by |
|---|---|
| P1-15 (loopback only) | A2, D1, G4 |
| P1-16 (no writes outside app-data) | A3, G4 |
| P1-17 (server crash restart) | B3, G2 |
| P1-18 (server external egress) | E2, E4, G4 |
| P1-19 (idle eviction reload) | F3, F4, G2 |
| P1-20 (no external install) | A1, G6 |
| P1-21 (small-installer path) | C2, G5 |
| P1-22 (offline-bundle path) | C1, G5 |
| P1-28 (install-time choice) | C5, G5 |
| P1-23 (proxy auth) | D2, G3 |
| P1-24 (proxy allowlist) | D3, G3 |
| P1-25 (token rotation) | D2, G3 |
| P1-26 (direct access blocked) | E1, G4 |
| P1-27 (proxy audit) | D5, G3 |

Scenarios S0–S7 are **not** run in this slice; they run in S0.4 using this slice's server and the
S0.2 governor.
